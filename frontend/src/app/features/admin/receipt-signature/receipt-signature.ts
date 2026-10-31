/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  describeProblem,
  describeProblemWithoutFields,
  problemTypeEndsWith,
} from '../../../core/auth/api-problem';
import { formatBankTime } from '../../donations/donation-date';
import { AdminApi, ReceiptSignatureResponse } from '../admin-api';
import { Notice } from '../../../shared/ui/live-notice/live-notice';
import { FileButton } from '../../../shared/ui/file-button/file-button';
import { SignatureArtwork } from './signature-artwork';

type LoadState = 'loading' | 'ready' | 'error';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SVG_TYPE = 'image/svg+xml';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SVG_BYTES = 200 * 1024;
const UNSUPPORTED_VECTOR = '/donations/unsupported-signature-vector';
const PIXELS = new Intl.NumberFormat('cs-CZ');

@Component({
  selector: 'app-receipt-signature',
  imports: [FileButton, SignatureArtwork],
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

  readonly personId = input.required<string>();
  readonly signs = input(false);
  readonly changed = output<ReceiptSignatureResponse>();
  readonly busyChange = output<boolean>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly signature = signal<ReceiptSignatureResponse | null>(null);
  protected readonly uploading = signal(false);
  protected readonly removing = signal(false);
  protected readonly confirmingRemoval = signal(false);
  protected readonly notice = signal<Notice | null>(null);

  private pending = new Subscription();

  constructor() {
    effect(() => {
      this.personId();
      untracked(() => {
        this.cancelPending();
        this.notice.set(null);
        this.confirmingRemoval.set(false);
        this.signature.set(null);
        this.load();
      });
    });
    this.destroyRef.onDestroy(() => this.pending.unsubscribe());
  }

  protected load(): void {
    this.state.set('loading');
    this.track(
      this.api.receiptSignature(this.personId()).subscribe({
        next: (signature) => {
          this.signature.set(signature);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      }),
    );
  }

  private track(subscription: Subscription): void {
    this.pending.add(subscription);
  }

  private cancelPending(): void {
    this.pending.unsubscribe();
    this.pending = new Subscription();
    this.setUploading(false);
    this.removing.set(false);
  }

  private setUploading(uploading: boolean): void {
    if (this.uploading() !== uploading) {
      this.uploading.set(uploading);
      this.busyChange.emit(uploading);
    }
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
    this.setUploading(true);
    this.track(
      this.api.uploadReceiptSignature(this.personId(), file).subscribe({
        next: (signature) => {
          this.setUploading(false);
          this.signature.set(signature);
          this.changed.emit(signature);
          this.notice.set({
            kind: 'status',
            text: this.signs()
              ? $localize`:@@admin.signature.saved:Podpis je uložený. Ponesou ho potvrzení vystavená od teď.`
              : $localize`:@@admin.signature.savedNotSigning:Podpis je uložený. Potvrzení ho ponesou, až je bude tato osoba podepisovat.`,
          });
        },
        error: (failure: unknown) => {
          this.setUploading(false);
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
      }),
    );
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
    this.track(
      this.api.removeReceiptSignature(this.personId()).subscribe({
        next: () => {
          const removed: ReceiptSignatureResponse = {
            configured: false,
            kind: null,
            image: null,
            vector: null,
            width: null,
            height: null,
            uploadedAt: null,
          };
          this.removing.set(false);
          this.confirmingRemoval.set(false);
          this.signature.set(removed);
          this.changed.emit(removed);
          this.notice.set({
            kind: 'status',
            text: this.signs()
              ? $localize`:@@admin.signature.removed:Podpis je odebraný. Potvrzení vystavená od teď ho nebudou mít.`
              : $localize`:@@admin.signature.removedNotSigning:Podpis je odebraný.`,
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
      }),
    );
  }

  private focusRemoveButton(): void {
    afterNextRender(() => this.removeButton()?.nativeElement.focus(), { injector: this.injector });
  }
}
