/// <reference types="@angular/localize" />

import { NgTemplateOutlet } from '@angular/common';
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
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { QrCode } from '../../../shared/ui/qr-code/qr-code';
import { encodeText } from '../../../shared/ui/qr-code/qr-encoder';
import { QrMatrix } from '../../../shared/ui/qr-code/qr-matrix';
import { ZoomQr } from '../../../shared/ui/zoom-viewer/zoom-content';
import { Zoomable } from '../../../shared/ui/zoom-viewer/zoomable';
import { formatCrowns } from '../donation-amount';
import { formatIban } from '../iban-format';
import { PaymentAccount, PaymentDetails } from '../payment-details-api';
import { PaymentDetailsStore } from '../payment-details-store';
import { saveBlob } from '../file-download';
import { spayd } from '../spayd';
import {
  Handoff,
  handOver,
  IMAGE_FILE_NAME,
  imageFile,
  sharesImages,
  spaydFile,
} from './bank-handoff';
import { ChosenAmount, ChosenAmountStore } from './chosen-amount';

const DEFAULT_AMOUNT = 500;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 1_000_000;
const MINOR_PER_CROWN = 100;
const REDRAW_DELAY_MS = 400;
const ANNOUNCE_DELAY_MS = 1200;
const PAYMENT_QR_LEVEL = 'H';
const SAVED_QR_SIDE_PX = 720;

interface AmountPreset {
  readonly amount: number;
  readonly label: string;
}

interface Payment {
  readonly spayd: string;
  readonly matrix: QrMatrix;
}

type HandoffNotice = 'bankNotOpened' | 'spaydDownloaded' | 'imageSaved';

interface PreparedImage {
  readonly matrix: QrMatrix;
  readonly png: Blob | null;
}

type QrState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly payment: Payment }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'amountInvalid' };

export type PaymentAccountState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly account: PaymentAccount }
  | { readonly kind: 'failed' };

@Component({
  selector: 'app-payment-panel',
  imports: [CopyButton, NgTemplateOutlet, QrCode, Zoomable],
  templateUrl: './payment-panel.html',
  styleUrl: './payment-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentPanel {
  private readonly store = inject(PaymentDetailsStore);
  private readonly injector = inject(Injector);
  private readonly chosenAmount = inject(ChosenAmountStore);
  protected readonly compact = inject(CompactLayout).isCompact;
  private readonly bankLabel = viewChild<ElementRef<HTMLElement>>('bankLabel');
  private readonly qrBox = viewChild<ElementRef<HTMLElement>>('qrBox');
  private readonly bankApp = viewChild<ElementRef<HTMLElement>>('bankApp');
  private readonly bankAppOpen = viewChild<ElementRef<HTMLButtonElement>>('bankAppOpen');
  private readonly retryButton = viewChild<ElementRef<HTMLButtonElement>>('retryButton');

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
  private readonly drawnAmount = signal<number | null>(this.initial.amount);
  protected readonly redrawing = signal(false);
  private readonly announced = signal<number | null>(null);
  private lastAnnounced: number | null = null;
  private retried = false;
  protected readonly failureAlerts = signal(false);
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
    const payment = paymentOf(stored.details, amount, this.variableSymbol());
    return payment === null ? { kind: 'refused' } : { kind: 'ready', payment };
  });

  private readonly payment = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.payment : null;
  });

  protected readonly qrMatrix = computed(() => this.payment()?.matrix ?? null);
  protected readonly drawnCrowns = computed(() => {
    const amount = this.drawnAmount();
    return amount === null ? '' : formatCrowns(amount);
  });

  protected readonly qrLabel = $localize`:@@home.donate.qr.imageAlt:QR platba na účet Nadačního fondu Nová naděje`;
  protected readonly zoomedQr = computed<ZoomQr | null>(() => {
    const matrix = this.qrMatrix();
    return matrix ? { kind: 'qr', matrix, label: this.qrLabel } : null;
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

  private readonly shareTitle = $localize`:@@home.donate.bankApp.shareTitle:QR platba`;
  protected readonly sendsImages = sharesImages();
  protected readonly qrShown = signal(false);
  protected readonly handingOff = signal(false);
  protected readonly handoffNotice = signal<HandoffNotice | null>(null);
  protected readonly handoffReady = computed(() => this.payment() !== null && !this.redrawing());
  private readonly preparedImage = signal<PreparedImage | null>(null);
  protected readonly imageReady = computed(() => {
    const matrix = this.qrMatrix();
    return (
      this.handoffReady() &&
      matrix !== null &&
      (!this.sendsImages || this.preparedImage()?.matrix === matrix)
    );
  });

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
    return account ? formatIban(account.iban) : '';
  });

  protected readonly amountLabelId = computed(() => `${this.idPrefix()}-amount-label`);
  protected readonly customAmountId = computed(() => `${this.idPrefix()}-custom-amount`);
  protected readonly amountHintId = computed(() => `${this.idPrefix()}-amount-hint`);
  protected readonly redrawHintId = computed(() => `${this.idPrefix()}-redraw-hint`);
  protected readonly qrRegionId = computed(() => `${this.idPrefix()}-qr`);
  protected readonly otherDeviceId = computed(() => `${this.idPrefix()}-other-device`);
  protected readonly customAmountDescription = computed(() =>
    this.showAmountHint() ? `${this.redrawHintId()} ${this.amountHintId()}` : this.redrawHintId(),
  );

  constructor() {
    this.store.load();
    effect(() => this.focusAfterRetry(this.state().kind));
    afterRenderEffect(() => this.prepareImage());
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.redrawTimer);
      clearTimeout(this.announceTimer);
    });
  }

  choosePreset(amount: number): void {
    this.clearNotices();
    this.customChosen.set(false);
    this.presetAmount.set(amount);
    this.chosenAmount.remember({ amount, custom: false });
    this.redrawNow();
    this.announceAfterQuiet();
  }

  chooseCustomAmount(): void {
    if (this.customChosen()) {
      return;
    }
    this.clearNotices();
    this.customAmount.set(null);
    this.customText.set('');
    this.customAmountLeft.set(false);
    this.customChosen.set(true);
    this.announced.set(null);
    this.lastAnnounced = null;
    clearTimeout(this.announceTimer);
    this.redrawLater();
  }

  enterCustomAmount(event: Event): void {
    this.clearNotices();
    const typed = wholeCrowns((event.target as HTMLInputElement).value);
    this.customAmount.set(typed);
    const amount = wholeAmountInRange(typed);
    if (amount !== null) {
      this.chosenAmount.remember({ amount, custom: true });
    }
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
    this.failureAlerts.set(true);
    (this.compact() ? this.bankApp() : this.qrBox())?.nativeElement.focus();
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
      link.download = IMAGE_FILE_NAME;
      link.click();
      this.savedQrFile.set(IMAGE_FILE_NAME);
    } finally {
      this.saving.set(false);
    }
  }

  toggleQr(): void {
    this.qrShown.update((shown) => !shown);
  }

  async openInBankApp(): Promise<void> {
    const payment = this.payment();
    if (payment === null || !this.handoffReady() || this.handingOff()) {
      return;
    }
    this.clearNotices();
    this.handingOff.set(true);
    try {
      const handoff = await handOver(spaydFile(payment.spayd), this.shareTitle);
      if (this.payment() === payment) {
        this.handoffNotice.set(bankNotice(handoff));
      }
    } finally {
      this.handingOff.set(false);
    }
  }

  async sendQrImage(): Promise<void> {
    const qrCode = this.qrCode();
    const payment = this.payment();
    if (!qrCode || payment === null || !this.imageReady() || this.handingOff()) {
      return;
    }
    this.clearNotices();
    this.handingOff.set(true);
    try {
      const prepared = this.preparedImage()?.png ?? null;
      const saved =
        prepared === null
          ? this.saveImage(await qrCode.pngBlob(SAVED_QR_SIDE_PX))
          : await this.shareImage(imageFile(prepared));
      if (saved && this.payment() === payment) {
        this.savedQrFile.set(IMAGE_FILE_NAME);
        this.handoffNotice.set('imageSaved');
      }
    } finally {
      this.handingOff.set(false);
    }
  }

  private async shareImage(file: File): Promise<boolean> {
    const handoff = await handOver(file, this.shareTitle);
    if (handoff === 'refused') {
      saveBlob({ blob: file, fileName: file.name });
    }
    return handoff === 'refused' || handoff === 'downloaded';
  }

  private saveImage(png: Blob): boolean {
    saveBlob({ blob: png, fileName: IMAGE_FILE_NAME });
    return true;
  }

  private clearNotices(): void {
    this.savedQrFile.set(null);
    this.handoffNotice.set(null);
  }

  private prepareImage(): void {
    const qrCode = this.qrCode();
    const matrix = this.qrMatrix();
    if (!this.compact() || !this.sendsImages || !qrCode || matrix === null || this.redrawing()) {
      return;
    }
    if (this.preparedImage()?.matrix === matrix) {
      return;
    }
    const keep = (png: Blob | null) => {
      if (this.qrMatrix() === matrix) {
        this.preparedImage.set({ matrix, png });
      }
    };
    qrCode.pngBlob(SAVED_QR_SIDE_PX).then(keep, () => keep(null));
  }

  private redrawLater(): void {
    this.redrawing.set(true);
    clearTimeout(this.redrawTimer);
    this.redrawTimer = setTimeout(() => this.redrawNow(), REDRAW_DELAY_MS);
  }

  private redrawNow(): void {
    clearTimeout(this.redrawTimer);
    this.redrawing.set(false);
    const amount = this.amount();
    if (amount === null) {
      this.lastAnnounced = null;
    }
    this.drawnAmount.set(amount);
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
    if (kind === 'ready') {
      this.failureAlerts.set(false);
    }
    if (!this.retried || kind === 'loading') {
      return;
    }
    this.retried = false;
    if (kind === 'ready' && this.compact()) {
      afterNextRender(() => this.bankAppOpen()?.nativeElement.focus(), { injector: this.injector });
    }
    if (kind === 'unavailable' || kind === 'refused') {
      afterNextRender(() => this.retryButton()?.nativeElement.focus(), { injector: this.injector });
    }
  }
}

function paymentOf(
  details: PaymentDetails,
  amount: number,
  variableSymbol: string | null,
): Payment | null {
  const payment = spayd(details, { amountMinor: amount * MINOR_PER_CROWN, variableSymbol });
  if (!('spayd' in payment)) {
    return null;
  }
  try {
    return { spayd: payment.spayd, matrix: encodeText(payment.spayd, PAYMENT_QR_LEVEL) };
  } catch {
    return null;
  }
}

function bankNotice(handoff: Handoff): HandoffNotice | null {
  switch (handoff) {
    case 'shared':
      return null;
    case 'downloaded':
      return 'spaydDownloaded';
    default:
      return 'bankNotOpened';
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

function wholeCrowns(typed: string): number | null {
  const digits = typed.replace(/\s/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

function wholeAmountInRange(amount: number | null): number | null {
  return amount !== null && Number.isInteger(amount) && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT
    ? amount
    : null;
}
