import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Params, Router } from '@angular/router';

export type PageHead = 'photo' | 'dark' | 'light';

export type HeadTitle = string | ((route: ActivatedRouteSnapshot) => string);

export interface RouteChromeData {
  readonly parent?: string;
  readonly headTitle?: HeadTitle;
  readonly headTitleFollowsHeading?: boolean;
  readonly head?: PageHead;
  readonly tabBar?: boolean;
  readonly landing?: boolean;
  readonly backOnWide?: boolean;
  readonly darkThroughout?: boolean;
}

export interface Chrome {
  readonly parent: string | null;
  readonly head: PageHead;
  readonly tabBar: boolean;
  readonly landing: boolean;
  readonly backOnWide: boolean;
  readonly darkThroughout: boolean;
  readonly headTitle: string | null;
  readonly headTitleFollowsHeading: boolean;
}

const PLAIN: Chrome = {
  parent: null,
  head: 'dark',
  tabBar: true,
  landing: false,
  backOnWide: true,
  darkThroughout: false,
  headTitle: null,
  headTitleFollowsHeading: false,
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

export function chromeOf(root: ActivatedRouteSnapshot): Chrome {
  let chrome = PLAIN;
  for (let route: ActivatedRouteSnapshot | null = root; route !== null; route = route.firstChild) {
    const data = route.data as RouteChromeData;
    chrome = {
      parent:
        data.parent !== undefined
          ? withParams(data.parent, route.params)
          : route === root
            ? null
            : chrome.parent,
      head: data.head ?? chrome.head,
      tabBar: data.tabBar ?? chrome.tabBar,
      landing: data.landing ?? false,
      backOnWide: data.backOnWide ?? chrome.backOnWide,
      darkThroughout: data.darkThroughout ?? chrome.darkThroughout,
      headTitle:
        data.headTitle === undefined
          ? chrome.headTitle
          : typeof data.headTitle === 'string'
            ? data.headTitle
            : data.headTitle(route),
      headTitleFollowsHeading: data.headTitleFollowsHeading ?? false,
    };
  }
  return chrome;
}

function withParams(path: string, params: Params): string {
  return path.replace(/:([A-Za-z]+)/g, (segment, name: string) =>
    typeof params[name] === 'string' ? encodeURIComponent(params[name]) : segment,
  );
}
