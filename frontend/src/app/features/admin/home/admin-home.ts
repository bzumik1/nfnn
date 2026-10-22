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
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { DashboardTopBar } from '../../donors/dashboard/top-bar/top-bar';
import { AdminApi, ImportFailureKind, ImportStateResponse } from '../admin-api';

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
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
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
            this.router.navigateByUrl('/donor/prehled');
            return;
          }
          this.state.set('error');
        },
      });
  }

  private sendToSignIn(): void {
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open();
    });
  }
}

function time(isoInstant: string | null | undefined): string | null {
  return isoInstant ? formatBankTime(isoInstant) : null;
}
