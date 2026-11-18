import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  DestroyRef,
  inject,
  Injectable,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import {
  Event as RouterEvent,
  NavigationEnd,
  NavigationStart,
  Router,
  Scroll,
} from '@angular/router';
import { AppTab, AppTabId, pathOf, tabOf } from './app-tabs';
import { ReloadPlace } from '../reload/reload-place';
import { KeptTabPages } from './kept-tab-pages';
import { NavigationPreview } from './navigation-preview';
import { ScrollHold } from './scroll-hold';

const PLACE_WAIT_LONGEST_MS = 3000;
const VISITOR_MOVES = ['wheel', 'touchstart', 'keydown', 'pointerdown', 'focusin'] as const;
const LISTENING: AddEventListenerOptions = { passive: true, capture: true };

@Injectable({ providedIn: 'root' })
export class TabMemory {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly keptPages = inject(KeptTabPages);
  private readonly preview = inject(NavigationPreview);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly reloadPlace = inject(ReloadPlace);
  private readonly scrollHold = inject(ScrollHold);
  private readonly lastUrls = new Map<AppTabId, string>(this.reloadPlace.keptTabs());
  private readonly current = signal<AppTab | null>(tabOf(this.router.url));
  readonly currentTab = this.current.asReadonly();
  private readonly path = signal(pathOf(this.router.url));
  private keptTop: { readonly top: number; readonly navigation: number } | null = null;
  private returnedToKeptPage = false;
  private placements = 0;
  private stopWaitingForHeight: (() => void) | null = null;

  constructor() {
    this.reloadPlace.followTabs(() => this.lastUrls);
    const navigations = this.router.events.subscribe((event) => {
      if (this.preview.drives()) {
        this.followPreview(event);
        return;
      }
      if (event instanceof NavigationStart) {
        this.stopWaitingForHeight?.();
        this.keptPages.takeReturningTop();
      } else if (event instanceof NavigationEnd) {
        this.visited(event.urlAfterRedirects);
        const top = this.keptPages.takeReturningTop();
        const section = this.leadsToSection(event.urlAfterRedirects);
        this.returned(event.id, section ? null : top);
        if (top === null && !section) {
          this.startNewPageAtTop();
        }
      } else if (event instanceof Scroll) {
        this.overRouterScrolling(event);
      }
    });
    inject(DestroyRef).onDestroy(() => navigations.unsubscribe());
  }

  urlFor(tab: AppTab): string {
    if (this.current()?.id === tab.id) {
      return tab.path;
    }
    return this.lastUrls.get(tab.id) ?? tab.path;
  }

  async open(tab: AppTab): Promise<boolean> {
    const opened = await this.router.navigateByUrl(this.urlFor(tab), { scroll: 'manual' });
    if (opened && !this.returnedToKeptPage) {
      this.placeAt(0);
    }
    return opened;
  }

  isAtRoot(tab: AppTab): boolean {
    return this.current()?.id === tab.id && this.path() === tab.path;
  }

  private returned(navigation: number, top: number | null): void {
    this.keptTop = top === null ? null : { top, navigation };
    this.returnedToKeptPage = top !== null;
    if (top !== null) {
      this.placeAt(top);
    }
  }

  private followPreview(event: RouterEvent): void {
    if (event instanceof NavigationEnd) {
      const top = this.keptPages.takeReturningTop();
      if (top !== null) {
        this.keptTop = { top, navigation: event.id };
        this.placeAt(top);
      }
    } else if (event instanceof Scroll && this.keptTop?.navigation === event.routerEvent.id) {
      this.overRouterScrolling(event);
    }
  }

  private overRouterScrolling(event: Scroll): void {
    const kept = this.keptTop;
    if (kept === null || kept.navigation !== event.routerEvent.id) {
      if (event.position) {
        const top = event.position[1];
        queueMicrotask(() => this.keepPlaceWhileGrowing(top));
      } else if (event.anchor === null && event.scrollBehavior !== 'manual') {
        this.scrollTo(0);
      }
      return;
    }
    this.keptTop = null;
    if (event.anchor === null && event.scrollBehavior !== 'manual') {
      queueMicrotask(() => this.scrollTo(kept.top));
    }
  }

  private keepPlaceWhileGrowing(top: number): void {
    this.stopWaitingForHeight?.();
    const view = this.window;
    if (view === null || typeof ResizeObserver === 'undefined') {
      return;
    }
    let growth: ResizeObserver | null = null;
    let timer: number | undefined;
    let restingAt = view.scrollY;
    const movedByOthers = (): void => {
      if (Math.abs(view.scrollY - restingAt) > 1) {
        stop();
      }
    };
    const placeOnceReached = (): void => {
      if (this.reaches(top)) {
        stop();
        if (!this.hidesFocus(top)) {
          this.scrollTo(top);
        }
      }
    };
    const stop = (): void => {
      waitForRelease();
      growth?.disconnect();
      view.clearTimeout(timer);
      VISITOR_MOVES.forEach((type) => view.removeEventListener(type, stop, LISTENING));
      view.removeEventListener('scroll', movedByOthers, LISTENING);
      if (this.stopWaitingForHeight === stop) {
        this.stopWaitingForHeight = null;
      }
    };
    this.stopWaitingForHeight = stop;
    const waitForRelease = this.scrollHold.whenReleased(() => {
      restingAt = view.scrollY;
      timer = view.setTimeout(stop, PLACE_WAIT_LONGEST_MS);
      VISITOR_MOVES.forEach((type) => view.addEventListener(type, stop, LISTENING));
      view.addEventListener('scroll', movedByOthers, LISTENING);
      growth = new ResizeObserver(placeOnceReached);
      growth.observe(this.document.body);
      placeOnceReached();
    });
  }

  private hidesFocus(top: number): boolean {
    const view = this.window;
    const focused = this.document.activeElement;
    if (view === null || !(focused instanceof HTMLElement) || focused.closest('main') === null) {
      return false;
    }
    const box = focused.getBoundingClientRect();
    const shift = top - view.scrollY;
    return box.bottom - shift <= 0 || box.top - shift >= view.innerHeight;
  }

  private reaches(top: number): boolean {
    const view = this.window;
    return view !== null && this.document.documentElement.scrollHeight - view.innerHeight >= top;
  }

  private startNewPageAtTop(): void {
    const navigation = untracked(this.router.currentNavigation);
    if (navigation?.trigger !== 'popstate' && navigation?.extras.scroll !== 'manual') {
      this.scrollTo(0);
    }
  }

  private leadsToSection(url: string): boolean {
    return this.router.parseUrl(url).fragment !== null;
  }

  private placeAt(top: number): void {
    const placement = ++this.placements;
    this.scrollTo(top);
    afterNextRender(
      {
        write: () => {
          if (placement === this.placements) {
            this.scrollTo(top);
          }
        },
      },
      { injector: this.injector },
    );
  }

  private scrollTo(top: number): void {
    this.scrollHold.run(() => this.window?.scrollTo({ top, behavior: 'instant' }));
  }

  private visited(url: string): void {
    const tab = tabOf(url);
    this.current.set(tab);
    this.path.set(pathOf(url));
    if (tab !== null) {
      this.lastUrls.set(tab.id, withoutSection(this.router, url));
    }
  }
}

function withoutSection(router: Router, url: string): string {
  const tree = router.parseUrl(url);
  tree.fragment = null;
  return router.serializeUrl(tree);
}
