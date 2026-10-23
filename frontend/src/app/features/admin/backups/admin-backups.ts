import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { switchMap, take, takeWhile, timer } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { formatBankTime } from '../../donations/donation-date';
import { saveBlob } from '../../donations/file-download';
import { RESTORE_MAX_POLLS, SetupApi } from '../../operations/setup/setup-api';
import {
  AdminApi,
  AdminBackupsResponse,
  BackupFileResponse,
  BackupKind,
  BackupRequestKind,
  BackupRunResponse,
  RestoreFileResponse,
} from '../admin-api';
import { formatSize } from './backup-format';
import { BACKUP_PROBLEM_TEXTS } from './backup-texts';
import { RestoreDialog } from './restore-dialog';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';

type LoadState = 'loading' | 'ready' | 'error';

interface RunningJob {
  kind: BackupRequestKind;
}

interface RequestedRestore {
  requestId: string;
  fileName: string;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
export const JOB_POLL_MS = 3000;
export const JOB_MAX_POLLS = 20;
export const RESTORE_REQUEST_KEY = 'nfnn.restore-request';

const KIND_NAMES: Record<BackupKind, string> = {
  DAILY: $localize`:@@admin.backups.kind.daily:Noční`,
  REQUESTED: $localize`:@@admin.backups.kind.requested:Na požádání`,
  BEFORE_RESTORE: $localize`:@@admin.backups.kind.beforeRestore:Před obnovou`,
  OTHER: $localize`:@@admin.backups.kind.other:Jiná`,
};

@Component({
  selector: 'app-admin-backups',
  imports: [LiveNotice, RestoreDialog],
  templateUrl: './admin-backups.html',
  styleUrl: './admin-backups.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBackups {
  private readonly api = inject(AdminApi);
  private readonly setupApi = inject(SetupApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<AdminBackupsResponse | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly job = signal<RunningJob | null>(null);
  protected readonly downloading = signal<string | null>(null);
  protected readonly restoreCandidate = signal<BackupFileResponse | null>(null);
  protected readonly restoreBusy = signal(false);
  protected readonly restoreError = signal<string | null>(null);
  protected readonly restoring = signal<RequestedRestore | null>(null);
  protected readonly restoreSlow = signal(false);

  protected readonly available = computed(() => this.view()?.available ?? false);
  protected readonly backups = computed(() => this.view()?.backups ?? []);
  protected readonly restoreFiles = computed(() => this.view()?.restoreFiles ?? []);
  protected readonly pendingRequests = computed(() => this.view()?.pendingRequests ?? 0);
  protected readonly problems = computed(() =>
    (this.view()?.problems ?? []).map((problem) => BACKUP_PROBLEM_TEXTS[problem]),
  );
  protected readonly lastBackup = computed(() => this.describeBackup(this.view()?.lastBackup));
  protected readonly lastTestRestore = computed(() =>
    this.describeTestRestore(this.view()?.lastTestRestore),
  );
  protected readonly lastRestore = computed(() => this.describeRestore(this.view()?.lastRestore));
  protected readonly restorePending = computed(() => this.view()?.restorePending ?? false);
  protected readonly actionsDisabled = computed(
    () => !this.available() || this.job() !== null || this.restorePending(),
  );

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .backups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          this.view.set(view);
          this.state.set('ready');
          this.reportRequestedRestore(view);
        },
        error: (failure: unknown) => {
          if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
            this.sendToSignIn();
            return;
          }
          if (problemTypeEndsWith(failure, FORBIDDEN)) {
            this.router.navigateByUrl('/darce/prehled');
            return;
          }
          this.state.set('error');
        },
      });
  }

  protected kindName(item: BackupFileResponse): string {
    return KIND_NAMES[item.kind];
  }

  protected restoreLabel(item: BackupFileResponse): string {
    return $localize`:@@admin.backups.restore.label:Obnovit databázi ze zálohy ${item.fileName}:file:`;
  }

  protected downloadLabel(item: BackupFileResponse): string {
    return $localize`:@@admin.backups.download.label:Stáhnout ${item.fileName}:file:`;
  }

  protected time(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }

  protected size(bytes: number): string {
    return formatSize(bytes);
  }

  protected describeRestoreFile(file: RestoreFileResponse): string {
    const at = formatBankTime(file.changedAt);
    switch (file.state) {
      case 'PENDING':
        return $localize`:@@admin.backups.restore.pending:${file.fileName}:file: čeká a obnoví se při příštím startu kontejneru nfnn-backup.`;
      case 'DONE':
        return $localize`:@@admin.backups.restore.done:${file.fileName}:file: byl obnoven ${at}:time:.`;
      case 'FAILED':
        return $localize`:@@admin.backups.restore.failedKept:${file.fileName}:file: se ${at}:time: obnovit nepodařilo; data zůstala, jak byla.`;
      case 'SKIPPED':
        return $localize`:@@admin.backups.restore.skipped:${file.fileName}:file: byl ${at}:time: přeskočen: databáze nebyla prázdná nebo ve složce leželo víc souborů.`;
    }
  }

  protected askRestore(item: BackupFileResponse): void {
    if (this.actionsDisabled()) {
      return;
    }
    this.restoreError.set(null);
    this.restoreCandidate.set(item);
  }

  protected cancelRestore(): void {
    this.restoreCandidate.set(null);
    this.restoreError.set(null);
  }

  protected confirmRestore(): void {
    const item = this.restoreCandidate();
    if (item === null || this.restoreBusy()) {
      return;
    }
    this.restoreBusy.set(true);
    this.restoreError.set(null);
    this.api
      .restoreBackup(item.fileName)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (request) => {
          const requested = { requestId: request.requestId, fileName: request.fileName };
          this.restoreBusy.set(false);
          this.restoreCandidate.set(null);
          this.notice.set(null);
          rememberRestore(requested);
          this.restoring.set(requested);
          this.watchRestore();
        },
        error: (failure: unknown) => {
          this.restoreBusy.set(false);
          this.restoreError.set(
            describeProblem(
              failure,
              $localize`:@@admin.backups.restoreDialog.failed:Obnovu se nepodařilo předat. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  protected watchRestore(): void {
    this.restoreSlow.set(false);
    this.setupApi
      .watchRestart(RESTORE_MAX_POLLS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => {
        if (outcome === 'restarted') {
          this.restoring.set(null);
          this.load();
        } else {
          this.restoreSlow.set(true);
        }
      });
  }

  protected start(kind: BackupRequestKind): void {
    if (this.actionsDisabled()) {
      return;
    }
    this.notice.set(null);
    this.job.set({ kind });
    this.api
      .requestBackup(kind)
      .pipe(
        switchMap((request) =>
          timer(JOB_POLL_MS, JOB_POLL_MS).pipe(
            take(JOB_MAX_POLLS),
            switchMap(() => this.api.backups()),
            takeWhile((view) => !this.finished(view, kind, request.requestId), true),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (view) => this.view.set(view),
        complete: () => this.finishJob(kind),
        error: (failure: unknown) => {
          this.job.set(null);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.backups.request.failed:Požadavek se nepodařilo předat. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected download(item: BackupFileResponse): void {
    if (this.downloading() !== null) {
      return;
    }
    this.notice.set(null);
    this.downloading.set(item.fileName);
    this.api
      .downloadBackup(item.fileName)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (file) => {
          this.downloading.set(null);
          saveBlob(file);
        },
        error: (failure: unknown) => {
          this.downloading.set(null);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.backups.download.failed:Zálohu se nepodařilo stáhnout. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  private finished(
    view: AdminBackupsResponse,
    kind: BackupRequestKind,
    requestId: string,
  ): boolean {
    return this.runOf(view, kind)?.requestId === requestId;
  }

  private runOf(view: AdminBackupsResponse, kind: BackupRequestKind): BackupRunResponse | null {
    return kind === 'BACKUP' ? view.lastBackup : view.lastTestRestore;
  }

  private finishJob(kind: BackupRequestKind): void {
    const job = this.job();
    this.job.set(null);
    const view = this.view();
    if (job === null || view === null) {
      return;
    }
    const run = this.runOf(view, kind);
    const pending = view.pendingRequests > 0;
    if (run === null || pending) {
      this.notice.set({
        kind: 'alert',
        text: $localize`:@@admin.backups.request.notPickedUp:Kontejner nfnn-backup si požadavek do minuty nevzal. Zkontrolujte na serveru sudo docker logs nfnn-backup; výsledek se ukáže po obnovení stránky.`,
      });
      return;
    }
    this.notice.set(this.outcomeNotice(kind, run));
  }

  private outcomeNotice(kind: BackupRequestKind, run: BackupRunResponse): Notice {
    const error = run.error ?? '';
    if (kind === 'BACKUP') {
      return run.outcome === 'OK'
        ? {
            kind: 'status',
            text: $localize`:@@admin.backups.backup.done:Záloha ${run.fileName ?? ''}:file: je hotová (${formatSize(run.sizeBytes ?? 0)}:size:).`,
          }
        : {
            kind: 'alert',
            text: $localize`:@@admin.backups.backup.failed:Záloha selhala: ${error}:error:`,
          };
    }
    return run.outcome === 'OK'
      ? {
          kind: 'status',
          text: $localize`:@@admin.backups.testRestore.done:Zkušební obnova zálohy ${run.fileName ?? ''}:file: proběhla: ${run.tables ?? 0}:tables: tabulek.`,
        }
      : {
          kind: 'alert',
          text: $localize`:@@admin.backups.testRestore.failed:Zkušební obnova selhala: ${error}:error:`,
        };
  }

  private reportRequestedRestore(view: AdminBackupsResponse): void {
    const requested = takeRememberedRestore();
    if (requested === null) {
      return;
    }
    const run = view.lastRestore;
    if (run === null || run.requestId !== requested.requestId) {
      this.notice.set({
        kind: 'alert',
        text: $localize`:@@admin.backups.restore.notPickedUp:Kontejner nfnn-backup si obnovu do pěti minut nevzal, takže web běží s daty, jaká měl. Zkuste to prosím znovu; když se to opakuje, kontejner asi neběží.`,
      });
      return;
    }
    this.notice.set(
      run.outcome === 'OK'
        ? {
            kind: 'status',
            text: $localize`:@@admin.backups.restore.succeeded:Databáze je obnovená ze zálohy ${requested.fileName}:file:. Stav před obnovou je uložený jako záloha „Před obnovou“.`,
          }
        : {
            kind: 'alert',
            text: $localize`:@@admin.backups.restore.failedNow:Obnova ze zálohy ${requested.fileName}:file: se nepovedla: ${run.error ?? ''}:error:. Web běží dál s daty, jaká měl před obnovou.`,
          },
    );
  }

  private describeRestore(run: BackupRunResponse | null | undefined): string {
    if (!run) {
      return $localize`:@@admin.backups.lastRestore.none:Poslední obnova: zatím žádná.`;
    }
    const at = formatBankTime(run.finishedAt);
    if (run.outcome === 'FAILED') {
      return $localize`:@@admin.backups.lastRestore.failed:Poslední obnova ${at}:time: se nepovedla, data zůstala: ${run.error ?? ''}:error:`;
    }
    return $localize`:@@admin.backups.lastRestore.ok:Poslední obnova: ${at}:time: ze zálohy ${run.fileName ?? ''}:file:.`;
  }

  private describeBackup(run: BackupRunResponse | null | undefined): string {
    if (!run) {
      return $localize`:@@admin.backups.lastBackup.none:Poslední záloha: zatím žádná.`;
    }
    const at = formatBankTime(run.finishedAt);
    if (run.outcome === 'FAILED') {
      return $localize`:@@admin.backups.lastBackup.failed:Poslední záloha selhala ${at}:time:: ${run.error ?? ''}:error:`;
    }
    return $localize`:@@admin.backups.lastBackup.ok:Poslední záloha: ${at}:time:, ${run.fileName ?? ''}:file: (${formatSize(run.sizeBytes ?? 0)}:size:).`;
  }

  private describeTestRestore(run: BackupRunResponse | null | undefined): string {
    if (!run) {
      return $localize`:@@admin.backups.lastTestRestore.none:Poslední zkušební obnova: zatím žádná. Běží každou neděli ve 4:00.`;
    }
    const at = formatBankTime(run.finishedAt);
    if (run.outcome === 'FAILED') {
      return $localize`:@@admin.backups.lastTestRestore.failed:Poslední zkušební obnova selhala ${at}:time:: ${run.error ?? ''}:error:`;
    }
    return $localize`:@@admin.backups.lastTestRestore.ok:Poslední zkušební obnova: ${at}:time:, ${run.tables ?? 0}:tables: tabulek ze zálohy ${run.fileName ?? ''}:file:.`;
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function rememberRestore(restore: RequestedRestore): void {
  try {
    sessionStorage.setItem(RESTORE_REQUEST_KEY, JSON.stringify(restore));
  } catch {
    return;
  }
}

function takeRememberedRestore(): RequestedRestore | null {
  try {
    const stored = sessionStorage.getItem(RESTORE_REQUEST_KEY);
    sessionStorage.removeItem(RESTORE_REQUEST_KEY);
    if (stored === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as RequestedRestore).requestId === 'string' &&
      typeof (parsed as RequestedRestore).fileName === 'string'
    ) {
      return parsed as RequestedRestore;
    }
    return null;
  } catch {
    return null;
  }
}
