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
import { formatCrowns } from '../../donations/donation-amount';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { DashboardTopBar } from '../../donors/dashboard/top-bar/top-bar';
import {
  AdminApi,
  AdminOverviewResponse,
  ImportFailureKind,
  ImportStateResponse,
  TallyResponse,
} from '../admin-api';
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
  imports: [DashboardTopBar, RouterLink],
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

  protected changeYear(event: Event): void {
    this.loadOverview(Number((event.target as HTMLSelectElement).value));
  }

  protected monthLabel(isoMonth: string): string {
    return formatReportMonth(isoMonth);
  }

  protected amount(tally: TallyResponse): string {
    return `${formatCrowns(tally.totalMinor / 100)}\u00a0Kč`;
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

function time(isoInstant: string | null | undefined): string | null {
  return isoInstant ? formatBankTime(isoInstant) : null;
}
