import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';

export type PageHead = 'photo' | 'dark' | 'light';

export interface RouteChromeData {
  readonly parent?: string;
  readonly head?: PageHead;
  readonly tabBar?: boolean;
  readonly landing?: boolean;
  readonly phoneFooter?: boolean;
  readonly backOnWide?: boolean;
}

export interface Chrome {
  readonly parent: string | null;
  readonly head: PageHead;
  readonly tabBar: boolean;
  readonly landing: boolean;
  readonly phoneFooter: boolean;
  readonly backOnWide: boolean;
}

const PLAIN: Chrome = {
  parent: null,
  head: 'dark',
  tabBar: true,
  landing: false,
  phoneFooter: false,
  backOnWide: true,
};

@Injectable({ providedIn: 'root' })
export class RouteChrome {
  private readonly router = inject(Router);
  private readonly chrome = signal<Chrome>(chromeOf(this.router.routerState.snapshot.root));
  readonly current = this.chrome.asReadonly();

  constructor() {
    const navigations = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.chrome.set(chromeOf(this.router.routerState.snapshot.root));
      }
    });
    inject(DestroyRef).onDestroy(() => navigations.unsubscribe());
  }
}

function chromeOf(root: ActivatedRouteSnapshot): Chrome {
  let chrome = PLAIN;
  for (let route: ActivatedRouteSnapshot | null = root; route !== null; route = route.firstChild) {
    const data = route.data as RouteChromeData;
    chrome = {
      parent: data.parent ?? (route === root ? null : chrome.parent),
      head: data.head ?? chrome.head,
      tabBar: data.tabBar ?? chrome.tabBar,
      landing: data.landing ?? false,
      phoneFooter: data.phoneFooter ?? false,
      backOnWide: data.backOnWide ?? chrome.backOnWide,
    };
  }
  return chrome;
}
