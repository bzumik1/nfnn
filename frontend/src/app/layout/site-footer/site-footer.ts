import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CompactLayout } from '../../core/layout/compact-layout';

const FOOTER_IN_VIEW = 'footer-in-view';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './site-footer.html',
  styleUrl: './site-footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooter {
  protected readonly year = new Date().getFullYear();
  protected readonly compact = inject(CompactLayout).isCompact;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const root = inject(DOCUMENT).documentElement;
    let observer: IntersectionObserver | null = null;
    afterNextRender(() => {
      if (typeof IntersectionObserver !== 'function') {
        return;
      }
      observer = new IntersectionObserver((entries) =>
        root.classList.toggle(FOOTER_IN_VIEW, entries[entries.length - 1].isIntersecting),
      );
      observer.observe(host);
    });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      root.classList.remove(FOOTER_IN_VIEW);
    });
  }
}
