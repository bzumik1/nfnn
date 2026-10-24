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
import { Router, RouterLink } from '@angular/router';
import { problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { formatMinorUnits } from '../../donations/donation-amount';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import {
  AdminApi,
  AdminBackupsResponse,
  AdminOverviewResponse,
  BackupRunResponse,
  ImportFailureKind,
  ImportStateResponse,
  TallyResponse,
} from '../admin-api';
import { formatSize } from '../backups/backup-format';
import { BACKUP_PROBLEM_TEXTS } from '../backups/backup-texts';
import { formatReportMonth } from '../report/report-month';

type LoadState = 'loading' | 'ready' | 'error';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';

const FAILURE_LABELS: Record<ImportFailureKind, string> = {
  RATE_LIMITED: $localize`:@@admin.home.import.failure.rateLimited:Fio odmítlo příliš častý dotaz`,
  HISTORY_LOCKED: $localize`:@@admin.home.import.failure.historyLocked:Historie starší než 90 dní je ve Fio zamčená`,
  UNAUTHORIZED: $localize`:@@admin.home.import.failure.unauthorized:Fio odmítlo token (chybí, ještě neplatí nebo vypršel)`,
  TRANSPORT: $localize`:@@admin.home.import.failure.transport:Fio nebylo dostupné`,
  INVALID_RESPONSE: $localize`:@@admin.home.import.failure.invalidResponse:Fio poslalo odpověď, které web nerozumí`,
  UNEXPECTED: $localize`:@@admin.home.import.failure.unexpected:Neočekávaná chyba`,
};

@Component({
  selector: 'app-admin-home',
  imports: [RouterLink],
  templateUrl: './admin-home.html',
  styleUrl: './admin-home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHome {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly donor = this.auth.donor;
  protected readonly state = signal<LoadState>('loading');
  protected readonly importState = signal<ImportStateResponse | null>(null);
  protected readonly overviewState = signal<LoadState>('loading');
  protected readonly overview = signal<AdminOverviewResponse | null>(null);
  protected readonly backupsState = signal<LoadState>('loading');
  protected readonly backups = signal<AdminBackupsResponse | null>(null);

  protected readonly backupProblems = computed(() =>
    (this.backups()?.problems ?? []).map((problem) => BACKUP_PROBLEM_TEXTS[problem]),
  );
  protected readonly lastBackup = computed(() => {
    const run = this.backups()?.lastBackup;
    if (!run) {
      return $localize`:@@admin.home.backups.lastBackup.none:zatím žádná`;
    }
    return run.outcome === 'FAILED'
      ? failedRun(run)
      : `${formatBankTime(run.finishedAt)} (${formatSize(run.sizeBytes ?? 0)})`;
  });
  protected readonly lastTestRestore = computed(() => {
    const run = this.backups()?.lastTestRestore;
    if (!run) {
      return $localize`:@@admin.home.backups.lastTestRestore.none:zatím žádná`;
    }
    return run.outcome === 'FAILED'
      ? failedRun(run)
      : $localize`:@@admin.home.backups.lastTestRestore.ok:${formatBankTime(run.finishedAt)}:time:, ${run.tables ?? 0}:tables: tabulek`;
  });

  protected readonly coveredPeriod = computed(() => {
    const state = this.importState();
    return state?.coveredFrom && state.coveredTo
      ? `${formatDonationDate(state.coveredFrom)} – ${formatDonationDate(state.coveredTo)}`
      : null;
  });
  protected readonly lastSuccess = computed(() => time(this.importState()?.lastSucceededAt));
  protected readonly lastAttempt = computed(() => time(this.importState()?.lastAttemptedAt));
  protected readonly lastFailure = computed(() => {
    const failure = this.importState()?.lastFailure;
    return failure ? FAILURE_LABELS[failure.kind] : null;
  });
  protected readonly lastFailureMessage = computed(
    () => this.importState()?.lastFailure?.message ?? null,
  );
  protected readonly outage = computed(() => {
    const state = this.importState();
    return state?.reportedOutage ? FAILURE_LABELS[state.reportedOutage] : null;
  });
  protected readonly consecutiveFailures = computed(
    () => this.importState()?.consecutiveFailures ?? 0,
  );

  constructor() {
    this.load();
    this.loadOverview();
    this.loadBackups();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected loadOverview(year: number | null = null): void {
    this.overviewState.set('loading');
    this.api
      .overview(year)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.overview.set(data);
          this.overviewState.set('ready');
        },
        error: () => this.overviewState.set('error'),
      });
  }

  protected loadBackups(): void {
    this.backupsState.set('loading');
    this.api
      .backups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          this.backups.set(view);
          this.backupsState.set('ready');
        },
        error: () => this.backupsState.set('error'),
      });
  }

  protected changeYear(event: Event): void {
    this.loadOverview(Number((event.target as HTMLSelectElement).value));
  }

  protected monthLabel(isoMonth: string): string {
    return formatReportMonth(isoMonth);
  }

  protected amount(tally: TallyResponse): string {
    return `${formatMinorUnits(tally.totalMinor)}\u00a0Kč`;
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .importState()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (state) => {
          this.importState.set(state);
          this.state.set('ready');
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

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function failedRun(run: BackupRunResponse): string {
  return $localize`:@@admin.home.backups.failed:selhala ${formatBankTime(run.finishedAt)}:time:`;
}

function time(isoInstant: string | null | undefined): string | null {
  return isoInstant ? formatBankTime(isoInstant) : null;
}
