/// <reference types="@angular/localize" />

import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, map, Observable, of, startWith, switchMap } from 'rxjs';
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
  imports: [RouterLink],
  templateUrl: './donate-cta.html',
  styleUrl: './donate-cta.scss',
})
export class DonateCta {
  private readonly api = inject(PaymentQrApi);

  readonly variableSymbol = input<string | null>(null);

  protected readonly presets: readonly AmountPreset[] = [
    { amount: 100, label: $localize`:@@home.donate.amount.preset100:100 Kč` },
    { amount: 500, label: $localize`:@@home.donate.amount.preset500:500 Kč` },
    { amount: 1000, label: $localize`:@@home.donate.amount.preset1000:1 000 Kč` },
  ];
  protected readonly minAmount = MIN_AMOUNT;
  protected readonly maxAmount = MAX_AMOUNT;

  protected readonly customChosen = signal(false);
  protected readonly presetAmount = signal(DEFAULT_AMOUNT);
  protected readonly customAmount = signal<number | null>(DEFAULT_AMOUNT);
  protected readonly customAmountSeed = signal(DEFAULT_AMOUNT);
  private readonly attempt = signal(0);

  protected readonly amount = computed(() =>
    this.customChosen() ? wholeAmountInRange(this.customAmount()) : this.presetAmount(),
  );

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
    this.customChosen.set(true);
  }

  enterCustomAmount(event: Event): void {
    const typed = (event.target as HTMLInputElement).valueAsNumber;
    this.customAmount.set(Number.isNaN(typed) ? null : typed);
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
