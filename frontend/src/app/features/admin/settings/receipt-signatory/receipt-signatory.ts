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
import { map, Observable, of } from 'rxjs';
import { mediaUrl } from '../../../content/news-api';
import { PeopleApi } from '../../../content/people-api';
import { AdminApi, ChosenReceiptSignatoryResponse } from '../../admin-api';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { reloadWhenOnlineAgain } from '../../device-copy/online-again';
import { KeptAdministrationAnswers } from '../../kept-administration-answers';

type LoadState = 'loading' | 'ready' | 'error' | 'offline';

export interface SignatureBlock {
  signatory: ChosenReceiptSignatoryResponse;
  portraitUrl: string | null;
  signatureUrl: string | null;
}

const PORTRAIT_WIDTH = 240;
const SIGNATURE_WIDTH = 480;

@Component({
  selector: 'app-receipt-signatory',
  imports: [NeedsConnection, RouterLink],
  templateUrl: './receipt-signatory.html',
  styleUrl: './receipt-signatory.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptSignatory {
  private readonly api = inject(AdminApi);
  private readonly people = inject(PeopleApi);
  private readonly kept = inject(KeptAdministrationAnswers);
  private readonly destroyRef = inject(DestroyRef);
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  protected readonly state = signal<LoadState>('loading');
  private readonly refreshMissed = signal(false);
  protected readonly onlineAgain = reloadWhenOnlineAgain(
    () => this.state() === 'offline' || this.refreshMissed(),
    () => this.load(this.state() === 'ready'),
  );
  protected readonly block = signal<SignatureBlock | null>(null);
  protected readonly signatureLabel = $localize`:@@admin.signatory.signatureAlt:Podpis na potvrzení`;

  constructor() {
    const shown = this.onlineAgain.offline() ? null : this.kept.kept('receipt-signatory');
    if (shown === null) {
      this.load();
      return;
    }
    this.block.set(shown.block);
    this.state.set('ready');
    this.load(true);
  }

  protected retry(): void {
    this.heading().nativeElement.focus();
    this.load();
  }

  protected load(quietly = false): void {
    if (!quietly) {
      this.state.set('loading');
    }
    this.api
      .receiptSignatory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          const signatory = view.signatory;
          if (signatory === null) {
            this.show(null);
            return;
          }
          this.blockOf(signatory)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (block) => this.show(block),
              error: () => this.failed(quietly),
            });
        },
        error: () => this.failed(quietly),
      });
  }

  private show(block: SignatureBlock | null): void {
    this.refreshMissed.set(false);
    this.block.set(block);
    this.state.set('ready');
    this.kept.keep('receipt-signatory', { block });
  }

  private failed(quietly: boolean): void {
    if (quietly && this.state() === 'ready') {
      this.refreshMissed.set(this.onlineAgain.offline());
      return;
    }
    this.state.set(this.onlineAgain.offline() ? 'offline' : 'error');
  }

  private blockOf(signatory: ChosenReceiptSignatoryResponse): Observable<SignatureBlock> {
    if (!signatory.portrait && !signatory.signature) {
      return of({ signatory, portraitUrl: null, signatureUrl: null });
    }
    return this.people.load().pipe(
      map((people) => {
        const member = people.members.find((candidate) => candidate.id === signatory.personId);
        const portrait = signatory.portrait ? member?.portrait : null;
        const signature = signatory.signature ? member?.signature : null;
        return {
          signatory,
          portraitUrl: portrait ? mediaUrl(portrait.id, PORTRAIT_WIDTH) : null,
          signatureUrl: signature ? mediaUrl(signature.id, SIGNATURE_WIDTH) : null,
        };
      }),
    );
  }
}
