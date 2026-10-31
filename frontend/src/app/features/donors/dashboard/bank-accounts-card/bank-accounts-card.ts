/// <reference types="@angular/localize" />

import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  fromEvent,
  last,
  map,
  Observable,
  of,
  repeat,
  startWith,
  Subscription,
  switchMap,
  take,
  takeWhile,
  tap,
  timer,
} from 'rxjs';
import { describeProblem, problemOf, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthStore } from '../../../../core/auth/auth-store';
import { pluralCategory } from '../../../../core/i18n/plural-category';
import { CopyButton } from '../../../../shared/ui/copy-button/copy-button';
import { Dialog } from '../../../../shared/ui/dialog/dialog';
import {
  BankAccountItem,
  BankAccountListResponse,
  BankAccountsApi,
  SymbolClaimConfirmation,
  SymbolOffer,
} from '../../../donations/bank-accounts-api';
import { formatMinorUnits } from '../../../donations/donation-amount';
import { formatDonationDate } from '../../../donations/donation-date';
import { BankCheckResponse, DonationsApi } from '../../../donations/donations-api';
import { PaymentAccount, PaymentDetails } from '../../../donations/payment-details-api';
import { PaymentDetailsStore } from '../../../donations/payment-details-store';
import { spayd } from '../../../donations/spayd';
import { QrCode } from '../../../../shared/ui/qr-code/qr-code';
import { encodeText } from '../../../../shared/ui/qr-code/qr-encoder';
import { QrMatrix } from '../../../../shared/ui/qr-code/qr-matrix';
import { PairingHelp } from './pairing-help/pairing-help';
import { SymbolClaim, SymbolClaimAnswer } from './symbol-claim/symbol-claim';

type ListState = 'loading' | 'ready' | 'error';

interface VerificationPayment {
  readonly matrix: QrMatrix;
  readonly account: PaymentAccount;
  readonly amountMinor: number;
}

type QrState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly payment: VerificationPayment }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'refusedSymbol' };

type PaymentWatch = 'waiting' | 'stopped';

type AccountLabel = 'active' | 'shared' | 'awaiting' | 'excluded' | 'disconnected';

interface AccountsWhenOpened {
  readonly active: ReadonlySet<string>;
  readonly verificationPaymentOn: ReadonlyMap<string, string | null>;
}

const LABELS: Record<AccountLabel, string> = {
  active: $localize`:@@donor.bankAccounts.status.active:Ověřený`,
  shared: $localize`:@@donor.bankAccounts.status.shared:Sdílený`,
  awaiting: $localize`:@@donor.bankAccounts.status.awaiting:Čeká na platbu`,
  excluded: $localize`:@@donor.bankAccounts.status.excluded:Jen s variabilním symbolem`,
  disconnected: $localize`:@@donor.bankAccounts.status.disconnected:Nepřiřazujeme`,
};

const EXCLUDED_HINT = $localize`:@@donor.bankAccounts.hint.excluded:Z tohoto účtu už přiřazujeme jen platby s variabilním symbolem. Posílejte z něj prosím vždy s vaším variabilním symbolem.`;

const HINTS: Record<AccountLabel, string> = {
  active: $localize`:@@donor.bankAccounts.hint.active:Platby bez variabilního symbolu z něj vám přiřazujeme automaticky.`,
  shared: $localize`:@@donor.bankAccounts.hint.shared:Tento účet ověřil i jiný dárce, proto z něj platby bez variabilního symbolu nepřiřazujeme nikomu. Pokud z něj dary neposíláte vy, stiskněte „Nepřiřazovat platby z tohoto účtu“. Jinak z něj prosím posílejte vždy s vaším variabilním symbolem.`,
  awaiting: $localize`:@@donor.bankAccounts.hint.awaiting:Pošlete z účtu 1 Kč s vaším variabilním symbolem. Jakmile dorazí, přiřadíme vám z něj i platby bez symbolu ode dne zapnutí.`,
  excluded: EXCLUDED_HINT,
  disconnected: '',
};

const EXCLUDED_DISCONNECTED_HINT = $localize`:@@donor.bankAccounts.hint.excludedDisconnected:Z tohoto účtu už přiřazujeme jen platby s variabilním symbolem, platby bez symbolu z něj proto znovu přiřazovat nejde.`;

const DISCONNECTED_MESSAGE = $localize`:@@donor.bankAccounts.disconnected:Platby z účtu vám už nebudeme přiřazovat.`;
const RECONNECTED_MESSAGE = $localize`:@@donor.bankAccounts.reconnected:Účet čeká na vaši platbu 1 Kč.`;
const CHANGE_FAILED = $localize`:@@donor.bankAccounts.error.change:Účet se nepodařilo změnit. Zkuste to prosím znovu.`;
const ANSWER_FAILED = $localize`:@@donor.bankAccounts.error.answer:Odpověď se nepodařilo uložit. Zkuste to prosím znovu.`;
const AND = $localize`:@@donor.bankAccounts.claim.and:a`;
const VERIFICATION_MESSAGE = $localize`:@@donor.bankAccounts.addDialog.messageValue:Ověření účtu Nadační fond Nová naděje`;

const UNAUTHENTICATED = 'auth/unauthenticated';
const STALE_LIST_STATUSES = [404, 409];
const PAYMENT_QR_LEVEL = 'H';
const PAYMENT_WATCH_INTERVAL_MS = 30_000;
const PAYMENT_WATCH_CHECKS = 20;

@Component({
  selector: 'app-bank-accounts-card',
  imports: [Dialog, CopyButton, NgTemplateOutlet, PairingHelp, QrCode, SymbolClaim],
  templateUrl: './bank-accounts-card.html',
  styleUrl: './bank-accounts-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankAccountsCard {
  private readonly api = inject(BankAccountsApi);
  private readonly paymentDetails = inject(PaymentDetailsStore);
  private readonly donations = inject(DonationsApi);
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly variableSymbol = input<string | null>(null);
  readonly sessionEnded = output<void>();
  readonly bankChecked = output<BankCheckResponse>();
  readonly donationsChanged = output<void>();
  readonly accountsChanged = output<readonly BankAccountItem[]>();

  protected readonly donorName = computed(() => this.auth.donor()?.name ?? '');

  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  private readonly confirmCancel = viewChild<ElementRef<HTMLButtonElement>>('confirmCancel');
  private readonly helpToggle = viewChild<ElementRef<HTMLButtonElement>>('helpToggle');
  private readonly addButton = viewChild<ElementRef<HTMLButtonElement>>('addButton');
  private readonly addResult = viewChild<ElementRef<HTMLElement>>('addResult');
  private readonly addAnswer = viewChild<ElementRef<HTMLElement>>('addAnswer');
  private readonly addError = viewChild<ElementRef<HTMLElement>>('addError');

  protected readonly helpOpen = signal(false);

  protected readonly state = signal<ListState>('loading');
  protected readonly accounts = signal<readonly BankAccountItem[]>([]);
  protected readonly confirming = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly actionError = signal('');
  protected readonly actionDone = signal('');

  protected readonly adding = signal(false);
  protected readonly qr = computed<QrState>(() => {
    const state = this.paymentDetails.state();
    if (state.kind === 'loading') {
      return state;
    }
    if (state.kind === 'failed') {
      return { kind: 'unavailable' };
    }
    return verificationQr(state.details, this.variableSymbol());
  });
  protected readonly qrResponse = computed(() => {
    const state = this.qr();
    return state.kind === 'ready' ? state.payment : null;
  });
  protected readonly amountOf = formatMinorUnits;
  protected readonly verificationMessage = VERIFICATION_MESSAGE;
  protected readonly nudgesStandingOrder = computed(
    () =>
      !this.accounts().some(
        (account) => account.status === 'ACTIVE' || account.symbolOffer !== null,
      ),
  );

  protected readonly paymentWatch = signal<PaymentWatch>('waiting');
  private readonly accountsWhenOpened = signal<AccountsWhenOpened | null>(null);
  protected readonly newlyVerified = computed(() => {
    const known = this.accountsWhenOpened();
    if (!this.adding() || known === null) {
      return null;
    }
    return (
      this.accounts().find(
        (account) =>
          account.status === 'ACTIVE' &&
          (!known.active.has(account.id) ||
            known.verificationPaymentOn.get(account.id) !== account.verificationPaymentOn),
      ) ?? null
    );
  });
  private readonly newlyVerifiedId = computed(() => this.newlyVerified()?.id ?? null);
  protected readonly alreadyVerified = computed(() =>
    alreadyVerifiedMessage(
      this.accounts()
        .filter((account) => labelOf(account) === 'active' && !account.pairingExcluded)
        .map((account) => account.accountNumber),
    ),
  );
  private watchRequest: Subscription | undefined;

  constructor() {
    this.fetch();
    effect(() => {
      if (this.newlyVerifiedId() !== null) {
        afterNextRender(() => this.addResult()?.nativeElement.focus(), {
          injector: this.injector,
        });
      }
    });
    this.destroyRef.onDestroy(() => {
      this.watchRequest?.unsubscribe();
    });
  }

  reload(): void {
    this.fetch();
  }

  focusTitle(): void {
    this.title()?.nativeElement.focus();
  }

  protected toggleHelp(): void {
    this.helpOpen.update((open) => !open);
  }

  protected closeHelp(): void {
    this.helpOpen.set(false);
    this.helpToggle()?.nativeElement.focus();
  }

  protected retry(): void {
    this.state.set('loading');
    this.fetch();
  }

  private fetch(focusTitle = false): void {
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items }) => {
          this.showAccounts(items);
          if (focusTitle) {
            afterNextRender(() => this.focusTitle(), { injector: this.injector });
          }
        },
        error: (failure: unknown) => {
          if (this.sessionHasEnded(failure)) {
            this.sessionEnded.emit();
            return;
          }
          this.state.set('error');
        },
      });
  }

  private showAccounts(items: readonly BankAccountItem[]): void {
    this.accounts.set(items);
    this.state.set('ready');
    this.accountsChanged.emit(items);
    if (this.adding() && this.accountsWhenOpened() === null) {
      this.accountsWhenOpened.set(accountsWhenOpened(items));
    }
  }

  protected label(account: BankAccountItem): string {
    return LABELS[labelOf(account)];
  }

  protected hint(account: BankAccountItem): string {
    if (!account.pairingExcluded) {
      return HINTS[labelOf(account)];
    }
    if (account.status !== 'DISCONNECTED') {
      return EXCLUDED_HINT;
    }
    return this.isNewestOfItsNumber(account) ? EXCLUDED_DISCONNECTED_HINT : '';
  }

  protected offersDisconnect(account: BankAccountItem): boolean {
    return account.status === 'ACTIVE'
      ? !account.pairingExcluded
      : account.status !== 'DISCONNECTED';
  }

  protected warns(account: BankAccountItem): boolean {
    return labelOf(account) === 'shared';
  }

  protected asksInDialog(account: BankAccountItem): boolean {
    return this.newlyVerifiedId() === account.id;
  }

  protected wasActiveWhenOpened(account: BankAccountItem): boolean {
    return this.accountsWhenOpened()?.active.has(account.id) ?? false;
  }

  protected earlierGifts(account: BankAccountItem): string | null {
    if (this.wasActiveWhenOpened(account) || account.donationCount === 0) {
      return null;
    }
    return earlierGiftsMessage(account.donationCount, formatMinorUnits(account.totalAmountMinor));
  }

  protected symbolList(symbols: readonly string[]): string {
    return joinedList(symbols);
  }

  protected offersReconnect(account: BankAccountItem): boolean {
    return (
      account.status === 'DISCONNECTED' &&
      !account.pairingExcluded &&
      this.isNewestOfItsNumber(account)
    );
  }

  private isNewestOfItsNumber(account: BankAccountItem): boolean {
    return (
      this.accounts().find((other) => other.accountNumber === account.accountNumber) === account
    );
  }

  protected labelModifier(account: BankAccountItem): string {
    return `account-status--${labelOf(account)}`;
  }

  protected formatDate(isoDate: string): string {
    return formatDonationDate(isoDate);
  }

  protected firstDayOff(lastCountedDay: string): string {
    return formatDonationDate(dayAfter(lastCountedDay));
  }

  protected crowns(amountMinor: number): string {
    return formatMinorUnits(amountMinor);
  }

  protected askToDisconnect(account: BankAccountItem): void {
    this.actionError.set('');
    this.actionDone.set('');
    this.confirming.set(account.id);
    afterNextRender(() => this.confirmCancel()?.nativeElement.focus(), { injector: this.injector });
  }

  protected cancelDisconnect(account: BankAccountItem): void {
    this.confirming.set(null);
    this.actionError.set('');
    afterNextRender(() => this.actionButtonOf(account)?.focus(), { injector: this.injector });
  }

  protected disconnect(account: BankAccountItem): void {
    this.run(
      account,
      this.api.disconnect(account.id).pipe(map(() => DISCONNECTED_MESSAGE)),
      CHANGE_FAILED,
    );
  }

  protected reconnect(account: BankAccountItem): void {
    this.run(
      account,
      this.api.reconnect(account.id).pipe(map(() => RECONNECTED_MESSAGE)),
      CHANGE_FAILED,
    );
  }

  protected answer(account: BankAccountItem, offer: SymbolOffer, answer: SymbolClaimAnswer): void {
    const request$ =
      answer === 'confirm'
        ? this.confirmSymbol(account, offer)
        : this.declineSymbol(account, offer);
    this.run(account, request$.pipe(tap(() => this.withdrawOffer(account))), ANSWER_FAILED);
  }

  private withdrawOffer(answered: BankAccountItem): void {
    this.accounts.update((accounts) =>
      accounts.map((account) =>
        account.id === answered.id ? { ...account, symbolOffer: null } : account,
      ),
    );
    this.accountsChanged.emit(this.accounts());
  }

  private confirmSymbol(account: BankAccountItem, offer: SymbolOffer): Observable<string> {
    return this.api.confirmSymbol(account.id, offer.variableSymbol).pipe(
      tap(({ pairedCount }) => {
        if (pairedCount > 0) {
          this.donationsChanged.emit();
        }
      }),
      map((confirmation) =>
        confirmedMessage(confirmation, offer.variableSymbol, account.accountNumber),
      ),
    );
  }

  private declineSymbol(account: BankAccountItem, offer: SymbolOffer): Observable<string> {
    return this.api
      .declineSymbol(account.id, offer.variableSymbol)
      .pipe(map(() => declinedMessage(offer.variableSymbol, account.accountNumber)));
  }

  private run(account: BankAccountItem, request$: Observable<string>, failedMessage: string): void {
    if (this.busy() !== null) {
      return;
    }
    this.busy.set(account.id);
    this.actionError.set('');
    this.actionDone.set('');
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (doneMessage) => {
        this.busy.set(null);
        this.confirming.set(null);
        this.actionDone.set(doneMessage);
        this.fetchAfterChange(this.addAnswer);
      },
      error: (failure: unknown) => {
        this.busy.set(null);
        if (this.sessionHasEnded(failure)) {
          this.sessionEnded.emit();
          return;
        }
        this.actionError.set(describeProblem(failure, failedMessage));
        if (STALE_LIST_STATUSES.includes(problemOf(failure)?.status ?? 0)) {
          this.confirming.set(null);
          this.fetchAfterChange(this.addError);
        }
      },
    });
  }

  private fetchAfterChange(inDialog: () => ElementRef<HTMLElement> | undefined): void {
    if (!this.adding()) {
      this.fetch(true);
      return;
    }
    this.fetch();
    afterNextRender(() => inDialog()?.nativeElement.focus(), { injector: this.injector });
  }

  openAddDialog(): void {
    if (!this.variableSymbol() || this.adding()) {
      return;
    }
    this.addButton()?.nativeElement.focus();
    this.openAdd();
  }

  protected openAdd(): void {
    this.actionError.set('');
    this.actionDone.set('');
    this.adding.set(true);
    if (this.state() === 'ready') {
      this.accountsWhenOpened.set(accountsWhenOpened(this.accounts()));
    } else {
      this.accountsWhenOpened.set(null);
      this.fetch();
    }
    this.loadQr();
    this.watchForPayment();
  }

  protected closeAdd(): void {
    this.watchRequest?.unsubscribe();
    this.adding.set(false);
    this.accountsWhenOpened.set(null);
  }

  protected watchAgain(): void {
    this.watchForPayment();
  }

  private watchForPayment(): void {
    this.watchRequest?.unsubscribe();
    this.paymentWatch.set('waiting');
    this.watchRequest = this.pageVisible()
      .pipe(
        switchMap((visible, index) =>
          visible
            ? timer(index === 0 ? PAYMENT_WATCH_INTERVAL_MS : 0).pipe(
                switchMap(() =>
                  this.checkForPayment().pipe(repeat({ delay: PAYMENT_WATCH_INTERVAL_MS })),
                ),
              )
            : EMPTY,
        ),
        take(PAYMENT_WATCH_CHECKS),
        takeWhile(() => this.newlyVerified() === null),
      )
      .subscribe({
        complete: () => {
          if (this.newlyVerified() === null) {
            this.paymentWatch.set('stopped');
          }
        },
      });
  }

  private checkForPayment(): Observable<void> {
    return this.donations.checkBankUntilDone().pipe(
      last(),
      tap((check) => this.bankChecked.emit(check)),
      catchError(() => of(null)),
      switchMap(() => this.api.list()),
      map(({ items }: BankAccountListResponse) => this.showAccounts(items)),
      catchError((failure: unknown) => {
        if (this.sessionHasEnded(failure)) {
          this.closeAdd();
          this.sessionEnded.emit();
        }
        return of(undefined);
      }),
    );
  }

  private pageVisible(): Observable<boolean> {
    return fromEvent(this.document, 'visibilitychange').pipe(
      startWith(null),
      map(() => this.document.visibilityState !== 'hidden'),
      distinctUntilChanged(),
    );
  }

  protected loadQr(): void {
    this.paymentDetails.load();
  }

  protected reloadQr(): void {
    this.paymentDetails.reload();
  }

  private actionButtonOf(account: BankAccountItem): HTMLButtonElement | null {
    return this.host.nativeElement.querySelector<HTMLButtonElement>(`#${actionButtonId(account)}`);
  }

  protected actionButtonId(account: BankAccountItem): string {
    return actionButtonId(account);
  }

  private sessionHasEnded(failure: unknown): boolean {
    return problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous';
  }
}

function labelOf(account: BankAccountItem): AccountLabel {
  switch (account.status) {
    case 'ACTIVE':
      return account.shared ? 'shared' : 'active';
    case 'AWAITING_PAYMENT':
      return account.pairingExcluded ? 'excluded' : 'awaiting';
    case 'DISCONNECTED':
      return 'disconnected';
  }
}

function accountsWhenOpened(items: readonly BankAccountItem[]): AccountsWhenOpened {
  return {
    active: new Set(
      items.filter((account) => account.status === 'ACTIVE').map((account) => account.id),
    ),
    verificationPaymentOn: new Map(
      items.map((account) => [account.id, account.verificationPaymentOn]),
    ),
  };
}

function confirmedMessage(
  { pairedCount, changedYearlyReceipts }: SymbolClaimConfirmation,
  symbol: string,
  account: string,
): string {
  const paired = pairedMessage(pairedCount, symbol, account);
  return changedYearlyReceipts.length > 0
    ? `${paired} ${receiptsChangedMessage(changedYearlyReceipts)}`
    : paired;
}

function pairedMessage(count: number, symbol: string, account: string): string {
  if (count === 0) {
    return $localize`:@@donor.bankAccounts.claim.paired.none:Odpověď jsme uložili. Platby se symbolem ${symbol}:symbol: z účtu ${account}:account: vám přiřazujeme stejně jako platby bez symbolu.`;
  }
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@donor.bankAccounts.claim.paired.one:Přiřadili jsme vám 1 platbu se symbolem ${symbol}:symbol: z účtu ${account}:account:.`;
    case 'few':
      return $localize`:@@donor.bankAccounts.claim.paired.few:Přiřadili jsme vám ${count}:count: platby se symbolem ${symbol}:symbol: z účtu ${account}:account:.`;
    case 'other':
      return $localize`:@@donor.bankAccounts.claim.paired.many:Přiřadili jsme vám ${count}:count: plateb se symbolem ${symbol}:symbol: z účtu ${account}:account:.`;
  }
}

function earlierGiftsMessage(count: number, total: string): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@donor.bankAccounts.addDialog.earlierGifts.one:Přiřadili jsme vám také ${count}:count: dřívější dar z\u00a0tohoto účtu, celkem ${total}:total:\u00a0Kč.`;
    case 'few':
      return $localize`:@@donor.bankAccounts.addDialog.earlierGifts.few:Přiřadili jsme vám také ${count}:count: dřívější dary z\u00a0tohoto účtu, celkem ${total}:total:\u00a0Kč.`;
    default:
      return $localize`:@@donor.bankAccounts.addDialog.earlierGifts.other:Přiřadili jsme vám také ${count}:count: dřívějších darů z\u00a0tohoto účtu, celkem ${total}:total:\u00a0Kč.`;
  }
}

function alreadyVerifiedMessage(accountNumbers: readonly string[]): string | null {
  if (accountNumbers.length === 0) {
    return null;
  }
  const accounts = joinedList(accountNumbers);
  return accountNumbers.length === 1
    ? $localize`:@@donor.bankAccounts.addDialog.alreadyVerified.one:Účet ${accounts}:account: už máte ověřený, 1\u00a0Kč z něj posílat nemusíte.`
    : $localize`:@@donor.bankAccounts.addDialog.alreadyVerified.other:Účty ${accounts}:accounts: už máte ověřené, 1\u00a0Kč z nich posílat nemusíte.`;
}

function receiptsChangedMessage(years: readonly number[]): string {
  const sorted = [...years].sort((first, second) => first - second);
  if (sorted.length === 1) {
    const year = sorted[0];
    return $localize`:@@donor.bankAccounts.claim.receiptChanged:Potvrzení za rok ${year}:year: se změnilo, stáhněte si nové.`;
  }
  const list = joinedList(sorted.map(String));
  return $localize`:@@donor.bankAccounts.claim.receiptsChanged:Potvrzení za roky ${list}:years: se změnila, stáhněte si nová.`;
}

function declinedMessage(symbol: string, account: string): string {
  return $localize`:@@donor.bankAccounts.claim.declined:Odpověď jsme uložili. Platby se symbolem ${symbol}:symbol: z účtu ${account}:account: vám nepřiřadíme.`;
}

function joinedList(values: readonly string[]): string {
  if (values.length < 2) {
    return values.join('');
  }
  return `${values.slice(0, -1).join(', ')} ${AND} ${values[values.length - 1]}`;
}

function actionButtonId(account: BankAccountItem): string {
  return `bank-account-action-${account.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function dayAfter(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function verificationQr(details: PaymentDetails, variableSymbol: string | null): QrState {
  const payment = spayd(details, {
    amountMinor: details.accountVerificationAmountMinor,
    variableSymbol,
    purpose: 'ACCOUNT_VERIFICATION',
  });
  if (!('spayd' in payment)) {
    return payment.refused.fields.includes('variableSymbol')
      ? { kind: 'refusedSymbol' }
      : { kind: 'refused' };
  }
  try {
    return {
      kind: 'ready',
      payment: {
        matrix: encodeText(payment.spayd, PAYMENT_QR_LEVEL),
        account: details.account,
        amountMinor: details.accountVerificationAmountMinor,
      },
    };
  } catch {
    return { kind: 'refused' };
  }
}
