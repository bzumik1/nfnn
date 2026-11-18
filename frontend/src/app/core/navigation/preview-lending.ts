import { Injector, untracked } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
  NavigationEnd,
  Router,
  Scroll,
} from '@angular/router';
import type { KeptTabPages } from './kept-tab-pages';
import { PREVIEW_BACK, PREVIEW_OUT } from './navigation-preview';
import { ScrollHold } from './scroll-hold';

interface LentPage {
  readonly handle: DetachedRouteHandle;
  readonly top: number;
  readonly path: string;
  readonly route: ActivatedRouteSnapshot['routeConfig'];
  readonly navigation: number;
}

export class PreviewLending {
  private readonly router: Router;
  private readonly scrollHold: ScrollHold;
  private lent: LentPage | null = null;
  private placing: number | null = null;
  private placed: { readonly top: number; readonly navigation: number } | null = null;

  constructor(
    injector: Injector,
    private readonly kept: KeptTabPages,
  ) {
    this.router = injector.get(Router);
    this.scrollHold = injector.get(ScrollHold);
    this.router.events.subscribe((event) => {
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

  lends(route: ActivatedRouteSnapshot): boolean {
    const navigation = this.navigation();
    if (navigation?.extras.info !== PREVIEW_OUT) {
      return false;
    }
    if (this.lent !== null && this.lent.navigation === navigation.id) {
      return isPageOf(this.lent, route);
    }
    this.lent = null;
    if (!this.kept.shouldAttach(route)) {
      return false;
    }
    const handle = this.kept.retrieve(route);
    const top = this.kept.takeReturningTop();
    if (handle === null || top === null) {
      return false;
    }
    this.kept.store(route, null);
    this.lent = {
      handle,
      top,
      path: pathOf(route),
      route: route.routeConfig,
      navigation: navigation.id,
    };
    return true;
  }

  handleFor(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const lent = this.lent;
    if (this.navigation()?.extras.info !== PREVIEW_OUT || lent === null || !isPageOf(lent, route)) {
      return null;
    }
    this.placing = lent.top;
    return lent.handle;
  }

  takesBack(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): boolean {
    const lent = this.lent;
    if (
      this.navigation()?.extras.info !== PREVIEW_BACK ||
      handle === null ||
      lent === null ||
      !isPageOf(lent, route) ||
      !this.kept.shouldDetach(route)
    ) {
      return false;
    }
    this.lent = null;
    this.kept.store(route, handle);
    return true;
  }

  private navigation() {
    return untracked(this.router.currentNavigation);
  }

  private scrollTo(top: number): void {
    this.scrollHold.run(() => window.scrollTo({ top, behavior: 'instant' }));
  }
}

function isPageOf(page: LentPage, route: ActivatedRouteSnapshot): boolean {
  return page.route === route.routeConfig && page.path === pathOf(route);
}

function pathOf(route: ActivatedRouteSnapshot): string {
  return `/${route.pathFromRoot.flatMap((step) => step.url.map((part) => part.path)).join('/')}`;
}
