/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { describeProblem } from '../../../../core/auth/api-problem';
import { formatBankTime } from '../../../donations/donation-date';
import { AdminApi, ReceiptSignatureResponse } from '../../admin-api';

type LoadState = 'loading' | 'ready' | 'error';

interface Notice {
  kind: 'status' | 'alert';
  text: string;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;
const PIXELS = new Intl.NumberFormat('cs-CZ');

@Component({
  selector: 'app-receipt-signature',
  templateUrl: './receipt-signature.html',
  styleUrl: './receipt-signature.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptSignature {
  private readonly api = inject(AdminApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<LoadState>('loading');
  protected readonly signature = signal<ReceiptSignatureResponse | null>(null);
  protected readonly uploading = signal(false);
  protected readonly removing = signal(false);
  protected readonly confirmingRemoval = signal(false);
  protected readonly notice = signal<Notice | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .receiptSignature()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (signature) => {
          this.signature.set(signature);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }

  protected uploadedLine(signature: ReceiptSignatureResponse): string {
    const uploadedAt = formatBankTime(signature.uploadedAt ?? '');
    const width = PIXELS.format(signature.width ?? 0);
    const height = PIXELS.format(signature.height ?? 0);
    return $localize`:@@admin.signature.uploaded:Nahráno ${uploadedAt}:time:, ${width}:width: × ${height}:height: px.`;
  }

  protected upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.uploading()) {
      return;
    }
    this.notice.set(null);
    this.confirmingRemoval.set(false);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.notice.set({
        kind: 'alert',
        text: $localize`:@@admin.signature.wrongType:Vyberte prosím sken ve formátu JPEG, PNG nebo WebP.`,
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      this.notice.set({
        kind: 'alert',
        text: $localize`:@@admin.signature.tooLarge:Soubor je větší než 10 MB. Zmenšete ho prosím a zkuste to znovu.`,
      });
      return;
    }
    this.uploading.set(true);
    this.api
      .uploadReceiptSignature(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (signature) => {
          this.uploading.set(false);
          this.signature.set(signature);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.signature.saved:Podpis je uložený. Ponesou ho potvrzení vystavená od teď.`,
          });
        },
        error: (failure: unknown) => {
          this.uploading.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.signature.failed:Podpis se nepodařilo nahrát. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected askRemoval(): void {
    this.notice.set(null);
    this.confirmingRemoval.set(true);
  }

  protected cancelRemoval(): void {
    this.confirmingRemoval.set(false);
  }

  protected remove(): void {
    if (this.removing()) {
      return;
    }
    this.removing.set(true);
    this.api
      .removeReceiptSignature()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removing.set(false);
          this.confirmingRemoval.set(false);
          this.signature.set({
            configured: false,
            image: null,
            width: null,
            height: null,
            uploadedAt: null,
          });
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.signature.removed:Podpis je odebraný. Potvrzení vystavená od teď ho nebudou mít.`,
          });
        },
        error: (failure: unknown) => {
          this.removing.set(false);
          this.confirmingRemoval.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.signature.removeFailed:Podpis se nepodařilo odebrat. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }
}
