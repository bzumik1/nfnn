/// <reference types="@angular/localize" />

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
  signal,
  viewChild,
} from '@angular/core';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { QrCode } from '../../../shared/ui/qr-code/qr-code';
import { encodeText } from '../../../shared/ui/qr-code/qr-encoder';
import { QrMatrix } from '../../../shared/ui/qr-code/qr-matrix';
import { formatCrowns } from '../donation-amount';
import { PaymentAccount, PaymentDetails } from '../payment-details-api';
import { PaymentDetailsStore } from '../payment-details-store';
import { spayd } from '../spayd';

const DEFAULT_AMOUNT = 500;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 1_000_000;
const MINOR_PER_CROWN = 100;
const REDRAW_DELAY_MS = 400;
const ANNOUNCE_DELAY_MS = 1200;
const PAYMENT_QR_LEVEL = 'H';
const SAVED_QR_SIDE_PX = 720;
const SAVED_QR_FILE = 'qr-platba-nova-nadeje.png';

interface AmountPreset {
  readonly amount: number;
  readonly label: string;
}

type QrState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly matrix: QrMatrix }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'amountInvalid' };

export type PaymentAccountState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly account: PaymentAccount }
  | { readonly kind: 'failed' };

@Component({
  selector: 'app-payment-panel',
  imports: [CopyButton, QrCode],
  templateUrl: './payment-panel.html',
  styleUrl: './payment-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentPanel {
  private readonly store = inject(PaymentDetailsStore);
  private readonly injector = inject(Injector);
  private readonly bankLabel = viewChild<ElementRef<HTMLElement>>('bankLabel');
  private readonly qrBox = viewChild<ElementRef<HTMLElement>>('qrBox');
  private readonly retryButton = viewChild<ElementRef<HTMLButtonElement>>('retryButton');

  readonly variableSymbol = input<string | null>(null);
  readonly idPrefix = input('donate');

  protected readonly presets: readonly AmountPreset[] = [
    { amount: 1000, label: $localize`:@@home.donate.amount.preset1000:1 000 Kč` },
    { amount: 500, label: $localize`:@@home.donate.amount.preset500:500 Kč` },
    { amount: 100, label: $localize`:@@home.donate.amount.preset100:100 Kč` },
  ];
  protected readonly crowns = formatCrowns;

  protected readonly customChosen = signal(false);
  protected readonly presetAmount = signal(DEFAULT_AMOUNT);
  protected readonly customAmount = signal<number | null>(null);
  private readonly customAmountLeft = signal(false);
  private readonly drawnAmount = signal<number | null>(DEFAULT_AMOUNT);
  protected readonly redrawing = signal(false);
  private readonly announced = signal<number | null>(null);
  private lastAnnounced: number | null = null;
  private retried = false;
  private readonly qrCode = viewChild(QrCode);
  private redrawTimer: ReturnType<typeof setTimeout> | undefined;
  private announceTimer: ReturnType<typeof setTimeout> | undefined;

  readonly amount = computed(() =>
    this.customChosen() ? wholeAmountInRange(this.customAmount()) : this.presetAmount(),
  );

  protected readonly showAmountHint = computed(
    () => this.customChosen() && this.customAmountLeft() && this.amount() === null,
  );

  private readonly details = computed<PaymentDetails | null>(() => {
    const state = this.store.state();
    return state.kind === 'ready' ? state.details : null;
  });

  protected readonly state = computed<QrState>(() => {
    const stored = this.store.state();
    if (stored.kind === 'loading') {
      return stored;
    }
    if (stored.kind === 'failed') {
      return { kind: 'unavailable' };
    }
    const amount = this.drawnAmount();
    if (amount === null) {
      return { kind: 'amountInvalid' };
    }
    const matrix = paymentMatrix(stored.details, amount, this.variableSymbol());
    return matrix === null ? { kind: 'refused' } : { kind: 'ready', matrix };
  });

  protected readonly qrMatrix = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.matrix : null;
  });

  protected readonly busy = computed(() => this.state().kind === 'loading' || this.redrawing());
  protected readonly failure = computed(() => {
    const kind = this.state().kind;
    return kind === 'unavailable' || kind === 'refused' ? kind : null;
  });

  protected readonly saving = signal(false);
  protected readonly savedQrFile = signal<string | null>(null);
  protected readonly savedQrText = computed(() => {
    const fileName = this.savedQrFile();
    return fileName === null
      ? null
      : $localize`:@@home.donate.qr.saved:QR kód ${fileName}:fileName: je uložený. Najdete ho ve stažených souborech.`;
  });

  protected readonly announcedAmount = this.announced.asReadonly();

  protected readonly bankAccount = computed(() => this.details()?.account ?? null);

  readonly accountState = computed<PaymentAccountState>(() => {
    const account = this.bankAccount();
    if (account) {
      return { kind: 'ready', account };
    }
    return this.store.state().kind === 'loading' ? { kind: 'loading' } : { kind: 'failed' };
  });

  protected readonly ibanInGroups = computed(() => {
    const account = this.bankAccount();
    return account ? inGroupsOfFour(account.iban) : '';
  });

  protected readonly amountLabelId = computed(() => `${this.idPrefix()}-amount-label`);
  protected readonly customAmountId = computed(() => `${this.idPrefix()}-custom-amount`);
  protected readonly amountHintId = computed(() => `${this.idPrefix()}-amount-hint`);
  protected readonly redrawHintId = computed(() => `${this.idPrefix()}-redraw-hint`);
  protected readonly customAmountDescription = computed(() =>
    this.showAmountHint() ? `${this.redrawHintId()} ${this.amountHintId()}` : this.redrawHintId(),
  );

  constructor() {
    this.store.load();
    effect(() => this.focusAfterRetry(this.state().kind));
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.redrawTimer);
      clearTimeout(this.announceTimer);
    });
  }

  choosePreset(amount: number): void {
    this.savedQrFile.set(null);
    this.customChosen.set(false);
    this.presetAmount.set(amount);
    this.redrawNow();
    this.announceAfterQuiet();
  }

  chooseCustomAmount(): void {
    if (this.customChosen()) {
      return;
    }
    this.savedQrFile.set(null);
    this.customAmount.set(null);
    this.customAmountLeft.set(false);
    this.customChosen.set(true);
    this.announced.set(null);
    clearTimeout(this.announceTimer);
    this.redrawLater();
  }

  enterCustomAmount(event: Event): void {
    this.savedQrFile.set(null);
    this.customAmount.set(wholeCrowns((event.target as HTMLInputElement).value));
    this.redrawLater();
    this.announceAfterQuiet();
  }

  leaveCustomAmount(): void {
    this.customAmountLeft.set(true);
  }

  focusBankDetails(): void {
    afterNextRender(() => this.bankLabel()?.nativeElement.focus(), { injector: this.injector });
  }

  retry(): void {
    this.retried = true;
    this.qrBox()?.nativeElement.focus();
    this.store.reload();
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

  private redrawLater(): void {
    this.redrawing.set(true);
    clearTimeout(this.redrawTimer);
    this.redrawTimer = setTimeout(() => this.redrawNow(), REDRAW_DELAY_MS);
  }

  private redrawNow(): void {
    clearTimeout(this.redrawTimer);
    this.redrawing.set(false);
    this.drawnAmount.set(this.amount());
    this.store.load();
  }

  private announceAfterQuiet(): void {
    this.announced.set(null);
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => {
      const amount = this.amount();
      if (amount !== null && amount !== this.lastAnnounced && this.qrMatrix() !== null) {
        this.lastAnnounced = amount;
        this.announced.set(amount);
      }
    }, ANNOUNCE_DELAY_MS);
  }

  private focusAfterRetry(kind: QrState['kind']): void {
    if (!this.retried || kind === 'loading') {
      return;
    }
    this.retried = false;
    if (kind === 'unavailable' || kind === 'refused') {
      afterNextRender(() => this.retryButton()?.nativeElement.focus(), { injector: this.injector });
    }
  }
}

function paymentMatrix(
  details: PaymentDetails,
  amount: number,
  variableSymbol: string | null,
): QrMatrix | null {
  const payment = spayd(details, { amountMinor: amount * MINOR_PER_CROWN, variableSymbol });
  if (!('spayd' in payment)) {
    return null;
  }
  try {
    return encodeText(payment.spayd, PAYMENT_QR_LEVEL);
  } catch {
    return null;
  }
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

function inGroupsOfFour(iban: string): string {
  return iban.replace(/(.{4})(?=.)/g, '$1 ');
}
