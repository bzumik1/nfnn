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
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { switchMap, take, takeWhile, timer } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { formatBankTime } from '../../donations/donation-date';
import { RESTORE_MAX_POLLS, SetupApi } from '../../operations/setup/setup-api';
import {
  AdminApi,
  AdminBackupsResponse,
  BackupFileResponse,
  BackupKeyStatus,
  BackupRequestKind,
  BackupRunResponse,
  BackupScheduleResponse,
  RestoreFileResponse,
} from '../admin-api';
import { formatSize } from './backup-format';
import { BackupDownloads } from './backup-downloads';
import { backupKindName } from './backup-kinds';
import { BackupSheet } from './backup-sheet/backup-sheet';
import { formatPlanTime, onDay } from './backup-plan';
import { BackupKeyCard } from './backup-key-card';
import { BackupScheduleCard } from './backup-schedule-card';
import { BACKUP_PROBLEM_HELP, BACKUP_PROBLEM_TEXTS } from './backup-texts';
import { needsTechnician, technicianMessage } from './backup-message';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { RestoreDialog } from './restore-dialog';
import { ADMIN_BACKUP_HISTORY_PATH, RESTORE_STATE_KEY } from './backup-paths';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import { AdministrationPageReads } from '../device-copy/administration-page-reads';

type LoadState = 'loading' | 'ready' | 'error';

interface RunningJob {
  kind: BackupRequestKind;
}

const ERROR_NEEDS_CONNECTION = $localize`:@@admin.backups.errorNeedsConnection:Technické podrobnosti chyby se ukážou s připojením.`;

interface RunLine {
  text: string;
  error: string | null;
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

const NONE_YET = $localize`:@@admin.backups.run.none:Zatím žádná.`;

function failedAt(at: string): string {
  return $localize`:@@admin.backups.run.failed:Nepovedla se ${at}:time:.`;
}

@Component({
  selector: 'app-admin-backups',
  imports: [
    NeedsConnection,
    LiveNotice,
    RestoreDialog,
    BackupKeyCard,
    BackupScheduleCard,
    NgTemplateOutlet,
    CopyButton,
    RouterLink,
    BackupSheet,
  ],
  providers: [BackupDownloads],
  templateUrl: './admin-backups.html',
  styleUrl: './admin-backups.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBackups {
  private readonly api = inject(AdminApi);
  private readonly reads = inject(AdministrationPageReads);
  private readonly setupApi = inject(SetupApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private restoreAskedFor: string | null = restoreHandedOver(this.router);

  protected readonly downloads = inject(BackupDownloads);
  protected readonly historyPath = ADMIN_BACKUP_HISTORY_PATH;

  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<AdminBackupsResponse | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly job = signal<RunningJob | null>(null);
  protected readonly opened = signal<BackupFileResponse | null>(null);
  protected readonly restoreCandidate = signal<BackupFileResponse | null>(null);
  protected readonly restoreBusy = signal(false);
  protected readonly restoreError = signal<string | null>(null);
  protected readonly restoring = signal<RequestedRestore | null>(null);
  protected readonly restoreSlow = signal(false);
  protected readonly errorNeedsConnection = ERROR_NEEDS_CONNECTION;
  private readonly errorsHeld = signal(false);

  protected readonly available = computed(() => this.view()?.available ?? false);
  protected readonly backups = computed(() => this.view()?.backups ?? []);
  protected readonly latest = computed(() => this.backups()[0] ?? null);
  protected readonly restoreFiles = computed(() => this.view()?.restoreFiles ?? []);
  protected readonly pendingRequests = computed(() => this.view()?.pendingRequests ?? 0);
  protected readonly problems = computed(() =>
    (this.view()?.problems ?? []).map((problem) => BACKUP_PROBLEM_HELP[problem]),
  );
  protected readonly problemDetails = computed(() =>
    (this.view()?.problems ?? []).map((problem) => BACKUP_PROBLEM_TEXTS[problem]),
  );
  protected readonly technicianMessage = computed(() => {
    const view = this.view();
    return view !== null && needsTechnician(view) ? technicianMessage(view) : null;
  });
  protected readonly lastBackup = computed(() => this.describeBackup(this.view()?.lastBackup));
  protected readonly lastTestRestore = computed(() =>
    this.describeTestRestore(this.view()?.lastTestRestore),
  );
  protected readonly lastRestore = computed(() => this.describeRestore(this.view()?.lastRestore));
  protected readonly restorePending = computed(() => this.view()?.restorePending ?? false);
  protected readonly schedule = computed(() => this.view()?.schedule ?? null);
  protected readonly key = computed(() => this.view()?.key ?? null);
  protected readonly actionsDisabled = computed(
    () => !this.available() || this.job() !== null || this.restorePending(),
  );

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.reads
      .backups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          this.view.set(view);
          this.errorsHeld.set(view.fromCopy);
          this.state.set('ready');
          this.reportRequestedRestore(view);
          this.askHandedOverRestore(view);
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

  protected scheduleSaved(schedule: BackupScheduleResponse): void {
    this.view.update((view) => (view === null ? view : { ...view, schedule }));
  }

  protected keyChanged(key: BackupKeyStatus): void {
    this.view.update((view) => (view === null ? view : { ...view, key }));
  }

  protected kindName(item: BackupFileResponse): string {
    return backupKindName(item.kind);
  }

  protected openBackup(item: BackupFileResponse): void {
    this.downloads.forget();
    this.opened.set(item);
  }

  protected closeBackup(): void {
    this.opened.set(null);
  }

  protected restoreOpened(): void {
    const item = this.opened();
    this.opened.set(null);
    if (item !== null) {
      this.askRestore(item);
    }
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
        return $localize`:@@admin.backups.restore.pending:${file.fileName}:file: čeká a obnoví se, až se na serveru příště spustí zálohování.`;
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
        next: (view) => {
          this.view.set(view);
          this.errorsHeld.set(false);
        },
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
        text: $localize`:@@admin.backups.request.notPickedUp:Zálohování na serveru na požadavek do minuty neodpovědělo. Obnovte stránku za chvíli; když se výsledek neukáže, pošlete tuto stránku správci serveru (služba záloh nfnn-backup asi neběží).`,
      });
      return;
    }
    this.notice.set(this.outcomeNotice(kind, run));
  }

  private outcomeNotice(kind: BackupRequestKind, run: BackupRunResponse): Notice {
    if (kind === 'BACKUP') {
      return run.outcome === 'OK'
        ? {
            kind: 'status',
            text: $localize`:@@admin.backups.backup.done:Záloha ${run.fileName ?? ''}:file: je hotová (${formatSize(run.sizeBytes ?? 0)}:size:).`,
          }
        : {
            kind: 'alert',
            text: $localize`:@@admin.backups.backup.failed:Záloha se nepovedla. Technické podrobnosti najdete níže u Poslední záloha.`,
          };
    }
    return run.outcome === 'OK'
      ? {
          kind: 'status',
          text: $localize`:@@admin.backups.testRestore.done:Zkušební obnova zálohy ${run.fileName ?? ''}:file: proběhla: ${run.tables ?? 0}:tables: tabulek.`,
        }
      : {
          kind: 'alert',
          text: $localize`:@@admin.backups.testRestore.failed:Zkušební obnova se nepovedla. Technické podrobnosti najdete níže u Poslední zkušební obnova.`,
        };
  }

  private askHandedOverRestore(view: AdminBackupsResponse): void {
    const fileName = this.restoreAskedFor;
    this.restoreAskedFor = null;
    const item = view.backups.find((backup) => backup.fileName === fileName);
    if (item !== undefined) {
      this.askRestore(item);
    }
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
        text: $localize`:@@admin.backups.restore.notPickedUp:Zálohování na serveru na obnovu do pěti minut neodpovědělo, takže web běží s daty, jaká měl. Zkuste to prosím znovu; když se to opakuje, pošlete tuto stránku správci serveru (služba záloh nfnn-backup asi neběží).`,
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
            text: $localize`:@@admin.backups.restore.failedNow:Obnova ze zálohy ${requested.fileName}:file: se nepovedla. Web běží dál s daty, jaká měl před obnovou; technické podrobnosti najdete níže u Poslední obnova.`,
          },
    );
  }

  private describeRestore(run: BackupRunResponse | null | undefined): RunLine {
    if (!run) {
      return { text: NONE_YET, error: null };
    }
    const at = formatBankTime(run.finishedAt);
    if (run.outcome === 'FAILED') {
      return {
        text: $localize`:@@admin.backups.lastRestore.failed:Nepovedla se ${at}:time:, data zůstala, jak byla.`,
        error: this.runError(run),
      };
    }
    return {
      text: $localize`:@@admin.backups.lastRestore.ok:${at}:time: ze zálohy ${run.fileName ?? ''}:file:`,
      error: null,
    };
  }

  private runError(run: BackupRunResponse): string | null {
    return run.error ?? (this.errorsHeld() ? ERROR_NEEDS_CONNECTION : null);
  }

  private describeBackup(run: BackupRunResponse | null | undefined): RunLine {
    if (!run) {
      return { text: NONE_YET, error: null };
    }
    const at = formatBankTime(run.finishedAt);
    if (run.outcome === 'FAILED') {
      return { text: failedAt(at), error: this.runError(run) };
    }
    return {
      text: $localize`:@@admin.backups.lastBackup.ok:${at}:time: (${formatSize(run.sizeBytes ?? 0)}:size:)`,
      error: null,
    };
  }

  private describeTestRestore(run: BackupRunResponse | null | undefined): RunLine {
    if (!run) {
      const plan = this.view()?.schedule;
      if (!plan) {
        return { text: NONE_YET, error: null };
      }
      return {
        text: $localize`:@@admin.backups.lastTestRestore.planned:Zatím žádná. Podle plánu běží ${onDay(plan.testRestoreDay)}:day: ${formatPlanTime(plan.testRestoreTime)}:time:.`,
        error: null,
      };
    }
    const at = formatBankTime(run.finishedAt);
    if (run.outcome === 'FAILED') {
      return { text: failedAt(at), error: this.runError(run) };
    }
    return {
      text: $localize`:@@admin.backups.lastTestRestore.ok:${at}:time:, ${run.tables ?? 0}:tables: tabulek ze zálohy ${run.fileName ?? ''}:file:`,
      error: null,
    };
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function restoreHandedOver(router: Router): string | null {
  const fileName: unknown = router.currentNavigation()?.extras.state?.[RESTORE_STATE_KEY];
  return typeof fileName === 'string' ? fileName : null;
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
