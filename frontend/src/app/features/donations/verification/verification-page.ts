import { Location } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { type FoundProof, ProofInput } from './proof-input';
import { ReceiptVerifier, type VerificationStep } from './receipt-verifier';
import { type FinalOutcome, VerificationResult } from './verification-result';

type PageState = { readonly state: 'checking' } | { readonly state: 'empty' } | FinalOutcome;

const PAGE_PATH = '/overit';

@Component({
  selector: 'app-verification-page',
  imports: [ProofInput, VerificationResult],
  templateUrl: './verification-page.html',
  styleUrl: './verification-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationPage {
  private readonly verifier = inject(ReceiptVerifier);
  private readonly location = inject(Location);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private fragment: string | null = null;
  protected readonly scanned = signal(false);
  private run = 0;

  protected readonly page = signal<PageState>({ state: 'checking' });
  protected readonly step = signal<VerificationStep | null>(null);
  protected readonly outcome = computed<FinalOutcome | null>(() => {
    const page = this.page();
    return page.state === 'checking' || page.state === 'empty' ? null : page;
  });

  constructor() {
    const meta = inject(Meta);
    meta.updateTag({ name: 'robots', content: 'noindex' });
    this.destroyRef.onDestroy(() => meta.removeTag('name="robots"'));
    inject(ActivatedRoute)
      .fragment.pipe(takeUntilDestroyed())
      .subscribe((fragment) => {
        this.fragment = fragment;
        this.scanned.set(false);
        if (fragment !== null) {
          this.location.replaceState(PAGE_PATH, '', this.location.getState());
        }
        this.verify();
      });
  }

  protected verifyProof(proof: FoundProof): void {
    this.fragment = proof.fragment;
    this.scanned.set(proof.scanned);
    this.verify();
  }

  protected verifyAnother(): void {
    this.run++;
    this.fragment = null;
    this.step.set(null);
    this.page.set({ state: 'empty' });
    this.focusHeading();
  }

  protected retry(): void {
    this.verify();
    this.focusHeading();
  }

  private verify(): void {
    const run = ++this.run;
    const fragment = this.fragment;
    this.page.set({ state: 'checking' });
    this.step.set(null);
    this.verifier
      .verify(fragment, (step) => {
        if (run === this.run) {
          this.step.set(step);
        }
      })
      .then((outcome) => {
        if (run !== this.run || this.destroyRef.destroyed) {
          return;
        }
        this.page.set(outcome);
        if (outcome.state !== 'empty') {
          this.focusHeading();
        }
      });
  }

  private focusHeading(): void {
    afterNextRender(() => this.host.nativeElement.querySelector('h1')?.focus(), {
      injector: this.injector,
    });
  }
}
