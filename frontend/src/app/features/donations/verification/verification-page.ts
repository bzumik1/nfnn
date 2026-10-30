import { Location } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { ReceiptVerifier } from './receipt-verifier';
import { type FinalOutcome, VerificationResult } from './verification-result';

type PageState = { readonly state: 'checking' } | { readonly state: 'empty' } | FinalOutcome;

const PAGE_PATH = '/overit';

@Component({
  selector: 'app-verification-page',
  imports: [VerificationResult],
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
  private run = 0;

  protected readonly page = signal<PageState>({ state: 'checking' });

  constructor() {
    const meta = inject(Meta);
    meta.updateTag({ name: 'robots', content: 'noindex' });
    this.destroyRef.onDestroy(() => meta.removeTag('name="robots"'));
    inject(ActivatedRoute)
      .fragment.pipe(takeUntilDestroyed())
      .subscribe((fragment) => {
        this.fragment = fragment;
        if (fragment !== null) {
          this.location.replaceState(PAGE_PATH, '', this.location.getState());
        }
        this.verify();
      });
  }

  protected verify(): void {
    const run = ++this.run;
    const fragment = this.fragment;
    this.page.set({ state: 'checking' });
    this.verifier.verify(fragment).then((outcome) => {
      if (run !== this.run || this.destroyRef.destroyed) {
        return;
      }
      this.page.set(outcome);
      if (outcome.state !== 'empty') {
        afterNextRender(() => this.host.nativeElement.querySelector('h1')?.focus(), {
          injector: this.injector,
        });
      }
    });
  }

  protected finalOutcome(page: PageState): FinalOutcome | null {
    return page.state === 'checking' || page.state === 'empty' ? null : page;
  }
}
