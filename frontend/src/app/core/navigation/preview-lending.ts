import { Injector, untracked } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
  NavigationEnd,
  Router,
  Scroll,
} from '@angular/router';
import { KeptTabPages } from './kept-tab-pages';
import { PreviewingReuse, ReusedPreview } from './previewing-reuse';
import { ScrollHold } from './scroll-hold';

interface LentPage {
  readonly handle: DetachedRouteHandle;
  readonly top: number;
  readonly path: string;
  readonly route: ActivatedRouteSnapshot['routeConfig'];
  readonly navigation: number;
}

export function lendKeptPagesToThePreview(injector: Injector): void {
  const reuse = injector.get(PreviewingReuse);
  if (!(reuse.preview instanceof PreviewLending)) {
    reuse.preview = new PreviewLending(reuse.preview, injector);
  }
}

class PreviewLending implements ReusedPreview {
  private lent: LentPage | null = null;
  private placing: number | null = null;
  private placed: { readonly top: number; readonly navigation: number } | null = null;
  private following = false;

  constructor(
    private readonly preview: ReusedPreview,
    private readonly injector: Injector,
  ) {}

  drives(): boolean {
    return this.preview.drives();
  }

  holds(route: ActivatedRouteSnapshot): boolean | null {
    const held = this.preview.holds(route);
    return held === false && this.lends(route) ? true : held;
  }

  handleFor(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const lent = this.lentFor(route);
    if (lent === null) {
      return this.preview.handleFor(route);
    }
    this.placing = lent.top;
    return lent.handle;
  }

  took(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): boolean {
    const lent = this.lent;
    if (handle === null || lent === null || !this.drives() || !isPageOf(lent, route)) {
      return this.preview.took(route, handle);
    }
    this.lent = null;
    this.injector.get(KeptTabPages).store(route, handle);
    return true;
  }

  private lends(route: ActivatedRouteSnapshot): boolean {
    const navigation = untracked(this.router().currentNavigation);
    if (navigation === null || !this.drives()) {
      return false;
    }
    if (this.lent?.navigation === navigation.id) {
      return isPageOf(this.lent, route);
    }
    const kept = this.injector.get(KeptTabPages);
    if (!kept.shouldAttach(route)) {
      return false;
    }
    const handle = kept.retrieve(route);
    const top = kept.takeReturningTop();
    if (handle === null || top === null) {
      return false;
    }
    kept.store(route, null);
    this.followPlacement();
    this.lent = {
      handle,
      top,
      path: pathOf(route),
      route: route.routeConfig,
      navigation: navigation.id,
    };
    return true;
  }

  private lentFor(route: ActivatedRouteSnapshot): LentPage | null {
    const lent = this.lent;
    const navigation = untracked(this.router().currentNavigation);
    return lent !== null && lent.navigation === navigation?.id && isPageOf(lent, route)
      ? lent
      : null;
  }

  private followPlacement(): void {
    if (this.following) {
      return;
    }
    this.following = true;
    this.router().events.subscribe((event) => {
      if (event instanceof NavigationEnd && this.placing !== null) {
        this.placed = { top: this.placing, navigation: event.id };
        this.placing = null;
        this.scrollTo(this.placed.top);
      } else if (event instanceof Scroll && this.placed?.navigation === event.routerEvent.id) {
        const top = this.placed.top;
        this.placed = null;
        queueMicrotask(() => this.scrollTo(top));
      }
    });
  }

  private router(): Router {
    return this.injector.get(Router);
  }

  private scrollTo(top: number): void {
    this.injector.get(ScrollHold).run(() => window.scrollTo({ top, behavior: 'instant' }));
  }
}

function isPageOf(page: LentPage, route: ActivatedRouteSnapshot): boolean {
  return page.route === route.routeConfig && page.path === pathOf(route);
}

function pathOf(route: ActivatedRouteSnapshot): string {
  return `/${route.pathFromRoot.flatMap((step) => step.url.map((part) => part.path)).join('/')}`;
}
