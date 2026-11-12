import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
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
  Router,
  RouterOutlet,
} from '@angular/router';
import { CompactLayout } from '../../core/layout/compact-layout';
import { KeptTabPages } from '../../core/navigation/kept-tab-pages';
import { PageFocus } from '../../core/navigation/page-focus';
import { RouteChrome } from '../../core/navigation/route-chrome';
import { AppHeader } from '../app-header/app-header';
import { TabBar } from '../tab-bar/tab-bar';
import { SiteFooter } from '../site-footer/site-footer';
import { SignedOutNotice } from '../signed-out-notice/signed-out-notice';
import { SetupRedirect } from '../../features/operations/setup/setup-redirect';

@Component({
  selector: 'app-public-shell',
  imports: [RouterOutlet, AppHeader, SiteFooter, TabBar, SignedOutNotice],
  templateUrl: './public-shell.html',
  styleUrl: './public-shell.scss',
  host: { class: 'page-layer' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicShell {
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly pageFocus = inject(PageFocus);
  private readonly chrome = inject(RouteChrome).current;
  private readonly compact = inject(CompactLayout).isCompact;
  protected readonly tabBar = computed(() => this.chrome().tabBar);
  protected readonly footer = computed(() =>
    this.compact() ? this.chrome().phoneFooter : !this.chrome().landing,
  );
  protected readonly roomForTabBar = computed(
    () => this.tabBar() && !this.footer() && !this.chrome().landing,
  );

  constructor() {
    inject(SetupRedirect).checkOnce();
    const keptTabPages = inject(KeptTabPages);
    inject(DestroyRef).onDestroy(() => keptTabPages.forget());
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd && this.pageFocus.movesOnLastNavigation()) {
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
    this.pageFocus.follow(this.content().nativeElement, fragment);
  }
}
