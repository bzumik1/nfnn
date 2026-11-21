import { DOCUMENT } from '@angular/common';
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
  ActivatedRoute,
  NavigationEnd,
  NavigationSkipped,
  NavigationSkippedCode,
  Router,
  RouterOutlet,
} from '@angular/router';
import { KeptTabPages } from '../../core/navigation/kept-tab-pages';
import { PageFocus } from '../../core/navigation/page-focus';
import { chromeOf, RouteChrome } from '../../core/navigation/route-chrome';
import { AppHeader } from '../app-header/app-header';
import { TabBar } from '../tab-bar/tab-bar';
import { reserveRoomForTabBar } from '../tab-bar/tab-bar-room';
import { SignedOutNotice } from '../signed-out-notice/signed-out-notice';
import { SetupRedirect } from '../../features/operations/setup/setup-redirect';

@Component({
  selector: 'app-public-shell',
  imports: [RouterOutlet, AppHeader, TabBar, SignedOutNotice],
  templateUrl: './public-shell.html',
  styleUrl: './public-shell.scss',
  host: { class: 'page-layer' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicShell {
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  private readonly tabs = viewChild(TabBar);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly pageFocus = inject(PageFocus);
  private readonly chrome = inject(RouteChrome).current;
  protected readonly tabBar = computed(() => this.chrome().tabBar);
  protected readonly roomForTabBar = computed(() => this.tabBar() && !this.chrome().landing);

  constructor() {
    inject(SetupRedirect).checkOnce();
    const keptTabPages = inject(KeptTabPages);
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => keptTabPages.forget());
    if (chromeOf(inject(ActivatedRoute).snapshot.root).tabBar) {
      destroyRef.onDestroy(reserveRoomForTabBar(inject(DOCUMENT)));
    }
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

  skipToNavigation(event: Event): void {
    event.preventDefault();
    this.tabs()?.focusFirstTab();
  }

  private followNavigation(fragment: string | null): void {
    this.pageFocus.follow(this.content().nativeElement, fragment);
  }
}
