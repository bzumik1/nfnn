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
import { BankAccountItem } from '../../donations/bank-accounts-api';
import { formatCrowns } from '../../donations/donation-amount';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { DonationItem } from '../../donations/donations-api';
import { DashboardTopBar } from '../../donors/dashboard/top-bar/top-bar';
import {
  AdminApi,
  AdminDonorDetailResponse,
  AdminReceiptResponse,
  DonorAccountResponse,
} from '../admin-api';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

interface Notice {
  kind: 'status' | 'alert';
  text: string;
}

type PendingAction =
  | { kind: 'reset' | 'erase' }
  | { kind: 'disconnect' | 'reconnect' | 'remove'; linkId: string }
  | null;

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const NOT_FOUND = '-not-found';
const MINOR_UNITS_PER_CROWN = 100;

const PAIRING_LABELS: Record<NonNullable<DonationItem['pairedBy']>, string> = {
  VARIABLE_SYMBOL: $localize`:@@admin.donorDetail.pairing.variableSymbol:podle variabilního symbolu`,
  SENDER_ACCOUNT: $localize`:@@admin.donorDetail.pairing.senderAccount:podle účtu`,
  CONFIRMED_SYMBOL: $localize`:@@admin.donorDetail.pairing.confirmedSymbol:podle potvrzeného staršího symbolu`,
};

@Component({
  selector: 'app-admin-donor-detail',
  imports: [DashboardTopBar, RouterLink],
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
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly donorId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly accountState = signal<LoadState>('loading');
  protected readonly account = signal<DonorAccountResponse | null>(null);
  protected readonly donationsState = signal<LoadState>('loading');
  protected readonly detail = signal<AdminDonorDetailResponse | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly busy = signal(false);
  protected readonly pending = signal<PendingAction>(null);

  protected readonly name = computed(
    () => this.account()?.name ?? this.detail()?.donor.name ?? null,
  );
  protected readonly bankAccounts = computed(() => this.detail()?.bankAccounts ?? []);
  protected readonly donations = computed(() => this.detail()?.donations.items ?? []);
  protected readonly receipts = computed(() => this.detail()?.receipts ?? []);
  protected readonly total = computed(() =>
    this.crowns(this.detail()?.donations.totalAmountMinor ?? 0),
  );
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

  protected time(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }

  protected day(isoDate: string): string {
    return formatDonationDate(isoDate);
  }

  protected crowns(amountMinor: number): string {
    return formatCrowns(amountMinor / MINOR_UNITS_PER_CROWN);
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
    if (count === 1) {
      return $localize`:@@admin.donorDetail.donations.one:1 dar`;
    }
    if (count >= 2 && count <= 4) {
      return $localize`:@@admin.donorDetail.donations.few:${count}:count: dary`;
    }
    return $localize`:@@admin.donorDetail.donations.many:${count}:count: darů`;
  }

  protected askReset(): void {
    this.pending.set({ kind: 'reset' });
    this.notice.set(null);
  }

  protected askErase(): void {
    this.pending.set({ kind: 'erase' });
    this.notice.set(null);
  }

  protected askAccount(kind: 'disconnect' | 'reconnect' | 'remove', item: BankAccountItem): void {
    this.pending.set({ kind, linkId: item.id });
    this.notice.set(null);
  }

  protected cancel(): void {
    this.pending.set(null);
  }

  protected isPendingReset(): boolean {
    return this.pending()?.kind === 'reset';
  }

  protected isPendingErase(): boolean {
    return this.pending()?.kind === 'erase';
  }

  protected pendingFor(item: BankAccountItem): 'disconnect' | 'reconnect' | 'remove' | null {
    const pending = this.pending();
    if (pending === null || !('linkId' in pending) || pending.linkId !== item.id) {
      return null;
    }
    return pending.kind;
  }

  protected reset(): void {
    const name = this.name() ?? '';
    this.run(
      this.api.resetSecondFactor(this.donorId),
      $localize`:@@admin.donorDetail.reset.done:Dvoufaktorové ověření u ${name}:name: je vypnuté a všechna přihlášení jsme ukončili. Dárce dostal e-mail; po přihlášení heslem si ho může zapnout znovu.`,
      $localize`:@@admin.donorDetail.reset.failed:Dvoufaktorové ověření se nepodařilo vypnout. Zkuste to prosím znovu.`,
      () => this.loadAccount(),
    );
  }

  protected erase(): void {
    this.run(
      this.api.eraseDonor(this.donorId),
      $localize`:@@admin.donorDetail.erase.done:Osobní údaje dárce jsme vymazali a na jeho dosavadní e-mail poslali potvrzení. Účet už nejde použít; dary a vydaná potvrzení zůstávají bez jména.`,
      $localize`:@@admin.donorDetail.erase.failed:Osobní údaje se nepodařilo vymazat. Zkuste to prosím znovu.`,
      () => {
        this.loadAccount();
        this.loadDonations();
      },
    );
  }

  protected disconnect(item: BankAccountItem): void {
    this.run(
      this.api.disconnectDonorAccount(this.donorId, item.id),
      $localize`:@@admin.donorDetail.disconnect.done:Párování z účtu ${item.accountNumber}:account: je vypnuté: platby bez symbolu z něj už dárci nepřiřadíme, dosavadní dary zůstávají.`,
      $localize`:@@admin.donorDetail.disconnect.failed:Párování se nepodařilo vypnout. Zkuste to prosím znovu.`,
      () => this.loadDonations(),
    );
  }

  protected reconnect(item: BankAccountItem): void {
    this.run(
      this.api.reconnectDonorAccount(this.donorId, item.id),
      $localize`:@@admin.donorDetail.reconnect.done:Párování z účtu ${item.accountNumber}:account: zase zapneme, jakmile z něj přijde platba s variabilním symbolem dárce.`,
      $localize`:@@admin.donorDetail.reconnect.failed:Párování se nepodařilo zapnout. Zkuste to prosím znovu.`,
      () => this.loadDonations(),
    );
  }

  protected remove(item: BankAccountItem): void {
    this.run(
      this.api.removeDonorAccount(this.donorId, item.id),
      $localize`:@@admin.donorDetail.remove.done:Účet ${item.accountNumber}:account: jsme dárci odebrali: ${this.donationsCount(item.donationCount)}:donations: přiřazené přes něj jsme smazali a platby jsou zase nespárované.`,
      $localize`:@@admin.donorDetail.remove.failed:Účet se nepodařilo odebrat. Zkuste to prosím znovu.`,
      () => this.loadDonations(),
    );
  }

  private run(request: Observable<void>, done: string, failed: string, reload: () => void): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.pending.set(null);
        this.notice.set({ kind: 'status', text: done });
        reload();
      },
      error: (failure: unknown) => {
        this.busy.set(false);
        this.pending.set(null);
        this.notice.set({ kind: 'alert', text: describeProblem(failure, failed) });
      },
    });
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
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open();
    });
  }
}
