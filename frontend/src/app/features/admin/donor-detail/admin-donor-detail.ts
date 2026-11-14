import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  PendingTasks,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { from, Observable, Subscription, switchMap } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { Connectivity, isUnreachable } from '../../../core/connectivity/connectivity';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { pluralCategory } from '../../../core/i18n/plural-category';
import { TrackedForm } from '../../../core/updates/tracked-form';
import { BankAccount } from '../../donations/bank-account/bank-account';
import { BankAccountItem } from '../../donations/bank-accounts-api';
import { formatMinorUnits } from '../../donations/donation-amount';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { DonationItem } from '../../donations/donations-api';
import { trustedKeys } from '../../donations/verification/receipt-keys';
import { ReceiptKeysApi } from '../../donations/verification/receipt-keys-api';
import {
  AdminApi,
  AdminBankAccountItem,
  AdminDonorDetailResponse,
  AdminIssuedReceiptResponse,
  AdminReceiptResponse,
  DonorAccountResponse,
  ReceiptIssueRequest,
} from '../admin-api';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { PdfButtonFace } from '../../../shared/ui/pdf-button-face/pdf-button-face';
import { PdfProgress } from '../../../shared/ui/pdf-progress/pdf-progress';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { isChangedMeanwhile } from '../../../core/version/row-version';
import { ChangedMeanwhileDialog } from '../changed-meanwhile/changed-meanwhile-dialog';
import { AdminReceiptDownloads } from './admin-receipt-downloads';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import { AdministrationReads, type BankAccountsSource } from '../device-copy/administration-reads';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

type AccountAction = 'disconnect' | 'reconnect' | 'remove';

type PendingAction =
  { kind: 'reset' | 'passkeys' } | { kind: AccountAction; linkId: string } | null;

type NoticeCard = 'signIn' | 'accounts' | 'receipts' | 'erasure';

interface CardSection {
  readonly id: string;
  readonly label: string;
}

interface DonationYear {
  readonly year: string;
  readonly heading: string;
  readonly items: DonationItem[];
}

interface IssueChoice {
  readonly key: string;
  readonly label: string;
  readonly request: ReceiptIssueRequest;
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
  erasure: { id: 'vymaz', label: $localize`:@@admin.donorDetail.nav.erasure:Výmaz údajů` },
} satisfies Record<string, CardSection>;

const SECTION_IDS: ReadonlySet<string> = new Set(Object.values(SECTIONS).map(({ id }) => id));

const PAIRING_LABELS: Record<NonNullable<DonationItem['pairedBy']>, string> = {
  VARIABLE_SYMBOL: $localize`:@@admin.donorDetail.pairing.variableSymbol:podle variabilního symbolu`,
  SENDER_ACCOUNT: $localize`:@@admin.donorDetail.pairing.senderAccount:podle účtu`,
  CONFIRMED_SYMBOL: $localize`:@@admin.donorDetail.pairing.confirmedSymbol:podle potvrzeného staršího symbolu`,
};

@Component({
  selector: 'app-admin-donor-detail',
  imports: [
    BankAccount,
    CopyButton,
    Dialog,
    PdfButtonFace,
    PdfProgress,
    FormControlDirective,
    FormField,
    FormsModule,
    ChangedMeanwhileDialog,
    LiveNotice,
    RouterLink,
    TrackedForm,
    NeedsConnection,
  ],
  providers: [AdminReceiptDownloads],
  templateUrl: './admin-donor-detail.html',
  styleUrl: './admin-donor-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDonorDetail {
  protected readonly compact = inject(CompactLayout).isCompact;
  private readonly api = inject(AdminApi);
  private readonly reads = inject(AdministrationReads);
  private readonly connectivity = inject(Connectivity);
  private readonly receiptKeys = inject(ReceiptKeysApi);
  private readonly document = inject(DOCUMENT);
  private readonly hostname = this.document.location.hostname;
  private readonly pendingTasks = inject(PendingTasks);
  protected readonly pdfs = inject(AdminReceiptDownloads);
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
  private readonly receiptsNotice = viewChild('receiptsNotice', { read: ElementRef });
  private readonly issueSubmit = viewChild<ElementRef<HTMLButtonElement>>('issueSubmit');
  private readonly erasureNotice = viewChild('erasureNotice', { read: ElementRef });
  private readonly eraseCancel = viewChild<ElementRef<HTMLButtonElement>>('eraseCancel');
  private readonly eraseSubmit = viewChild<ElementRef<HTMLButtonElement>>('eraseSubmit');

  protected readonly donorId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly accountState = signal<LoadState>('loading');
  protected readonly account = signal<DonorAccountResponse | null>(null);
  protected readonly donationsState = signal<LoadState>('loading');
  private readonly donationsUnreachable = signal(false);
  protected readonly donationsAwaitConnection = computed(
    () => this.donationsUnreachable() && this.connectivity.offline(),
  );
  private cardRead: Subscription | null = null;
  private onCardLoaded: (() => void) | undefined;
  protected readonly detail = signal<AdminDonorDetailResponse | null>(null);
  protected readonly bankAccountsSource = signal<BankAccountsSource>('server');
  protected readonly cardNotice = signal<CardNotice | null>(null);
  protected readonly busy = signal(false);
  protected readonly changedMeanwhile = signal<{
    reload: (onLoaded?: () => void) => void;
    card: NoticeCard;
  } | null>(null);
  protected readonly pending = signal<PendingAction>(null);
  protected readonly erasing = signal(false);
  protected readonly issuing = signal(false);
  protected readonly eraseConfirmed = signal(false);
  protected readonly eraseError = signal<string | null>(null);
  protected readonly ids = SECTIONS;
  protected readonly section = sectionOf(this.route.snapshot.paramMap.get('section'));
  protected readonly drill = inject(CompactLayout).listsAsRows;

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
  private readonly withdrawnKeyIds = signal<ReadonlySet<string>>(new Set());
  private withdrawnKeysRequested = false;
  protected readonly total = computed(() =>
    this.crowns(this.detail()?.donations.totalAmountMinor ?? 0),
  );
  protected readonly sections = computed<CardSection[]>(() => [
    SECTIONS.details,
    ...(this.accountState() === 'ready' ? [SECTIONS.signIn] : []),
    SECTIONS.accounts,
    ...(this.donationsState() === 'ready' ? [SECTIONS.donations, SECTIONS.receipts] : []),
  ]);
  protected readonly drillSections = computed<CardSection[]>(() => [
    SECTIONS.details,
    ...(this.accountState() === 'missing' ? [] : [SECTIONS.signIn]),
    SECTIONS.accounts,
    ...(this.donationsState() === 'missing' ? [] : [SECTIONS.donations, SECTIONS.receipts]),
    ...(this.accountState() === 'missing' ? [] : [SECTIONS.erasure]),
  ]);
  protected readonly partWaiting = computed<{ part: CardSection; state: LoadState } | null>(() => {
    const part = Object.values(SECTIONS).find(({ id }) => id === this.section);
    if (part === undefined || part === SECTIONS.details || part === SECTIONS.accounts) {
      return null;
    }
    const state =
      part === SECTIONS.donations || part === SECTIONS.receipts
        ? this.donationsState()
        : this.accountState();
    return state === 'ready' ? null : { part, state };
  });
  protected readonly donationYears = computed<DonationYear[]>(() => {
    const years: { year: string; items: DonationItem[] }[] = [];
    for (const item of this.donations()) {
      const year = item.receivedAt.slice(0, 4);
      const last = years.at(-1);
      if (last?.year === year) {
        last.items.push(item);
      } else {
        years.push({ year, items: [item] });
      }
    }
    return years.map(({ year, items }) => {
      const received = items.filter((item) => item.status !== 'REFUNDED');
      const total = this.crowns(received.reduce((sum, item) => sum + item.amountMinor, 0));
      return {
        year,
        items,
        heading: $localize`:@@admin.donorDetail.donations.yearHeading:${year}:year: · ${this.donationsCount(received.length)}:count: · ${total}:total:\u00a0Kč`,
      };
    });
  });
  protected readonly erasedAt = computed(
    () => this.account()?.erasedAt ?? this.detail()?.donor.erasedAt ?? null,
  );
  protected readonly issueChoices = computed<IssueChoice[]>(() => {
    const detail = this.detail();
    return detail === null || this.erasedAt() !== null ? [] : issueChoicesOf(detail);
  });
  protected readonly issueChoice = linkedSignal<IssueChoice[], string>({
    source: this.issueChoices,
    computation: (choices, previous) =>
      choices.find((choice) => choice.key === previous?.value)?.key ?? choices[0]?.key ?? '',
  });

  constructor() {
    this.pdfs.whenSessionEnds(() => this.sendToSignIn());
    this.pdfs.whenReceiptReplaced((receiptId) => this.receiptReplaced(receiptId));
    this.loadAccount();
    this.loadDonations();
    let wasOffline = this.connectivity.offline();
    effect(() => {
      const offline = this.connectivity.offline();
      untracked(() => {
        if (wasOffline && !offline && this.donationsUnreachable()) {
          this.loadDonations();
        } else if (wasOffline && !offline && this.bankAccountsSource() === 'offline') {
          this.bankAccountsSource.set('pending');
          this.readCard();
        }
        wasOffline = offline;
      });
    });
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
    this.showSectionOnWideScreens();
  }

  private showSectionOnWideScreens(): void {
    const section = this.section;
    if (section === null) {
      return;
    }
    const effect = afterRenderEffect(
      () => {
        const listed = this.drillSections().some((part) => part.id === section);
        const target = this.byId(section);
        if (this.drill() || !listed || target === null) {
          return;
        }
        const focused = this.document.activeElement;
        if (
          focused === null ||
          focused === this.document.body ||
          focused === this.title().nativeElement
        ) {
          target.focus();
        }
        effect.destroy();
      },
      { injector: this.injector },
    );
  }

  protected shows(part: CardSection): boolean {
    return !this.drill() || this.section === part.id;
  }

  protected sectionMeta(part: CardSection): string | null {
    const fromDonations =
      part === SECTIONS.accounts || part === SECTIONS.donations || part === SECTIONS.receipts;
    const state = fromDonations ? this.donationsState() : this.accountState();
    if (state === 'error') {
      return $localize`:@@admin.donorDetail.rows.failed:Nepodařilo se načíst, otevřete a zkuste znovu`;
    }
    if (fromDonations && state !== 'ready') {
      return null;
    }
    switch (part.id) {
      case SECTIONS.accounts.id:
        return accountsCount(this.bankAccounts().length);
      case SECTIONS.donations.id:
        return $localize`:@@admin.donorDetail.rows.donations:${this.donationsCount(this.receivedCount())}:count: za ${this.total()}:total:\u00a0Kč`;
      case SECTIONS.receipts.id:
        return receiptsCount(this.receipts().length);
      case SECTIONS.erasure.id:
        return this.erasedAt() === null
          ? null
          : $localize`:@@admin.donorDetail.rows.erased:Údaje jsou vymazané`;
      default:
        return null;
    }
  }

  protected loadAccount(): void {
    this.accountState.set('loading');
    this.reads
      .account(this.donorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (account) => {
          this.account.set(account);
          this.accountState.set('ready');
        },
        error: (failure: unknown) => this.accountState.set(this.stateAfter(failure)),
      });
  }

  private refreshAccount(onLoaded?: () => void): void {
    this.reads.changed();
    this.reads
      .account(this.donorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (account) => {
          this.account.set(account);
          this.accountState.set('ready');
          onLoaded?.();
        },
        error: (failure: unknown) => this.accountState.set(this.stateAfter(failure)),
      });
  }

  protected loadDonations(onLoaded?: () => void): void {
    this.donationsState.set('loading');
    if (onLoaded !== undefined) {
      this.reads.changed();
    }
    this.onCardLoaded = onLoaded;
    this.readCard();
  }

  private loadWithdrawnKeysFor(detail: AdminDonorDetailResponse): void {
    if (this.withdrawnKeysRequested || !detail.receipts.some((receipt) => receipt.active)) {
      return;
    }
    this.withdrawnKeysRequested = true;
    this.receiptKeys
      .list()
      .pipe(
        switchMap((list) => {
          const settled = this.pendingTasks.add();
          return from(trustedKeys(list, this.hostname).finally(settled));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (trusted) =>
          this.withdrawnKeyIds.set(
            new Set(
              (trusted?.keys ?? [])
                .filter((key) => key.status === 'revoked')
                .map((key) => key.keyId),
            ),
          ),
        error: () => this.withdrawnKeyIds.set(new Set()),
      });
  }

  protected signedWithWithdrawnKey(receipt: AdminReceiptResponse): boolean {
    return this.withdrawnKeyIds().has(receipt.keyId);
  }

  protected withdrawnKeyNoteId(receipt: AdminReceiptResponse): string {
    return `receipt-key-note-${receipt.id}`;
  }

  private receiptReplaced(receiptId: string): void {
    const number = this.receipts().find((receipt) => receipt.id === receiptId)?.number ?? '';
    this.cardNotice.set({
      card: 'receipts',
      notice: {
        kind: 'alert',
        text: $localize`:@@admin.donorDetail.receiptPdf.replaced:Potvrzení ${number}:number: mezitím nahradilo novější, a tak jsme jeho PDF nevytvořili. Seznam potvrzení jsme obnovili.`,
      },
    });
    this.refreshDonations();
    this.focusAfterRender(() => this.noticeElement('receipts'));
  }

  private refreshDonations(): void {
    this.reads.changed();
    this.readCard();
  }

  protected reloadBankAccounts(): void {
    this.bankAccountsSource.set('pending');
    this.cardNotice.set(null);
    this.focusAfterRender(() => this.byId(this.ids.accounts.id));
    this.readCard(true);
  }

  protected serverAway(): boolean {
    return !this.connectivity.offline() || this.connectivity.cause() === 'server';
  }

  private readCard(retried = false): void {
    this.donationsUnreachable.set(false);
    this.cardRead?.unsubscribe();
    this.cardRead = this.reads
      .donorCard(this.donorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ detail, bankAccounts }) => {
          this.detail.set(detail);
          this.bankAccountsSource.set(bankAccounts);
          this.donationsState.set('ready');
          if (retried && bankAccounts === 'server') {
            this.cardNotice.set({
              card: 'accounts',
              notice: {
                kind: 'status',
                text: $localize`:@@admin.donorDetail.accounts.reloaded:Bankovní účty dárce jsme načetli.`,
              },
            });
          }
          this.loadWithdrawnKeysFor(detail);
          if (bankAccounts !== 'pending') {
            const loaded = this.onCardLoaded;
            this.onCardLoaded = undefined;
            loaded?.();
          }
        },
        error: (failure: unknown) => {
          this.donationsUnreachable.set(isUnreachable(failure) || this.connectivity.offline());
          this.donationsState.set(this.stateAfter(failure));
        },
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

  protected receiptPdfId(receipt: AdminReceiptResponse): string {
    return `potvrzeni-pdf-${receipt.id}`;
  }

  protected cancelReceiptPdf(receipt: AdminReceiptResponse): void {
    this.pdfs.cancel(receipt.id);
    this.focusAfterRender(() => this.byId(this.receiptPdfId(receipt)));
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
      (onLoaded) => this.refreshAccount(onLoaded),
      'signIn',
    );
  }

  protected removePasskeys(): void {
    const name = this.name() ?? '';
    this.run(
      this.api.removePasskeys(this.donorId),
      $localize`:@@admin.donorDetail.passkeys.done:Přístupové klíče u ${name}:name: jsme odebrali a všechna přihlášení ukončili. Dárce dostal e-mail; po přihlášení heslem si může přidat nový klíč.`,
      $localize`:@@admin.donorDetail.passkeys.failed:Přístupové klíče se nepodařilo odebrat. Zkuste to prosím znovu.`,
      (onLoaded) => this.refreshAccount(onLoaded),
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
              text: $localize`:@@admin.donorDetail.erase.done:Osobní údaje dárce jsme vymazali a na jeho dosavadní e-mail poslali potvrzení. Účet už nejde použít. Dary a vydaná potvrzení zůstávají kvůli účetnictví; potvrzení zůstávají beze změny, i se jménem a adresou.`,
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

  protected issue(): void {
    const choice = this.issueChoices().find((candidate) => candidate.key === this.issueChoice());
    if (this.issuing() || choice === undefined) {
      return;
    }
    const known = new Set(this.receipts().map((receipt) => receipt.id));
    this.issuing.set(true);
    this.cardNotice.set(null);
    this.api
      .issueReceipt(this.donorId, choice.request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (issued) => {
          this.issuing.set(false);
          this.cardNotice.set({
            card: 'receipts',
            notice: { kind: 'status', text: issuedText(issued, known.has(issued.id)) },
          });
          this.refreshDonations();
          this.focusAfterRender(() => this.noticeElement('receipts'));
        },
        error: (failure: unknown) => {
          this.issuing.set(false);
          this.cardNotice.set({
            card: 'receipts',
            notice: {
              kind: 'alert',
              text: describeProblem(
                failure,
                $localize`:@@admin.donorDetail.issue.failed:Potvrzení se nepodařilo vystavit. Zkuste to prosím znovu.`,
              ),
            },
          });
          this.focusAfterRender(() => this.issueSubmit()?.nativeElement ?? null);
        },
      });
  }

  protected disconnect(item: AdminBankAccountItem): void {
    this.run(
      this.api.disconnectDonorAccount(this.donorId, item.id, item.version),
      $localize`:@@admin.donorDetail.disconnect.done:Párování z účtu ${item.accountNumber}:account: je vypnuté: platby bez symbolu z něj už dárci nepřiřadíme, dosavadní dary zůstávají.`,
      $localize`:@@admin.donorDetail.disconnect.failed:Párování se nepodařilo vypnout. Zkuste to prosím znovu.`,
      (onLoaded) => this.loadDonations(onLoaded),
      'accounts',
    );
  }

  protected reconnect(item: AdminBankAccountItem): void {
    this.run(
      this.api.reconnectDonorAccount(this.donorId, item.id, item.version),
      $localize`:@@admin.donorDetail.reconnect.done:Párování z účtu ${item.accountNumber}:account: zase zapneme, jakmile z něj přijde platba s variabilním symbolem dárce.`,
      $localize`:@@admin.donorDetail.reconnect.failed:Párování se nepodařilo zapnout. Zkuste to prosím znovu.`,
      (onLoaded) => this.loadDonations(onLoaded),
      'accounts',
    );
  }

  protected remove(item: AdminBankAccountItem): void {
    this.run(
      this.api.removeDonorAccount(this.donorId, item.id, item.version),
      $localize`:@@admin.donorDetail.remove.done:Účet ${item.accountNumber}:account: jsme dárci odebrali: ${this.donationsCount(item.donationCount)}:donations: přiřazené přes něj jsme smazali a platby jsou zase nespárované.`,
      $localize`:@@admin.donorDetail.remove.failed:Účet se nepodařilo odebrat. Zkuste to prosím znovu.`,
      (onLoaded) => this.loadDonations(onLoaded),
      'accounts',
    );
  }

  protected reloadAfterChange(): void {
    const changed = this.changedMeanwhile();
    this.changedMeanwhile.set(null);
    if (!changed) {
      return;
    }
    changed.reload(() => {
      this.cardNotice.set({
        card: changed.card,
        notice: {
          kind: 'status',
          text: $localize`:@@admin.donorDetail.reloaded:Načetli jsme aktuální stav účtů dárce. Zkontrolujte účet a rozhodněte znovu.`,
        },
      });
      this.focusAfterRender(() => this.noticeElement(changed.card));
    });
  }

  private run(
    request: Observable<void>,
    done: string,
    failed: string,
    reload: (onLoaded?: () => void) => void,
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
        if (isChangedMeanwhile(failure)) {
          this.cardNotice.set(null);
          this.changedMeanwhile.set({ reload, card });
          return;
        }
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
          : card === 'receipts'
            ? this.receiptsNotice()
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

function issueChoicesOf(detail: AdminDonorDetailResponse): IssueChoice[] {
  const received = detail.donations.items.filter((item) => item.status === 'RECEIVED');
  const years: IssueChoice[] = [];
  for (
    let year = detail.yearlyReceiptsAvailableThrough;
    year >= detail.receiptsAvailableFrom;
    year--
  ) {
    if (received.some((item) => item.receivedAt.startsWith(`${year}-`))) {
      years.push({
        key: `rok-${year}`,
        label: $localize`:@@admin.donorDetail.issue.yearly:Roční potvrzení za rok ${year}:year:`,
        request: { year },
      });
    }
  }
  const singles = received
    .filter((item) => item.receiptAvailable)
    .map((item) => ({
      key: `dar-${item.id}`,
      label: $localize`:@@admin.donorDetail.issue.single:Dar z ${formatDonationDate(item.receivedAt)}:day:, ${formatMinorUnits(item.amountMinor)}:amount:\u00a0Kč`,
      request: { donationId: item.id },
    }));
  return [...years, ...singles];
}

function issuedText(issued: AdminIssuedReceiptResponse, alreadyIssued: boolean): string {
  const time = formatBankTime(issued.issuedAt);
  if (alreadyIssued) {
    return $localize`:@@admin.donorDetail.issue.unchanged:Potvrzení ${issued.number}:number: z ${time}:time: dál platí: údaje se nezměnily, nové číslo jsme nevydali.`;
  }
  const replaced = issued.receipt.replaces;
  return replaced === null
    ? $localize`:@@admin.donorDetail.issue.done:Vystavili jsme potvrzení ${issued.number}:number: z ${time}:time:. Je platné.`
    : $localize`:@@admin.donorDetail.issue.replacing:Vystavili jsme potvrzení ${issued.number}:number: z ${time}:time:, které nahrazuje potvrzení ${replaced.number}:replaced:. Je platné.`;
}

function sectionOf(id: string | null): string | null {
  return id !== null && SECTION_IDS.has(id) ? id : null;
}

function accountsCount(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.donorDetail.rows.accounts.one:1 účet`;
    case 'few':
      return $localize`:@@admin.donorDetail.rows.accounts.few:${count}:count: účty`;
    case 'other':
      return $localize`:@@admin.donorDetail.rows.accounts.many:${count}:count: účtů`;
  }
}

function receiptsCount(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.donorDetail.rows.receipts.one:1 vydané potvrzení`;
    case 'few':
      return $localize`:@@admin.donorDetail.rows.receipts.few:${count}:count: vydaná potvrzení`;
    case 'other':
      return $localize`:@@admin.donorDetail.rows.receipts.many:${count}:count: vydaných potvrzení`;
  }
}
