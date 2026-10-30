/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  describeProblem,
  describeProblemWithoutFields,
  problemTypeEndsWith,
} from '../../../../core/auth/api-problem';
import { formatBankTime } from '../../../donations/donation-date';
import {
  AdminApi,
  ReceiptSignatureResponse,
  SignatureVectorPath,
  SignatureVectorResponse,
} from '../../admin-api';
import { Notice } from '../../../../shared/ui/live-notice/live-notice';
import { FileButton } from '../../../../shared/ui/file-button/file-button';

type LoadState = 'loading' | 'ready' | 'error';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SVG_TYPE = 'image/svg+xml';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SVG_BYTES = 200 * 1024;
const HEX_FILL = /^#[0-9a-f]{6}$/;
const BLACK = '#000000';
const UNSUPPORTED_VECTOR = '/donations/unsupported-signature-vector';
const PIXELS = new Intl.NumberFormat('cs-CZ');

@Component({
  selector: 'app-receipt-signature',
  imports: [FileButton],
  templateUrl: './receipt-signature.html',
  styleUrl: './receipt-signature.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptSignature {
  private readonly api = inject(AdminApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly removeButton = viewChild<ElementRef<HTMLButtonElement>>('removeButton');
  private readonly removeCancel = viewChild<ElementRef<HTMLButtonElement>>('removeCancel');

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

  protected viewBox(vector: SignatureVectorResponse): string {
    return vector.viewBox.join(' ');
  }

  protected fill(path: SignatureVectorPath): string {
    return HEX_FILL.test(path.fill) ? path.fill : BLACK;
  }

  protected uploadedLine(signature: ReceiptSignatureResponse): string {
    const uploadedAt = formatBankTime(signature.uploadedAt ?? '');
    if (signature.kind === 'VECTOR') {
      return $localize`:@@admin.signature.uploadedVector:Nahráno ${uploadedAt}:time:, vektorový podpis (SVG).`;
    }
    const width = PIXELS.format(signature.width ?? 0);
    const height = PIXELS.format(signature.height ?? 0);
    return $localize`:@@admin.signature.uploaded:Nahráno ${uploadedAt}:time:, ${width}:width: × ${height}:height: px.`;
  }

  protected upload(file: File): void {
    if (this.uploading()) {
      return;
    }
    this.notice.set(null);
    this.confirmingRemoval.set(false);
    const vector = file.type === SVG_TYPE || file.name.toLowerCase().endsWith('.svg');
    if (!vector && !ACCEPTED_TYPES.includes(file.type)) {
      this.notice.set({
        kind: 'alert',
        text: $localize`:@@admin.signature.wrongType:Vyberte prosím podpis ve formátu SVG nebo sken ve formátu JPEG, PNG či WebP.`,
      });
      return;
    }
    if (vector && file.size > MAX_SVG_BYTES) {
      this.notice.set({
        kind: 'alert',
        text: $localize`:@@admin.signature.svgTooLarge:SVG je větší než 200 kB. Zjednodušte ho prosím a zkuste to znovu.`,
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
          const describe = problemTypeEndsWith(failure, UNSUPPORTED_VECTOR)
            ? describeProblemWithoutFields
            : describeProblem;
          this.notice.set({
            kind: 'alert',
            text: describe(
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
    afterNextRender(() => this.removeCancel()?.nativeElement.focus(), { injector: this.injector });
  }

  protected cancelRemoval(): void {
    this.confirmingRemoval.set(false);
    this.focusRemoveButton();
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
            kind: null,
            image: null,
            vector: null,
            width: null,
            height: null,
            uploadedAt: null,
          });
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.signature.removed:Podpis je odebraný. Potvrzení vystavená od teď ho nebudou mít.`,
          });
          afterNextRender(
            () =>
              this.host.nativeElement
                .querySelector<HTMLInputElement>('#receipt-signature-file')
                ?.focus(),
            { injector: this.injector },
          );
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
          this.focusRemoveButton();
        },
      });
  }

  private focusRemoveButton(): void {
    afterNextRender(() => this.removeButton()?.nativeElement.focus(), { injector: this.injector });
  }
}
