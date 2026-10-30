/// <reference types="@angular/localize" />

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
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import {
  catchError,
  combineLatest,
  debounceTime,
  EMPTY,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  timer,
} from 'rxjs';
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
  DonorAccountListResponse,
  AdminPaymentResponse,
  PairingFilter,
  PairingMethod,
  PaymentQuery,
} from '../admin-api';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';

type LoadState = 'loading' | 'ready' | 'error';

interface PaymentFilters {
  readonly pairing: PairingFilter;
  readonly text: string;
  readonly from: string;
  readonly to: string;
  readonly donorId: string;
}

type PageOutcome =
  | { readonly kind: 'loaded'; readonly list: AdminPaymentListResponse }
  | { readonly kind: 'failed'; readonly failure: unknown };

interface DonorSearch {
  readonly query: string;
  readonly immediate: boolean;
}

interface DonorSearchOutcome {
  readonly found: AdminDonorSearchResponse | null;
  readonly emails: ReadonlyMap<string, string>;
}

interface ChangedDonor {
  readonly id: string;
  readonly name: string;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const SEARCH_DEBOUNCE_MS = 300;
const EMAIL_LOOKUP_LIMIT = 100;
const NO_EMAILS: ReadonlyMap<string, string> = new Map();
const PAGE_SIZE = 50;
const PAIRED_TAB = 'prirazene';
const PARAMS = { tab: 'stav', text: 'q', from: 'od', to: 'do', donor: 'darce' } as const;

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
  private readonly route = inject(ActivatedRoute);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly pairSearch = viewChild<ElementRef<HTMLInputElement>>('pairSearch');
  private readonly paymentsSearch = viewChild<ElementRef<HTMLInputElement>>('paymentsSearch');
  private readonly confirmCancel = viewChild<ElementRef<HTMLButtonElement>>('confirmCancel');
  private readonly noticeElement = viewChild('noticeRegion', { read: ElementRef });
  private readonly searches = new Subject<DonorSearch | null>();
  private readonly typed = new Subject<string>();
  private readonly pages = new Subject<PaymentFilters>();

  protected readonly filters = signal<PaymentFilters>(
    filtersFrom(this.route.snapshot.queryParamMap),
  );
  protected readonly filter = computed(() => this.filters().pairing);
  protected readonly filtered = computed(() => isFiltered(this.filters()));
  protected readonly searchText = signal(this.filters().text);
  protected readonly state = signal<LoadState>('loading');
  protected readonly items = signal<AdminPaymentResponse[]>([]);
  protected readonly total = signal(0);
  protected readonly loadingMore = signal(false);
  protected readonly moreFailed = signal(false);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly changedDonor = signal<ChangedDonor | null>(null);
  protected readonly unpairedCount = signal<number | null>(null);
  protected readonly busy = signal(false);

  protected readonly pairing = signal<AdminPaymentResponse | null>(null);
  protected readonly query = signal('');
  protected readonly results = signal<AdminDonorResponse[] | null>(null);
  protected readonly searchFailed = signal(false);
  protected readonly emails = signal<ReadonlyMap<string, string>>(NO_EMAILS);
  protected readonly selectedDonor = signal<string | null>(null);
  protected readonly pairError = signal<string | null>(null);

  protected readonly unpairing = signal<string | null>(null);

  protected readonly hasMore = computed(() => this.items().length < this.total());
  protected readonly filteredDonorName = computed(
    () =>
      this.items().find((item) => item.donation?.donorId === this.filters().donorId)?.donation
        ?.donorName ?? null,
  );
  protected readonly selectedDonorRecord = computed(
    () => this.results()?.find((donor) => donor.donorId === this.selectedDonor()) ?? null,
  );

  constructor() {
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
    this.pages
      .pipe(
        switchMap((filters) => this.firstPage(filters)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((outcome) => this.showFirstPage(outcome));
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const filters = filtersFrom(params);
      this.filters.set(filters);
      if (this.searchText().trim() !== filters.text) {
        this.searchText.set(filters.text);
      }
      this.unpairing.set(null);
      this.load();
    });
    this.typed
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe((text) => {
        if (text.trim() !== this.filters().text) {
          this.navigate({ text: text.trim() });
        }
      });
    this.searches
      .pipe(
        switchMap((search) => (search === null ? EMPTY : this.searchAfterPause(search))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ found, emails }) => {
        this.searchFailed.set(found === null);
        this.results.set(found?.items ?? []);
        this.emails.set(emails);
      });
  }

  private searchAfterPause(search: DonorSearch): Observable<DonorSearchOutcome> {
    const lookUp = combineLatest({
      found: this.api.searchDonors(search.query).pipe(catchError(() => of(null))),
      emails: this.api.donors(search.query, EMAIL_LOOKUP_LIMIT).pipe(
        map(emailsById),
        catchError(() => of(NO_EMAILS)),
        startWith(NO_EMAILS),
      ),
    });
    return search.immediate ? lookUp : timer(SEARCH_DEBOUNCE_MS).pipe(switchMap(() => lookUp));
  }

  protected show(filter: PairingFilter): void {
    if (this.filter() === filter) {
      return;
    }
    this.notice.set(null);
    this.changedDonor.set(null);
    this.navigate({
      pairing: filter,
      donorId: filter === 'unpaired' ? '' : this.filters().donorId,
    });
  }

  protected searchPayments(value: string): void {
    this.searchText.set(value);
    this.typed.next(value);
  }

  protected choosePeriod(bound: 'from' | 'to', value: string): void {
    this.navigate(bound === 'from' ? { from: value } : { to: value });
  }

  protected clearFilters(): void {
    this.searchText.set('');
    this.navigate({ text: '', from: '', to: '', donorId: '' });
    this.focusAfterRender(() => this.paymentsSearch()?.nativeElement ?? null);
  }

  protected showAllDonors(): void {
    this.navigate({ donorId: '' });
  }

  protected load(): void {
    this.state.set('loading');
    this.moreFailed.set(false);
    this.pages.next(this.filters());
  }

  protected loadMore(): void {
    if (this.loadingMore()) {
      return;
    }
    const filters = this.filters();
    const offset = this.items().length;
    this.loadingMore.set(true);
    this.moreFailed.set(false);
    this.api
      .payments(filters.pairing, { ...queryOf(filters), offset, limit: PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.items.update((current) => [...current, ...list.items]);
          this.total.set(list.total);
          this.loadingMore.set(false);
          this.focusAfterRender(
            () =>
              this.host.nativeElement.querySelectorAll<HTMLElement>('.payments-card tbody tr')[
                offset
              ] ?? null,
          );
        },
        error: (failure: unknown) => {
          this.loadingMore.set(false);
          if (!this.leaveOnRefusal(failure)) {
            this.moreFailed.set(true);
          }
        },
      });
  }

  private firstPage(filters: PaymentFilters): Observable<PageOutcome> {
    return this.api.payments(filters.pairing, { ...queryOf(filters), limit: PAGE_SIZE }).pipe(
      map((list): PageOutcome => ({ kind: 'loaded', list })),
      catchError((failure: unknown) => of<PageOutcome>({ kind: 'failed', failure })),
    );
  }

  private showFirstPage(outcome: PageOutcome): void {
    if (outcome.kind === 'failed') {
      if (!this.leaveOnRefusal(outcome.failure)) {
        this.state.set('error');
      }
      return;
    }
    this.items.set(outcome.list.items);
    this.total.set(outcome.list.total);
    if (this.filter() === 'unpaired' && !this.filtered()) {
      this.unpairedCount.set(outcome.list.total);
    }
    this.state.set('ready');
  }

  private leaveOnRefusal(failure: unknown): boolean {
    if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
      this.sendToSignIn();
      return true;
    }
    if (problemTypeEndsWith(failure, FORBIDDEN)) {
      this.router.navigateByUrl('/darce/prehled');
      return true;
    }
    return false;
  }

  private navigate(change: Partial<PaymentFilters>): void {
    const next = { ...this.filters(), ...change };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        [PARAMS.tab]: next.pairing === 'paired' ? PAIRED_TAB : null,
        [PARAMS.text]: next.text || null,
        [PARAMS.from]: next.from || null,
        [PARAMS.to]: next.to || null,
        [PARAMS.donor]: next.donorId || null,
      },
      replaceUrl: true,
    });
  }

  protected openPairing(payment: AdminPaymentResponse): void {
    const prefill = senderSurname(payment);
    this.pairing.set(payment);
    this.query.set(prefill);
    this.results.set(null);
    this.emails.set(NO_EMAILS);
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

function filtersFrom(params: ParamMap): PaymentFilters {
  return {
    pairing: params.get(PARAMS.tab) === PAIRED_TAB ? 'paired' : 'unpaired',
    text: (params.get(PARAMS.text) ?? '').trim(),
    from: params.get(PARAMS.from) ?? '',
    to: params.get(PARAMS.to) ?? '',
    donorId: params.get(PARAMS.donor) ?? '',
  };
}

function isFiltered(filters: PaymentFilters): boolean {
  return [filters.text, filters.from, filters.to, filters.donorId].some((value) => value !== '');
}

function queryOf(filters: PaymentFilters): PaymentQuery {
  return { text: filters.text, from: filters.from, to: filters.to, donorId: filters.donorId };
}

function emailsById(list: DonorAccountListResponse): ReadonlyMap<string, string> {
  return new Map(list.items.map((account) => [account.donorId, account.email]));
}

function senderSurname(payment: AdminPaymentResponse): string {
  const first = (payment.counterpartyName ?? '').trim().split(/\s+/)[0] ?? '';
  return first.length >= 2 ? first : '';
}
