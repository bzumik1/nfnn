import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken, Injector, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  destroyDetachedRouteHandle,
  DetachedRouteHandle,
  NavigationEnd,
  Route,
  Router,
} from '@angular/router';
import { filter } from 'rxjs';
import { AppTabId, tabOf } from './app-tabs';
import { NavigationPreview } from './navigation-preview';

export const KEPT_PAGES_OWNER = new InjectionToken<() => string | null>('KEPT_PAGES_OWNER', {
  providedIn: 'root',
  factory: () => () => null,
});

interface Place {
  readonly tab: AppTabId;
  readonly path: string;
  readonly root: boolean;
}

interface KeptPage {
  readonly handle: DetachedRouteHandle;
  readonly route: Route | null;
  readonly path: string;
  readonly top: number;
}

@Injectable({ providedIn: 'root' })
export class KeptTabPages extends BaseRouteReuseStrategy {
  private readonly injector = inject(Injector);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly roots = new Map<AppTabId, KeptPage>();
  private readonly lastPages = new Map<AppTabId, KeptPage>();
  private returningTop: number | null = null;
  private leftTop = 0;
  private owner: string | null | undefined = undefined;
  private ownerChanged = false;
  private checkedNavigation: number | null | undefined = undefined;

  override shouldDetach(route: ActivatedRouteSnapshot): boolean {
    const place = placeOf(route);
    const kept =
      !this.ownerChangedInThisNavigation() &&
      place !== null &&
      (place.root || this.leavesTab(place.tab));
    if (kept) {
      this.leftTop = this.window?.scrollY ?? 0;
    }
    return kept;
  }

  override store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const place = placeOf(route);
    if (place === null) {
      return;
    }
    const pages = this.pagesFor(place);
    const previous = pages.get(place.tab);
    if (handle === null) {
      pages.delete(place.tab);
      return;
    }
    if (previous !== undefined && previous.handle !== handle) {
      destroyDetachedRouteHandle(previous.handle);
    }
    pages.set(place.tab, {
      handle,
      route: route.routeConfig,
      path: place.path,
      top: this.leftTop,
    });
  }

  override shouldAttach(route: ActivatedRouteSnapshot): boolean {
    this.ownerChangedInThisNavigation();
    const place = placeOf(route);
    if (place === null) {
      return false;
    }
    this.letGoOfLastPageOtherThan(place);
    return this.keptFor(route, place) !== null;
  }

  override retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const place = placeOf(route);
    const page = place === null ? null : this.keptFor(route, place);
    if (page === null) {
      return null;
    }
    this.returningTop = page.top;
    return page.handle;
  }

  takeReturningTop(): number | null {
    const top = this.returningTop;
    this.returningTop = null;
    return top;
  }

  forget(): void {
    const pages = [...this.roots.values(), ...this.lastPages.values()];
    this.roots.clear();
    this.lastPages.clear();
    this.returningTop = null;
    pages.forEach((page) => destroyDetachedRouteHandle(page.handle));
  }

  private ownerChangedInThisNavigation(): boolean {
    const navigation = untracked(this.injector.get(Router).currentNavigation)?.id ?? null;
    if (navigation !== this.checkedNavigation) {
      this.checkedNavigation = navigation;
      const owner = untracked(this.injector.get(KEPT_PAGES_OWNER));
      this.ownerChanged = this.owner !== undefined && owner !== this.owner;
      this.owner = owner;
      if (this.ownerChanged) {
        this.forget();
      }
    }
    return this.ownerChanged;
  }

  private pagesFor(place: Place): Map<AppTabId, KeptPage> {
    return place.root ? this.roots : this.lastPages;
  }

  private keptFor(route: ActivatedRouteSnapshot, place: Place): KeptPage | null {
    const page = this.pagesFor(place).get(place.tab);
    return page !== undefined && page.route === route.routeConfig && page.path === place.path
      ? page
      : null;
  }

  private letGoOfLastPageOtherThan(place: Place): void {
    const last = this.lastPages.get(place.tab);
    if (last !== undefined && last.path !== place.path) {
      this.lastPages.delete(place.tab);
      destroyDetachedRouteHandle(last.handle);
    }
  }

  private leavesTab(tab: AppTabId): boolean {
    const router = this.injector.get(Router);
    const navigation = untracked(router.currentNavigation);
    const destination = navigation?.finalUrl ?? navigation?.extractedUrl;
    return destination !== undefined && tabOf(router.serializeUrl(destination))?.id !== tab;
  }
}

export function whenShownAgain(refresh: () => void): void {
  followShown((shown) => {
    if (shown) {
      refresh();
    }
  });
}

export function whenLeft(leave: () => void): void {
  followShown((shown) => {
    if (!shown) {
      leave();
    }
  });
}

function followShown(changed: (shown: boolean) => void): void {
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const preview = inject(NavigationPreview);
  let shown = true;
  router.events
    .pipe(
      filter((event) => event instanceof NavigationEnd),
      takeUntilDestroyed(),
    )
    .subscribe(() => {
      if (preview.active()) {
        return;
      }
      const shownNow = isShown(router, route);
      if (shownNow !== shown) {
        shown = shownNow;
        changed(shown);
      }
    });
}

function isShown(router: Router, route: ActivatedRoute): boolean {
  for (let step: ActivatedRoute | null = router.routerState.root; step; step = step.firstChild) {
    if (step === route) {
      return true;
    }
  }
  return false;
}

function placeOf(route: ActivatedRouteSnapshot): Place | null {
  if (route.routeConfig === null || route.component === null || route.routeConfig.path === '**') {
    return null;
  }
  const path = `/${route.pathFromRoot.flatMap((step) => step.url.map((segment) => segment.path)).join('/')}`;
  const tab = tabOf(path);
  return tab === null ? null : { tab: tab.id, path, root: tab.path === path };
}
