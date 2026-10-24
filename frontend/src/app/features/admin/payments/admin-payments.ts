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
import { catchError, EMPTY, Observable, of, Subject, switchMap, timer } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { formatMinorUnits } from '../../donations/donation-amount';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import {
  AdminApi,
  AdminDonorResponse,
  AdminDonorSearchResponse,
  AdminPaymentListResponse,
  AdminPaymentResponse,
  PairingFilter,
  PairingMethod,
} from '../admin-api';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';

type LoadState = 'loading' | 'ready' | 'error';

interface DonorSearch {
  readonly query: string;
  readonly immediate: boolean;
}

interface ChangedDonor {
  readonly id: string;
  readonly name: string;
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
  imports: [LiveNotice, Dialog, RouterLink],
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly pairSearch = viewChild<ElementRef<HTMLInputElement>>('pairSearch');
  private readonly confirmCancel = viewChild<ElementRef<HTMLButtonElement>>('confirmCancel');
  private readonly noticeElement = viewChild('noticeRegion', { read: ElementRef });
  private readonly searches = new Subject<DonorSearch | null>();

  protected readonly filter = signal<PairingFilter>('unpaired');
  protected readonly year = signal<number | null>(null);
  protected readonly state = signal<LoadState>('loading');
  protected readonly list = signal<AdminPaymentListResponse | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly changedDonor = signal<ChangedDonor | null>(null);
  protected readonly unpairedCount = signal<number | null>(null);
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
    this.searches
      .pipe(
        switchMap((search) => (search === null ? EMPTY : this.searchAfterPause(search))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.searchFailed.set(response === null);
        this.results.set(response?.items ?? []);
      });
  }

  private searchAfterPause(search: DonorSearch): Observable<AdminDonorSearchResponse | null> {
    const lookUp = this.api.searchDonors(search.query).pipe(catchError(() => of(null)));
    return search.immediate ? lookUp : timer(SEARCH_DEBOUNCE_MS).pipe(switchMap(() => lookUp));
  }

  protected show(filter: PairingFilter): void {
    if (this.filter() === filter) {
      return;
    }
    this.filter.set(filter);
    this.year.set(null);
    this.notice.set(null);
    this.changedDonor.set(null);
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
          if (this.filter() === 'unpaired') {
            this.unpairedCount.set(list.total);
          }
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
    const prefill = senderSurname(payment);
    this.pairing.set(payment);
    this.query.set(prefill);
    this.results.set(null);
    this.searchFailed.set(false);
    this.selectedDonor.set(null);
    this.pairError.set(null);
    this.notice.set(null);
    this.changedDonor.set(null);
    this.searches.next(prefill === '' ? null : { query: prefill, immediate: true });
    afterNextRender(
      () => {
        const input = this.pairSearch()?.nativeElement;
        input?.focus();
        input?.select();
      },
      { injector: this.injector },
    );
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
      this.searches.next(null);
      this.results.set(null);
      return;
    }
    this.searches.next({ query: value.trim(), immediate: false });
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
          this.changedDonor.set({ id: donor.donorId, name: donor.name });
          this.load();
          this.focusAfterRender(() => this.noticeElement()?.nativeElement ?? null);
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
    this.changedDonor.set(null);
    this.focusAfterRender(() => this.confirmCancel()?.nativeElement ?? null);
  }

  protected cancelUnpair(payment: AdminPaymentResponse): void {
    this.unpairing.set(null);
    this.focusAfterRender(() => this.unpairOpener(payment));
  }

  protected unpairOpenerId(payment: AdminPaymentResponse): string {
    return `unpair-open-${payment.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  }

  protected pairLabel(): string {
    const donor = this.selectedDonorRecord();
    return donor === null
      ? $localize`:@@admin.payments.pair.submit:Přiřadit`
      : $localize`:@@admin.payments.pair.submitTo:Přiřadit dárci ${donor.name}:donor:`;
  }

  protected unpairQuestion(payment: AdminPaymentResponse): string {
    const amount = `${this.crowns(payment.amountMinor)}\u00a0Kč`;
    const donorName = payment.donation?.donorName;
    return donorName
      ? $localize`:@@admin.payments.unpair.confirm.question:Dar ${amount}:amount: zmizí z přehledu dárce ${donorName}:donor: a platba se vrátí mezi čekající na přiřazení; web ji sám znovu nepřiřadí. Zrušit přiřazení?`
      : $localize`:@@admin.payments.unpair.confirm.questionNoDonor:Dar ${amount}:amount: zmizí a platba se vrátí mezi čekající na přiřazení; web ji sám znovu nepřiřadí. Zrušit přiřazení?`;
  }

  protected unpairLabel(payment: AdminPaymentResponse): string {
    return $localize`:@@admin.payments.unpair.confirm.label:Zrušit přiřazení platby ${this.describe(payment)}:payment:?`;
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
              $localize`:@@admin.payments.unpair.done:Platba ${this.describe(payment)}:payment: už není přiřazena. Web ji sám znovu nepřiřadí; najdete ji mezi platbami čekajícími na přiřazení.` +
              this.receiptNote(result.changedYearlyReceipts),
          });
          const donation = payment.donation;
          if (donation?.donorName) {
            this.changedDonor.set({ id: donation.donorId, name: donation.donorName });
          }
          this.unpairedCount.update((count) => (count === null ? null : count + 1));
          this.load();
          this.focusAfterRender(() => this.noticeElement()?.nativeElement ?? null);
        },
        error: (failure: unknown) => {
          this.busy.set(false);
          this.unpairing.set(null);
          this.focusAfterRender(
            () => this.unpairOpener(payment) ?? this.noticeElement()?.nativeElement ?? null,
          );
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
    return formatMinorUnits(amountMinor);
  }

  protected method(method: PairingMethod): string {
    return METHOD_LABELS[method];
  }

  protected describe(payment: AdminPaymentResponse): string {
    return `${this.crowns(payment.amountMinor)}\u00a0Kč z ${this.date(payment.bookedOn)}`;
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

  private unpairOpener(payment: AdminPaymentResponse): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(`#${this.unpairOpenerId(payment)}`);
  }

  private focusAfterRender(target: () => HTMLElement | null): void {
    afterNextRender(() => target()?.focus(), { injector: this.injector });
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function senderSurname(payment: AdminPaymentResponse): string {
  const first = (payment.counterpartyName ?? '').trim().split(/\s+/)[0] ?? '';
  return first.length >= 2 ? first : '';
}
