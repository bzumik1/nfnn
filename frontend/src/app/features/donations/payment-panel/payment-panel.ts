/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounce,
  distinctUntilChanged,
  map,
  Observable,
  of,
  shareReplay,
  startWith,
  switchMap,
  tap,
  timer,
} from 'rxjs';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { QrCode } from '../../../shared/ui/qr-code/qr-code';
import { formatCrowns } from '../donation-amount';
import { BankAccountResponse, PaymentQrApi, PaymentQrResponse } from '../payment-qr-api';
import { ChosenAmount, ChosenAmountStore } from './chosen-amount';

const DEFAULT_AMOUNT = 500;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 1_000_000;
const REQUEST_DEBOUNCE_MS = 300;
const SAVED_QR_SIDE_PX = 720;
const SAVED_QR_FILE = 'qr-platba-nova-nadeje.png';

interface AmountPreset {
  readonly amount: number;
  readonly label: string;
}

interface QrRequest {
  readonly amount: number | null;
  readonly variableSymbol: string | null;
  readonly typed: boolean;
  readonly attempt: number;
}

type QrState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly qr: PaymentQrResponse }
  | { readonly kind: 'failed' }
  | { readonly kind: 'amountInvalid' };

export type PaymentAccountState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly account: BankAccountResponse }
  | { readonly kind: 'failed' };

@Component({
  selector: 'app-payment-panel',
  imports: [CopyButton, QrCode],
  templateUrl: './payment-panel.html',
  styleUrl: './payment-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentPanel {
  private readonly api = inject(PaymentQrApi);
  private readonly injector = inject(Injector);
  private readonly chosenAmount = inject(ChosenAmountStore);
  private readonly bankLabel = viewChild<ElementRef<HTMLElement>>('bankLabel');

  readonly variableSymbol = input<string | null>(null);
  readonly idPrefix = input('donate');

  protected readonly presets: readonly AmountPreset[] = [
    { amount: 1000, label: $localize`:@@home.donate.amount.preset1000:1 000 Kč` },
    { amount: 500, label: $localize`:@@home.donate.amount.preset500:500 Kč` },
    { amount: 100, label: $localize`:@@home.donate.amount.preset100:100 Kč` },
  ];
  protected readonly crowns = formatCrowns;

  private readonly initial = initialChoice(this.presets, this.chosenAmount.remembered());
  protected readonly customChosen = signal(this.initial.custom);
  protected readonly presetAmount = signal(
    this.initial.custom ? DEFAULT_AMOUNT : this.initial.amount,
  );
  protected readonly customAmount = signal<number | null>(
    this.initial.custom ? this.initial.amount : null,
  );
  protected readonly customText = signal(this.initial.custom ? String(this.initial.amount) : '');
  private readonly customAmountLeft = signal(false);
  private readonly amountChanged = signal(false);
  private readonly attempt = signal(0);
  private readonly qrCode = viewChild(QrCode);
  private readonly fetched = new Map<string, Observable<PaymentQrResponse>>();

  readonly amount = computed(() =>
    this.customChosen() ? wholeAmountInRange(this.customAmount()) : this.presetAmount(),
  );

  protected readonly showAmountHint = computed(
    () => this.customChosen() && this.customAmountLeft() && this.amount() === null,
  );

  private readonly request = computed<QrRequest>(() => ({
    amount: this.amount(),
    variableSymbol: this.variableSymbol(),
    typed: this.customChosen(),
    attempt: this.attempt(),
  }));

  protected readonly state = toSignal(
    toObservable(this.request).pipe(
      debounce((request) => (request.typed ? timer(REQUEST_DEBOUNCE_MS) : of(request))),
      distinctUntilChanged(sameRequest),
      switchMap((request) => this.load(request)),
    ),
    { initialValue: { kind: 'loading' } as QrState },
  );

  protected readonly qr = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.qr : null;
  });

  protected readonly shownQr = linkedSignal<QrState, PaymentQrResponse | null>({
    source: this.state,
    computation: (state, previous) => {
      if (state.kind === 'ready') {
        return state.qr;
      }
      return state.kind === 'loading' ? (previous?.value ?? null) : null;
    },
  });

  protected readonly saving = signal(false);
  protected readonly savedQrFile = signal<string | null>(null);
  protected readonly savedQrText = computed(() => {
    const fileName = this.savedQrFile();
    return fileName === null
      ? null
      : $localize`:@@home.donate.qr.saved:QR kód ${fileName}:fileName: je uložený. Najdete ho ve stažených souborech.`;
  });

  protected readonly announcedAmount = computed(() => {
    const amount = this.amount();
    return this.amountChanged() && this.qr() && amount !== null ? amount : null;
  });

  protected readonly bankAccount = linkedSignal<QrState, BankAccountResponse | null>({
    source: this.state,
    computation: (state, previous) =>
      state.kind === 'ready' ? state.qr.bankAccount : (previous?.value ?? null),
  });

  readonly accountState = computed<PaymentAccountState>(() => {
    const account = this.bankAccount();
    if (account) {
      return { kind: 'ready', account };
    }
    return this.state().kind === 'loading' ? { kind: 'loading' } : { kind: 'failed' };
  });

  protected readonly ibanInGroups = computed(() => {
    const account = this.bankAccount();
    return account ? inGroupsOfFour(account.iban) : '';
  });

  protected readonly amountLabelId = computed(() => `${this.idPrefix()}-amount-label`);
  protected readonly customAmountId = computed(() => `${this.idPrefix()}-custom-amount`);
  protected readonly amountHintId = computed(() => `${this.idPrefix()}-amount-hint`);

  choosePreset(amount: number): void {
    this.amountChanged.set(true);
    this.savedQrFile.set(null);
    this.customChosen.set(false);
    this.presetAmount.set(amount);
    this.chosenAmount.remember({ amount, custom: false });
  }

  chooseCustomAmount(): void {
    if (this.customChosen()) {
      return;
    }
    this.savedQrFile.set(null);
    this.customAmount.set(null);
    this.customText.set('');
    this.customAmountLeft.set(false);
    this.customChosen.set(true);
  }

  enterCustomAmount(event: Event): void {
    this.amountChanged.set(true);
    this.savedQrFile.set(null);
    const typed = wholeCrowns((event.target as HTMLInputElement).value);
    this.customAmount.set(typed);
    const amount = wholeAmountInRange(typed);
    if (amount !== null) {
      this.chosenAmount.remember({ amount, custom: true });
    }
  }

  leaveCustomAmount(): void {
    this.customAmountLeft.set(true);
  }

  focusBankDetails(): void {
    afterNextRender(() => this.bankLabel()?.nativeElement.focus(), { injector: this.injector });
  }

  retry(): void {
    this.attempt.update((attempt) => attempt + 1);
  }

  async saveQr(): Promise<void> {
    const qrCode = this.qrCode();
    if (!qrCode || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      const link = document.createElement('a');
      link.href = await qrCode.pngDataUrl(SAVED_QR_SIDE_PX);
      link.download = SAVED_QR_FILE;
      link.click();
      this.savedQrFile.set(SAVED_QR_FILE);
    } finally {
      this.saving.set(false);
    }
  }

  private load(request: QrRequest): Observable<QrState> {
    if (request.amount === null) {
      return of({ kind: 'amountInvalid' });
    }
    const variableSymbol = request.variableSymbol;
    return this.fetch(request.amount, variableSymbol).pipe(
      tap(() => this.prefetchPresets(variableSymbol)),
      map((qr): QrState => ({ kind: 'ready', qr })),
      catchError(() => of<QrState>({ kind: 'failed' })),
      startWith<QrState>({ kind: 'loading' }),
    );
  }

  private prefetchPresets(variableSymbol: string | null): void {
    for (const preset of this.presets) {
      if (!this.fetched.has(qrKey(preset.amount, variableSymbol))) {
        this.fetch(preset.amount, variableSymbol).subscribe({ error: () => undefined });
      }
    }
  }

  private fetch(amount: number, variableSymbol: string | null): Observable<PaymentQrResponse> {
    const key = qrKey(amount, variableSymbol);
    let qr = this.fetched.get(key);
    if (!qr) {
      qr = this.api.paymentQr(amount, variableSymbol).pipe(
        catchError((error: unknown) => {
          this.fetched.delete(key);
          throw error;
        }),
        shareReplay(1),
      );
      this.fetched.set(key, qr);
    }
    return qr;
  }
}

function initialChoice(
  presets: readonly AmountPreset[],
  remembered: ChosenAmount | null,
): ChosenAmount {
  if (remembered === null) {
    return { amount: DEFAULT_AMOUNT, custom: false };
  }
  if (remembered.custom) {
    const amount = wholeAmountInRange(remembered.amount);
    return amount === null ? { amount: DEFAULT_AMOUNT, custom: false } : { amount, custom: true };
  }
  return presets.some((preset) => preset.amount === remembered.amount)
    ? remembered
    : { amount: DEFAULT_AMOUNT, custom: false };
}

function qrKey(amount: number, variableSymbol: string | null): string {
  return `${amount}|${variableSymbol ?? ''}`;
}

function wholeCrowns(typed: string): number | null {
  const digits = typed.replace(/\s/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

function wholeAmountInRange(amount: number | null): number | null {
  return amount !== null && Number.isInteger(amount) && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT
    ? amount
    : null;
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
