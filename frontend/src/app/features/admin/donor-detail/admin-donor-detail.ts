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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { pluralCategory } from '../../../core/i18n/plural-category';
import { BankAccountItem } from '../../donations/bank-accounts-api';
import { formatMinorUnits } from '../../donations/donation-amount';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { DonationItem } from '../../donations/donations-api';
import {
  AdminApi,
  AdminDonorDetailResponse,
  AdminReceiptResponse,
  DonorAccountResponse,
} from '../admin-api';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

type AccountAction = 'disconnect' | 'reconnect' | 'remove';

type PendingAction =
  { kind: 'reset' | 'passkeys' } | { kind: AccountAction; linkId: string } | null;

type NoticeCard = 'signIn' | 'accounts' | 'erasure';

interface CardSection {
  readonly id: string;
  readonly label: string;
}

interface CardNotice {
  readonly card: NoticeCard;
  readonly notice: Notice;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const NOT_FOUND = '-not-found';
const HAS_RECEIPT = 'donations/bank-account-has-receipt';

const SECTIONS = {
  details: { id: 'udaje', label: $localize`:@@admin.donorDetail.nav.details:Údaje` },
  signIn: { id: 'prihlaseni', label: $localize`:@@admin.donorDetail.nav.signIn:Přihlášení` },
  accounts: {
    id: 'bankovni-ucty',
    label: $localize`:@@admin.donorDetail.nav.accounts:Bankovní účty`,
  },
  donations: { id: 'dary', label: $localize`:@@admin.donorDetail.nav.donations:Dary` },
  receipts: { id: 'potvrzeni', label: $localize`:@@admin.donorDetail.nav.receipts:Potvrzení` },
} satisfies Record<string, CardSection>;

const PAIRING_LABELS: Record<NonNullable<DonationItem['pairedBy']>, string> = {
  VARIABLE_SYMBOL: $localize`:@@admin.donorDetail.pairing.variableSymbol:podle variabilního symbolu`,
  SENDER_ACCOUNT: $localize`:@@admin.donorDetail.pairing.senderAccount:podle účtu`,
  CONFIRMED_SYMBOL: $localize`:@@admin.donorDetail.pairing.confirmedSymbol:podle potvrzeného staršího symbolu`,
};

@Component({
  selector: 'app-admin-donor-detail',
  imports: [CopyButton, Dialog, LiveNotice, RouterLink],
  templateUrl: './admin-donor-detail.html',
  styleUrl: './admin-donor-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDonorDetail {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly confirmCancel = viewChild<ElementRef<HTMLButtonElement>>('confirmCancel');
  private readonly signInNotice = viewChild('signInNotice', { read: ElementRef });
  private readonly accountsNotice = viewChild('accountsNotice', { read: ElementRef });
  private readonly erasureNotice = viewChild('erasureNotice', { read: ElementRef });
  private readonly eraseCancel = viewChild<ElementRef<HTMLButtonElement>>('eraseCancel');
  private readonly eraseSubmit = viewChild<ElementRef<HTMLButtonElement>>('eraseSubmit');

  protected readonly donorId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly accountState = signal<LoadState>('loading');
  protected readonly account = signal<DonorAccountResponse | null>(null);
  protected readonly donationsState = signal<LoadState>('loading');
  protected readonly detail = signal<AdminDonorDetailResponse | null>(null);
  protected readonly cardNotice = signal<CardNotice | null>(null);
  protected readonly busy = signal(false);
  protected readonly pending = signal<PendingAction>(null);
  protected readonly erasing = signal(false);
  protected readonly eraseConfirmed = signal(false);
  protected readonly eraseError = signal<string | null>(null);
  protected readonly ids = SECTIONS;

  protected readonly name = computed(
    () => this.account()?.name ?? this.detail()?.donor.name ?? null,
  );
  protected readonly bankAccounts = computed(() => this.detail()?.bankAccounts ?? []);
  protected readonly donations = computed(() => this.detail()?.donations.items ?? []);
  protected readonly receivedCount = computed(() => this.detail()?.donations.count ?? 0);
  protected readonly refundedCount = computed(
    () => this.donations().filter((item) => item.status === 'REFUNDED').length,
  );
  protected readonly receipts = computed(() => this.detail()?.receipts ?? []);
  protected readonly total = computed(() =>
    this.crowns(this.detail()?.donations.totalAmountMinor ?? 0),
  );
  protected readonly sections = computed<CardSection[]>(() => [
    SECTIONS.details,
    ...(this.accountState() === 'ready' ? [SECTIONS.signIn] : []),
    SECTIONS.accounts,
    ...(this.donationsState() === 'ready' ? [SECTIONS.donations, SECTIONS.receipts] : []),
  ]);
  protected readonly erasedAt = computed(
    () => this.account()?.erasedAt ?? this.detail()?.donor.erasedAt ?? null,
  );

  constructor() {
    this.loadAccount();
    this.loadDonations();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected loadAccount(): void {
    this.accountState.set('loading');
    this.api
      .donor(this.donorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (account) => {
          this.account.set(account);
          this.accountState.set('ready');
        },
        error: (failure: unknown) => this.accountState.set(this.stateAfter(failure)),
      });
  }

  private refreshAccount(): void {
    this.api
      .donor(this.donorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (account) => {
          this.account.set(account);
          this.accountState.set('ready');
        },
        error: (failure: unknown) => this.accountState.set(this.stateAfter(failure)),
      });
  }

  protected loadDonations(): void {
    this.donationsState.set('loading');
    this.api
      .donorDonations(this.donorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.detail.set(detail);
          this.donationsState.set('ready');
        },
        error: (failure: unknown) => this.donationsState.set(this.stateAfter(failure)),
      });
  }

  protected sectionHref(section: CardSection): string {
    return `/sprava/darci/${this.donorId}#${section.id}`;
  }

  protected goTo(event: Event, section: CardSection): void {
    event.preventDefault();
    this.byId(section.id)?.focus();
  }

  protected typeLabel(account: DonorAccountResponse): string {
    return account.type === 'COMPANY'
      ? $localize`:@@admin.donorDetail.type.company:Firma`
      : $localize`:@@admin.donorDetail.type.person:Osoba`;
  }

  protected address(account: DonorAccountResponse): string {
    return `${account.address.street}, ${account.address.postalCode} ${account.address.city}`;
  }

  protected localeLabel(account: DonorAccountResponse): string {
    return account.preferredLocale === 'en'
      ? $localize`:@@admin.donorDetail.locale.en:angličtina`
      : $localize`:@@admin.donorDetail.locale.cs:čeština`;
  }

  protected receiptLocale(receipt: AdminReceiptResponse): string {
    return receipt.locale === 'en'
      ? $localize`:@@admin.donorDetail.receipts.locale.en:anglicky`
      : $localize`:@@admin.donorDetail.receipts.locale.cs:česky`;
  }

  protected time(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }

  protected day(isoDate: string): string {
    return formatDonationDate(isoDate);
  }

  protected crowns(amountMinor: number): string {
    return formatMinorUnits(amountMinor);
  }

  protected statusLabel(item: BankAccountItem): string {
    switch (item.status) {
      case 'ACTIVE':
        return $localize`:@@admin.donorDetail.accounts.status.active:Páruje platby`;
      case 'AWAITING_PAYMENT':
        return $localize`:@@admin.donorDetail.accounts.status.awaiting:Čeká na platbu se symbolem`;
      case 'DISCONNECTED':
        return $localize`:@@admin.donorDetail.accounts.status.disconnected:Párování vypnuté`;
    }
  }

  protected isLive(item: BankAccountItem): boolean {
    return item.status !== 'DISCONNECTED';
  }

  protected pairingLabel(item: DonationItem): string {
    if (item.pairedBy === null) {
      return $localize`:@@admin.donorDetail.pairing.manual:ručně správcem`;
    }
    return PAIRING_LABELS[item.pairedBy];
  }

  protected receiptSubject(receipt: AdminReceiptResponse): string {
    if (receipt.kind === 'YEARLY') {
      return $localize`:@@admin.donorDetail.receipts.yearly:Rok ${receipt.year}:year:`;
    }
    const day =
      receipt.donationReceivedOn === null ? '' : formatDonationDate(receipt.donationReceivedOn);
    return $localize`:@@admin.donorDetail.receipts.single:Dar z ${day}:day:`;
  }

  protected donationsCount(count: number): string {
    switch (pluralCategory(count)) {
      case 'one':
        return $localize`:@@admin.donorDetail.donations.one:1 dar`;
      case 'few':
        return $localize`:@@admin.donorDetail.donations.few:${count}:count: dary`;
      case 'other':
        return $localize`:@@admin.donorDetail.donations.many:${count}:count: darů`;
    }
  }

  protected askReset(): void {
    this.ask({ kind: 'reset' });
  }

  protected openErase(): void {
    this.pending.set(null);
    this.eraseConfirmed.set(false);
    this.eraseError.set(null);
    this.cardNotice.set(null);
    this.erasing.set(true);
    this.focusAfterRender(() => this.eraseCancel()?.nativeElement ?? null);
  }

  protected closeErase(): void {
    if (this.busy()) {
      return;
    }
    this.erasing.set(false);
  }

  protected confirmErase(event: Event): void {
    this.eraseConfirmed.set((event.target as HTMLInputElement).checked);
  }

  protected askRemovePasskeys(): void {
    this.ask({ kind: 'passkeys' });
  }

  protected askAccount(kind: AccountAction, item: BankAccountItem): void {
    this.ask({ kind, linkId: item.id });
  }

  protected cancel(): void {
    const opener = this.openerId(this.pending());
    this.pending.set(null);
    this.focusAfterRender(() => this.byId(opener));
  }

  protected isPendingReset(): boolean {
    return this.pending()?.kind === 'reset';
  }

  protected isPendingPasskeys(): boolean {
    return this.pending()?.kind === 'passkeys';
  }

  protected pendingFor(item: BankAccountItem): AccountAction | null {
    const pending = this.pending();
    if (pending === null || !('linkId' in pending) || pending.linkId !== item.id) {
      return null;
    }
    return pending.kind;
  }

  protected accountOpenerId(kind: AccountAction, item: BankAccountItem): string {
    return accountOpenerId(kind, item.id);
  }

  protected noticeIn(card: NoticeCard): Notice | null {
    const current = this.cardNotice();
    return current?.card === card ? current.notice : null;
  }

  protected removalBlocked(item: BankAccountItem): boolean {
    const sameNumber = this.bankAccounts().filter(
      (other) => other.accountNumber === item.accountNumber,
    );
    return (
      sameNumber.length === 1 &&
      this.donations().some(
        (donation) =>
          donation.senderAccount === item.accountNumber && donation.receiptNumber !== null,
      )
    );
  }

  private ask(action: NonNullable<PendingAction>): void {
    this.pending.set(action);
    this.cardNotice.set(null);
    this.focusAfterRender(() => this.confirmCancel()?.nativeElement ?? null);
  }

  protected reset(): void {
    const name = this.name() ?? '';
    this.run(
      this.api.resetSecondFactor(this.donorId),
      $localize`:@@admin.donorDetail.reset.done:Dvoufaktorové ověření u ${name}:name: je vypnuté a všechna přihlášení jsme ukončili. Dárce dostal e-mail; po přihlášení heslem si ho může zapnout znovu.`,
      $localize`:@@admin.donorDetail.reset.failed:Dvoufaktorové ověření se nepodařilo vypnout. Zkuste to prosím znovu.`,
      () => this.refreshAccount(),
      'signIn',
    );
  }

  protected removePasskeys(): void {
    const name = this.name() ?? '';
    this.run(
      this.api.removePasskeys(this.donorId),
      $localize`:@@admin.donorDetail.passkeys.done:Přístupové klíče u ${name}:name: jsme odebrali a všechna přihlášení ukončili. Dárce dostal e-mail; po přihlášení heslem si může přidat nový klíč.`,
      $localize`:@@admin.donorDetail.passkeys.failed:Přístupové klíče se nepodařilo odebrat. Zkuste to prosím znovu.`,
      () => this.refreshAccount(),
      'signIn',
    );
  }

  protected erase(): void {
    if (this.busy() || !this.eraseConfirmed()) {
      return;
    }
    this.busy.set(true);
    this.eraseError.set(null);
    this.api
      .eraseDonor(this.donorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.erasing.set(false);
          this.cardNotice.set({
            card: 'erasure',
            notice: {
              kind: 'status',
              text: $localize`:@@admin.donorDetail.erase.done:Osobní údaje dárce jsme vymazali a na jeho dosavadní e-mail poslali potvrzení. Účet už nejde použít; dary a vydaná potvrzení zůstávají bez jména.`,
            },
          });
          this.refreshAccount();
          this.loadDonations();
          this.focusAfterRender(() => this.noticeElement('erasure'));
        },
        error: (failure: unknown) => {
          this.busy.set(false);
          this.eraseError.set(
            describeProblem(
              failure,
              $localize`:@@admin.donorDetail.erase.failed:Osobní údaje se nepodařilo vymazat. Zkuste to prosím znovu.`,
            ),
          );
          this.focusAfterRender(() => this.eraseSubmit()?.nativeElement ?? null);
        },
      });
  }

  protected disconnect(item: BankAccountItem): void {
    this.run(
      this.api.disconnectDonorAccount(this.donorId, item.id),
      $localize`:@@admin.donorDetail.disconnect.done:Párování z účtu ${item.accountNumber}:account: je vypnuté: platby bez symbolu z něj už dárci nepřiřadíme, dosavadní dary zůstávají.`,
      $localize`:@@admin.donorDetail.disconnect.failed:Párování se nepodařilo vypnout. Zkuste to prosím znovu.`,
      () => this.loadDonations(),
      'accounts',
    );
  }

  protected reconnect(item: BankAccountItem): void {
    this.run(
      this.api.reconnectDonorAccount(this.donorId, item.id),
      $localize`:@@admin.donorDetail.reconnect.done:Párování z účtu ${item.accountNumber}:account: zase zapneme, jakmile z něj přijde platba s variabilním symbolem dárce.`,
      $localize`:@@admin.donorDetail.reconnect.failed:Párování se nepodařilo zapnout. Zkuste to prosím znovu.`,
      () => this.loadDonations(),
      'accounts',
    );
  }

  protected remove(item: BankAccountItem): void {
    this.run(
      this.api.removeDonorAccount(this.donorId, item.id),
      $localize`:@@admin.donorDetail.remove.done:Účet ${item.accountNumber}:account: jsme dárci odebrali: ${this.donationsCount(item.donationCount)}:donations: přiřazené přes něj jsme smazali a platby jsou zase nespárované.`,
      $localize`:@@admin.donorDetail.remove.failed:Účet se nepodařilo odebrat. Zkuste to prosím znovu.`,
      () => this.loadDonations(),
      'accounts',
    );
  }

  private run(
    request: Observable<void>,
    done: string,
    failed: string,
    reload: () => void,
    card: NoticeCard,
  ): void {
    if (this.busy()) {
      return;
    }
    const opener = this.openerId(this.pending());
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.pending.set(null);
        this.cardNotice.set({ card, notice: { kind: 'status', text: done } });
        reload();
        this.focusAfterRender(() => this.noticeElement(card));
      },
      error: (failure: unknown) => {
        this.busy.set(false);
        this.pending.set(null);
        this.cardNotice.set({ card, notice: { kind: 'alert', text: refusal(failure, failed) } });
        this.focusAfterRender(() => this.byId(opener) ?? this.noticeElement(card));
      },
    });
  }

  private openerId(pending: PendingAction): string | null {
    if (pending === null) {
      return null;
    }
    if ('linkId' in pending) {
      return accountOpenerId(pending.kind, pending.linkId);
    }
    return `donor-${pending.kind}-open`;
  }

  private byId(id: string | null): HTMLElement | null {
    return id === null ? null : this.host.nativeElement.querySelector<HTMLElement>(`#${id}`);
  }

  private noticeElement(card: NoticeCard): HTMLElement | null {
    const notice =
      card === 'signIn'
        ? this.signInNotice()
        : card === 'accounts'
          ? this.accountsNotice()
          : this.erasureNotice();
    return (notice?.nativeElement as HTMLElement | undefined) ?? null;
  }

  private focusAfterRender(target: () => HTMLElement | null): void {
    afterNextRender(() => target()?.focus(), { injector: this.injector });
  }

  private stateAfter(failure: unknown): LoadState {
    if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
      this.sendToSignIn();
      return 'error';
    }
    if (problemTypeEndsWith(failure, FORBIDDEN)) {
      this.router.navigateByUrl('/darce/prehled');
      return 'error';
    }
    return problemTypeEndsWith(failure, NOT_FOUND) ? 'missing' : 'error';
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function accountOpenerId(kind: AccountAction, linkId: string): string {
  return `account-${kind}-${linkId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function refusal(failure: unknown, failed: string): string {
  const described = describeProblem(failure, failed);
  return problemTypeEndsWith(failure, HAS_RECEIPT)
    ? `${described} ${$localize`:@@admin.donorDetail.remove.receiptNextStep:Dary s potvrzením musí zůstat. Aby se dárci další platby z účtu nepřiřazovaly, vypněte u něj párování.`}`
    : described;
}
