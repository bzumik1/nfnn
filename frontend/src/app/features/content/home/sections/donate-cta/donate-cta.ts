/// <reference types="@angular/localize" />

import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, map, Observable, of, startWith, switchMap } from 'rxjs';
import { LoginDialogService } from '../../../../../core/auth/login-dialog.service';
import { CopyButton } from '../../../../../shared/ui/copy-button/copy-button';
import { formatCrowns } from '../../../../donations/donation-amount';
import { BankAccountResponse, PaymentQrApi, PaymentQrResponse } from '../../../../donations/payment-qr-api';

const DEFAULT_AMOUNT = 500;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 1_000_000;
const REQUEST_DEBOUNCE_MS = 300;

interface AmountPreset {
  readonly amount: number;
  readonly label: string;
}

interface QrRequest {
  readonly amount: number | null;
  readonly variableSymbol: string | null;
  readonly attempt: number;
}

type QrState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly qr: PaymentQrResponse }
  | { readonly kind: 'failed' }
  | { readonly kind: 'amountInvalid' };

@Component({
  selector: 'app-donate-cta',
  imports: [CopyButton],
  templateUrl: './donate-cta.html',
  styleUrl: './donate-cta.scss',
})
export class DonateCta {
  private readonly api = inject(PaymentQrApi);
  private readonly loginDialog = inject(LoginDialogService);

  readonly variableSymbol = input<string | null>(null);

  protected readonly presets: readonly AmountPreset[] = [
    { amount: 1000, label: $localize`:@@home.donate.amount.preset1000:1 000 Kč` },
    { amount: 500, label: $localize`:@@home.donate.amount.preset500:500 Kč` },
    { amount: 100, label: $localize`:@@home.donate.amount.preset100:100 Kč` },
  ];
  protected readonly crowns = formatCrowns;

  protected readonly customChosen = signal(false);
  protected readonly presetAmount = signal(DEFAULT_AMOUNT);
  protected readonly customAmount = signal<number | null>(DEFAULT_AMOUNT);
  protected readonly customAmountSeed = signal(DEFAULT_AMOUNT);
  private readonly customAmountLeft = signal(false);
  private readonly attempt = signal(0);

  protected readonly amount = computed(() =>
    this.customChosen() ? wholeAmountInRange(this.customAmount()) : this.presetAmount(),
  );

  protected readonly showAmountHint = computed(() => this.customChosen() && this.customAmountLeft() && this.amount() === null);

  private readonly request = computed<QrRequest>(() => ({
    amount: this.amount(),
    variableSymbol: this.variableSymbol(),
    attempt: this.attempt(),
  }));

  protected readonly state = toSignal(
    toObservable(this.request).pipe(
      debounceTime(REQUEST_DEBOUNCE_MS),
      distinctUntilChanged(sameRequest),
      switchMap((request) => this.load(request)),
    ),
    { initialValue: { kind: 'loading' } as QrState },
  );

  protected readonly qr = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.qr : null;
  });

  protected readonly bankAccount = linkedSignal<QrState, BankAccountResponse | null>({
    source: this.state,
    computation: (state, previous) => (state.kind === 'ready' ? state.qr.bankAccount : (previous?.value ?? null)),
  });

  protected readonly ibanInGroups = computed(() => {
    const account = this.bankAccount();
    return account ? inGroupsOfFour(account.iban) : '';
  });

  choosePreset(amount: number): void {
    this.customChosen.set(false);
    this.presetAmount.set(amount);
  }

  chooseCustomAmount(): void {
    if (this.customChosen()) {
      return;
    }
    this.customAmountSeed.set(this.presetAmount());
    this.customAmount.set(this.presetAmount());
    this.customAmountLeft.set(false);
    this.customChosen.set(true);
  }

  enterCustomAmount(event: Event): void {
    this.customAmount.set(wholeCrowns((event.target as HTMLInputElement).value));
  }

  leaveCustomAmount(): void {
    this.customAmountLeft.set(true);
  }

  register(): void {
    this.loginDialog.open('register');
  }

  signIn(): void {
    this.loginDialog.open('login');
  }

  retry(): void {
    this.attempt.update((attempt) => attempt + 1);
  }

  private load(request: QrRequest): Observable<QrState> {
    if (request.amount === null) {
      return of({ kind: 'amountInvalid' });
    }
    return this.api.paymentQr(request.amount, request.variableSymbol).pipe(
      map((qr): QrState => ({ kind: 'ready', qr })),
      catchError(() => of<QrState>({ kind: 'failed' })),
      startWith<QrState>({ kind: 'loading' }),
    );
  }
}

function wholeCrowns(typed: string): number | null {
  const digits = typed.replace(/\s/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

function wholeAmountInRange(amount: number | null): number | null {
  return amount !== null && Number.isInteger(amount) && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT ? amount : null;
}

function sameRequest(previous: QrRequest, current: QrRequest): boolean {
  return (
    previous.amount === current.amount &&
    previous.variableSymbol === current.variableSymbol &&
    previous.attempt === current.attempt
  );
}

function inGroupsOfFour(iban: string): string {
  return iban.replace(/(.{4})(?=.)/g, '$1 ');
}
