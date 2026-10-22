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
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { formatCrowns } from '../../donations/donation-amount';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { DashboardTopBar } from '../../donors/dashboard/top-bar/top-bar';
import {
  AdminApi,
  AdminDonorResponse,
  AdminPaymentListResponse,
  AdminPaymentResponse,
  PairingFilter,
  PairingMethod,
} from '../admin-api';

type LoadState = 'loading' | 'ready' | 'error';

interface Notice {
  kind: 'status' | 'alert';
  text: string;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const SEARCH_DEBOUNCE_MS = 300;

const METHOD_LABELS: Record<PairingMethod, string> = {
  VARIABLE_SYMBOL: $localize`:@@admin.payments.method.variableSymbol:podle variabilního symbolu`,
  SENDER_ACCOUNT: $localize`:@@admin.payments.method.senderAccount:podle účtu`,
  CONFIRMED_SYMBOL: $localize`:@@admin.payments.method.confirmedSymbol:podle potvrzeného staršího symbolu`,
  MANUAL: $localize`:@@admin.payments.method.manual:ručně správcem`,
};

@Component({
  selector: 'app-admin-payments',
  imports: [DashboardTopBar, RouterLink, Dialog],
  templateUrl: './admin-payments.html',
  styleUrl: './admin-payments.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPayments {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly pairSearch = viewChild<ElementRef<HTMLInputElement>>('pairSearch');
  private readonly queries = new Subject<string>();

  protected readonly filter = signal<PairingFilter>('unpaired');
  protected readonly year = signal<number | null>(null);
  protected readonly state = signal<LoadState>('loading');
  protected readonly list = signal<AdminPaymentListResponse | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly busy = signal(false);

  protected readonly pairing = signal<AdminPaymentResponse | null>(null);
  protected readonly query = signal('');
  protected readonly results = signal<AdminDonorResponse[] | null>(null);
  protected readonly searchFailed = signal(false);
  protected readonly selectedDonor = signal<string | null>(null);
  protected readonly pairError = signal<string | null>(null);

  protected readonly unpairing = signal<string | null>(null);

  protected readonly items = computed(() => this.list()?.items ?? []);
  protected readonly availableYears = computed(() => this.list()?.availableYears ?? []);
  protected readonly shownYear = computed(() => this.list()?.year ?? null);
  protected readonly selectedDonorRecord = computed(
    () => this.results()?.find((donor) => donor.donorId === this.selectedDonor()) ?? null,
  );

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
    this.queries
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((query) => this.api.searchDonors(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.searchFailed.set(false);
          this.results.set(response.items);
        },
        error: () => {
          this.searchFailed.set(true);
          this.results.set([]);
        },
      });
  }

  protected show(filter: PairingFilter): void {
    if (this.filter() === filter) {
      return;
    }
    this.filter.set(filter);
    this.year.set(null);
    this.notice.set(null);
    this.unpairing.set(null);
    this.load();
  }

  protected showYear(value: string): void {
    this.year.set(Number(value));
    this.unpairing.set(null);
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .payments(this.filter(), this.year())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.list.set(list);
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

  protected openPairing(payment: AdminPaymentResponse): void {
    this.pairing.set(payment);
    this.query.set('');
    this.results.set(null);
    this.searchFailed.set(false);
    this.selectedDonor.set(null);
    this.pairError.set(null);
    this.notice.set(null);
    afterNextRender(() => this.pairSearch()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closePairing(): void {
    if (this.busy()) {
      return;
    }
    this.pairing.set(null);
  }

  protected search(value: string): void {
    this.query.set(value);
    this.selectedDonor.set(null);
    if (value.trim() === '') {
      this.results.set(null);
      return;
    }
    this.queries.next(value.trim());
  }

  protected select(donorId: string): void {
    this.selectedDonor.set(donorId);
    this.pairError.set(null);
  }

  protected pair(): void {
    const payment = this.pairing();
    const donor = this.selectedDonorRecord();
    if (payment === null || donor === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.pairError.set(null);
    this.api
      .pairPayment(payment.id, donor.donorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.pairing.set(null);
          this.notice.set({
            kind: 'status',
            text:
              $localize`:@@admin.payments.pair.done:Platba ${this.describe(payment)}:payment: je přiřazena dárci ${donor.name}:donor:.` +
              this.receiptNote(result.changedYearlyReceipts),
          });
          this.load();
        },
        error: (failure: unknown) => {
          this.busy.set(false);
          this.pairError.set(
            describeProblem(
              failure,
              $localize`:@@admin.payments.pair.failed:Platbu se nepodařilo přiřadit. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  protected askUnpair(payment: AdminPaymentResponse): void {
    this.unpairing.set(payment.id);
    this.notice.set(null);
  }

  protected cancelUnpair(): void {
    this.unpairing.set(null);
  }

  protected unpair(payment: AdminPaymentResponse): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .unpairPayment(payment.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.unpairing.set(null);
          this.notice.set({
            kind: 'status',
            text:
              $localize`:@@admin.payments.unpair.done:Platba ${this.describe(payment)}:payment: už není přiřazena. Automatické párování ji přeskočí; najdete ji mezi nespárovanými.` +
              this.receiptNote(result.changedYearlyReceipts),
          });
          this.load();
        },
        error: (failure: unknown) => {
          this.busy.set(false);
          this.unpairing.set(null);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.payments.unpair.failed:Přiřazení se nepodařilo zrušit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected date(isoDate: string): string {
    return formatDonationDate(isoDate);
  }

  protected time(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }

  protected crowns(amountMinor: number): string {
    return formatCrowns(amountMinor / 100);
  }

  protected method(method: PairingMethod): string {
    return METHOD_LABELS[method];
  }

  protected describe(payment: AdminPaymentResponse): string {
    return `${this.crowns(payment.amountMinor)} Kč z ${this.date(payment.bookedOn)}`;
  }

  private receiptNote(years: number[]): string {
    if (years.length === 0) {
      return '';
    }
    const list = years.join(', ');
    return (
      ' ' +
      $localize`:@@admin.payments.receiptChanged:Dárce si už stáhl roční potvrzení za ${list}:years:; při dalším stažení dostane nové. Dejte mu prosím vědět.`
    );
  }

  private sendToSignIn(): void {
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open();
    });
  }
}
