/// <reference types="@angular/localize" />

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin, map, Observable, of } from 'rxjs';
import { mediaUrl } from '../../../content/news-api';
import { PeopleApi } from '../../../content/people-api';
import {
  AdminApi,
  ChosenReceiptSignatoryResponse,
  ReceiptSignatureResponse,
} from '../../admin-api';
import { SignatureArtwork } from '../../receipt-signature/signature-artwork';

type LoadState = 'loading' | 'ready' | 'error';

interface SignatureBlock {
  signatory: ChosenReceiptSignatoryResponse;
  portraitUrl: string | null;
  signature: ReceiptSignatureResponse | null;
}

const PORTRAIT_WIDTH = 240;

@Component({
  selector: 'app-receipt-signatory',
  imports: [RouterLink, SignatureArtwork],
  templateUrl: './receipt-signatory.html',
  styleUrl: './receipt-signatory.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptSignatory {
  private readonly api = inject(AdminApi);
  private readonly people = inject(PeopleApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  protected readonly state = signal<LoadState>('loading');
  protected readonly block = signal<SignatureBlock | null>(null);
  protected readonly signatureLabel = $localize`:@@admin.signatory.signatureAlt:Podpis na potvrzení`;

  constructor() {
    this.load();
  }

  protected retry(): void {
    this.heading().nativeElement.focus();
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .receiptSignatory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          const signatory = view.signatory;
          if (signatory === null) {
            this.block.set(null);
            this.state.set('ready');
            return;
          }
          this.blockOf(signatory)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (block) => {
                this.block.set(block);
                this.state.set('ready');
              },
              error: () => this.state.set('error'),
            });
        },
        error: () => this.state.set('error'),
      });
  }

  private blockOf(signatory: ChosenReceiptSignatoryResponse): Observable<SignatureBlock> {
    const portrait = signatory.portrait
      ? this.people.load().pipe(
          map((people) => {
            const image = people.members.find(
              (member) => member.id === signatory.personId,
            )?.portrait;
            return image ? mediaUrl(image.id, PORTRAIT_WIDTH) : null;
          }),
        )
      : of(null);
    const signature = signatory.signature
      ? this.api.receiptSignature(signatory.personId)
      : of(null);
    return forkJoin({ portraitUrl: portrait, signature }).pipe(
      map(({ portraitUrl, signature }) => ({ signatory, portraitUrl, signature })),
    );
  }
}
