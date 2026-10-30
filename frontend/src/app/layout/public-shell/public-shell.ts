import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  NavigationSkipped,
  NavigationSkippedCode,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { SiteHeader } from '../site-header/site-header';
import { SiteFooter } from '../site-footer/site-footer';
import { SignedOutNotice } from '../signed-out-notice/signed-out-notice';
import { SetupRedirect } from '../../features/operations/setup/setup-redirect';

@Component({
  selector: 'app-public-shell',
  imports: [RouterOutlet, SiteHeader, SiteFooter, SignedOutNotice],
  templateUrl: './public-shell.html',
  styleUrl: './public-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicShell {
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private returningInHistory = false;

  constructor() {
    inject(SetupRedirect).checkOnce();
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.returningInHistory = event.navigationTrigger === 'popstate';
      } else if (event instanceof NavigationEnd && event.id > 1 && !this.returningInHistory) {
        const fragment = this.router.parseUrl(event.urlAfterRedirects).fragment;
        afterNextRender(() => this.followNavigation(fragment), { injector: this.injector });
      } else if (
        event instanceof NavigationSkipped &&
        event.code === NavigationSkippedCode.IgnoredSameUrlNavigation
      ) {
        this.followNavigation(this.router.parseUrl(event.url).fragment);
      }
    });
  }

  skipToContent(event: Event): void {
    event.preventDefault();
    this.content().nativeElement.focus();
  }

  private followNavigation(fragment: string | null): void {
    if (this.document.querySelector('dialog[open]')) {
      return;
    }
    const main = this.content().nativeElement;
    if (fragment) {
      this.focusQuietly(this.document.getElementById(fragment));
    } else if (!main.contains(this.document.activeElement)) {
      this.focusQuietly(main.querySelector<HTMLElement>('h1') ?? main);
    }
  }

  private focusQuietly(target: HTMLElement | null): void {
    if (target === null) {
      return;
    }
    if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }
    target.focus({ preventScroll: true });
  }
}
