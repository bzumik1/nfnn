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
import { NavigationEnd, NavigationStart, Router, Scroll } from '@angular/router';
import { AppTab, AppTabId, pathOf, tabOf } from './app-tabs';
import { KeptTabPages } from './kept-tab-pages';
import { NavigationPreview } from './navigation-preview';

@Injectable({ providedIn: 'root' })
export class TabMemory {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly keptPages = inject(KeptTabPages);
  private readonly preview = inject(NavigationPreview);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly lastUrls = new Map<AppTabId, string>();
  private readonly current = signal<AppTab | null>(tabOf(this.router.url));
  readonly currentTab = this.current.asReadonly();
  private readonly path = signal(pathOf(this.router.url));
  private keptTop: { readonly top: number; readonly navigation: number } | null = null;
  private returnedToKeptPage = false;
  private placements = 0;

  constructor() {
    const navigations = this.router.events.subscribe((event) => {
      if (this.preview.active()) {
        return;
      }
      if (event instanceof NavigationStart) {
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

  private overRouterScrolling(event: Scroll): void {
    const kept = this.keptTop;
    if (kept === null || kept.navigation !== event.routerEvent.id) {
      if (!event.position && event.anchor === null && event.scrollBehavior !== 'manual') {
        this.scrollTo(0);
      }
      return;
    }
    this.keptTop = null;
    if (event.anchor === null && event.scrollBehavior !== 'manual') {
      queueMicrotask(() => this.scrollTo(kept.top));
    }
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
    this.window?.scrollTo({ top, behavior: 'instant' });
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
