/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, map, Observable, of, switchMap } from 'rxjs';
import { mediaUrl } from '../../../content/news-api';
import { PeopleApi } from '../../../content/people-api';
import { AdminApi, ChosenReceiptSignatoryResponse } from '../../admin-api';
import { LoadFailure } from '../../../../shared/ui/load-failure/load-failure';
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
  imports: [LoadFailure, RouterLink],
  templateUrl: './receipt-signatory.html',
  styleUrl: './receipt-signatory.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptSignatory {
  private readonly api = inject(AdminApi);
  private readonly people = inject(PeopleApi);
  private readonly kept = inject(KeptAdministrationAnswers);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<LoadState>('loading');
  protected readonly retrying = signal(false);
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
    this.retrying.set(true);
    this.fetch(false);
  }

  protected load(quietly = false): void {
    if (!quietly) {
      this.state.set('loading');
    }
    this.fetch(quietly);
  }

  private fetch(quietly: boolean): void {
    this.api
      .receiptSignatory()
      .pipe(
        switchMap((view) =>
          view.signatory === null ? of<SignatureBlock | null>(null) : this.blockOf(view.signatory),
        ),
        finalize(() => this.retrying.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (block) => this.show(block),
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
