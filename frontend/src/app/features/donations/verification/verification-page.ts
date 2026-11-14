import { DOCUMENT, Location } from '@angular/common';
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
import { CompactLayout } from '../../../core/layout/compact-layout';
import { PageTitle } from '../../donors/dashboard/page-title/page-title';
import { type FoundProof, ProofInput } from './proof-input';
import { ReceiptVerifier, type VerificationStep } from './receipt-verifier';
import { VERIFICATION_CONTEXT } from './verification-context';
import { type FinalOutcome, VerificationResult } from './verification-result';

type PageState = { readonly state: 'checking' } | { readonly state: 'empty' } | FinalOutcome;

@Component({
  selector: 'app-verification-page',
  imports: [PageTitle, ProofInput, VerificationResult],
  templateUrl: './verification-page.html',
  styleUrls: ['./verification-page.scss', './verdict-card.scss'],
  host: { class: 'ui-grouped', '[class.verify-embedded]': 'administration' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationPage {
  private readonly verifier = inject(ReceiptVerifier);
  private readonly location = inject(Location);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  protected readonly context = inject(VERIFICATION_CONTEXT);
  protected readonly administration = this.context.audience === 'administration';
  private fragment: string | null = null;
  protected readonly scanned = signal(false);
  protected readonly compact = inject(CompactLayout).isCompact;
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
          this.location.replaceState(this.context.path, '', this.location.getState());
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
        const focusOnHeading = this.focusOnHeading();
        this.page.set(outcome);
        if (outcome.state !== 'empty' || focusOnHeading) {
          this.focusHeading();
        }
      });
  }

  private focusOnHeading(): boolean {
    const active = this.document.activeElement;
    return active instanceof HTMLHeadingElement && this.host.nativeElement.contains(active);
  }

  private focusHeading(): void {
    afterNextRender(
      () => {
        const page = this.host.nativeElement;
        const heading =
          page.querySelector<HTMLElement>('#verify-title') ?? page.querySelector('h1');
        heading?.focus();
      },
      { injector: this.injector },
    );
  }
}
