/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, Injector, input, output, signal, viewChild } from '@angular/core';
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
import { CopyButton } from '../../../../shared/ui/copy-button/copy-button';
import { Dialog } from '../../../../shared/ui/dialog/dialog';
import { BankAccountItem, BankAccountListResponse, BankAccountsApi } from '../../../donations/bank-accounts-api';
import { formatCrowns } from '../../../donations/donation-amount';
import { formatDonationDate } from '../../../donations/donation-date';
import { BankCheckResponse, DonationsApi } from '../../../donations/donations-api';
import { PaymentQrApi, PaymentQrResponse } from '../../../donations/payment-qr-api';

type ListState = 'loading' | 'ready' | 'error';

type QrState = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly qr: PaymentQrResponse } | { readonly kind: 'failed' };

type PaymentWatch = 'waiting' | 'stopped';

type AccountLabel = 'active' | 'shared' | 'awaiting' | 'disconnected';

const LABELS: Record<AccountLabel, string> = {
  active: $localize`:@@donor.bankAccounts.status.active:Ověřený`,
  shared: $localize`:@@donor.bankAccounts.status.shared:Sdílený`,
  awaiting: $localize`:@@donor.bankAccounts.status.awaiting:Čeká na platbu`,
  disconnected: $localize`:@@donor.bankAccounts.status.disconnected:Párování vypnuto`,
};

const HINTS: Record<AccountLabel, string> = {
  active: $localize`:@@donor.bankAccounts.hint.active:Platby bez variabilního symbolu z něj vám přiřazujeme automaticky.`,
  shared: $localize`:@@donor.bankAccounts.hint.shared:Tento účet ověřil i jiný dárce, proto z něj platby bez vašeho variabilního symbolu nepřiřazujeme nikomu. Pokud z něj dary posílá jen druhý dárce, vypněte u něj párování a platby se začnou přiřazovat jemu. Jinak z něj prosím posílejte vždy s vaším variabilním symbolem.`,
  awaiting: $localize`:@@donor.bankAccounts.hint.awaiting:Pošlete z účtu 1 Kč s vaším variabilním symbolem, pak párování znovu zapneme.`,
  disconnected: '',
};

const DISCONNECTED_MESSAGE = $localize`:@@donor.bankAccounts.disconnected:Párování z účtu jsme vypnuli.`;
const RECONNECTED_MESSAGE = $localize`:@@donor.bankAccounts.reconnected:Účet čeká na vaši platbu 1 Kč.`;
const CHANGE_FAILED = $localize`:@@donor.bankAccounts.error.change:Účet se nepodařilo změnit. Zkuste to prosím znovu.`;

const UNAUTHENTICATED = 'auth/unauthenticated';
const STALE_LIST_STATUSES = [404, 409];
const MINOR_UNITS_PER_CROWN = 100;
const VERIFICATION_AMOUNT = 1;
const PAYMENT_WATCH_INTERVAL_MS = 30_000;
const PAYMENT_WATCH_CHECKS = 20;

@Component({
  selector: 'app-bank-accounts-card',
  imports: [Dialog, CopyButton],
  templateUrl: './bank-accounts-card.html',
  styleUrl: './bank-accounts-card.scss',
})
export class BankAccountsCard {
  private readonly api = inject(BankAccountsApi);
  private readonly paymentQr = inject(PaymentQrApi);
  private readonly donations = inject(DonationsApi);
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly variableSymbol = input<string | null>(null);
  readonly sessionEnded = output<void>();
  readonly bankChecked = output<BankCheckResponse>();

  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  private readonly confirmCancel = viewChild<ElementRef<HTMLButtonElement>>('confirmCancel');

  protected readonly state = signal<ListState>('loading');
  protected readonly accounts = signal<readonly BankAccountItem[]>([]);
  protected readonly confirming = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly actionError = signal('');
  protected readonly actionDone = signal('');

  protected readonly adding = signal(false);
  protected readonly qr = signal<QrState>({ kind: 'loading' });
  protected readonly qrResponse = computed(() => {
    const state = this.qr();
    return state.kind === 'ready' ? state.qr : null;
  });
  protected readonly verificationAmount = VERIFICATION_AMOUNT;
  private qrRequest: Subscription | undefined;

  protected readonly paymentWatch = signal<PaymentWatch>('waiting');
  private readonly activeWhenOpened = signal<ReadonlySet<string> | null>(null);
  protected readonly newlyVerified = computed(() => {
    const known = this.activeWhenOpened();
    if (!this.adding() || known === null) {
      return null;
    }
    return this.accounts().find((account) => account.status === 'ACTIVE' && !known.has(account.id)) ?? null;
  });
  private watchRequest: Subscription | undefined;

  constructor() {
    this.fetch();
    this.destroyRef.onDestroy(() => {
      this.qrRequest?.unsubscribe();
      this.watchRequest?.unsubscribe();
    });
  }

  reload(): void {
    this.fetch();
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
            afterNextRender(() => this.title()?.nativeElement.focus(), { injector: this.injector });
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
    if (this.adding() && this.activeWhenOpened() === null) {
      this.activeWhenOpened.set(activeIds(items));
    }
  }

  protected label(account: BankAccountItem): string {
    return LABELS[labelOf(account)];
  }

  protected hint(account: BankAccountItem): string {
    return HINTS[labelOf(account)];
  }

  protected warns(account: BankAccountItem): boolean {
    return labelOf(account) === 'shared';
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
    return formatCrowns(amountMinor / MINOR_UNITS_PER_CROWN);
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
    this.change(account, this.api.disconnect(account.id), DISCONNECTED_MESSAGE);
  }

  protected reconnect(account: BankAccountItem): void {
    this.actionDone.set('');
    this.change(account, this.api.reconnect(account.id), RECONNECTED_MESSAGE);
  }

  private change(account: BankAccountItem, request$: Observable<void>, doneMessage: string): void {
    if (this.busy() !== null) {
      return;
    }
    this.busy.set(account.id);
    this.actionError.set('');
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(null);
        this.confirming.set(null);
        this.actionDone.set(doneMessage);
        this.fetch(true);
      },
      error: (failure: unknown) => {
        this.busy.set(null);
        if (this.sessionHasEnded(failure)) {
          this.sessionEnded.emit();
          return;
        }
        this.actionError.set(describeProblem(failure, CHANGE_FAILED));
        if (STALE_LIST_STATUSES.includes(problemOf(failure)?.status ?? 0)) {
          this.confirming.set(null);
          this.fetch();
        }
      },
    });
  }

  protected openAdd(): void {
    this.adding.set(true);
    if (this.state() === 'ready') {
      this.activeWhenOpened.set(activeIds(this.accounts()));
    } else {
      this.activeWhenOpened.set(null);
      this.fetch();
    }
    this.loadQr();
    this.watchForPayment();
  }

  protected closeAdd(): void {
    this.qrRequest?.unsubscribe();
    this.watchRequest?.unsubscribe();
    this.adding.set(false);
    this.activeWhenOpened.set(null);
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
                switchMap(() => this.checkForPayment().pipe(repeat({ delay: PAYMENT_WATCH_INTERVAL_MS }))),
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
    this.qrRequest?.unsubscribe();
    this.qr.set({ kind: 'loading' });
    this.qrRequest = this.paymentQr.paymentQr(VERIFICATION_AMOUNT, this.variableSymbol(), 'ACCOUNT_VERIFICATION').subscribe({
      next: (qr) => this.qr.set({ kind: 'ready', qr }),
      error: () => this.qr.set({ kind: 'failed' }),
    });
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
      return 'awaiting';
    case 'DISCONNECTED':
      return 'disconnected';
  }
}

function activeIds(items: readonly BankAccountItem[]): ReadonlySet<string> {
  return new Set(items.filter((account) => account.status === 'ACTIVE').map((account) => account.id));
}

function actionButtonId(account: BankAccountItem): string {
  return `bank-account-action-${account.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function dayAfter(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}
