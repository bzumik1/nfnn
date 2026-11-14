import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';
import { NavigationEnd, Router, Scroll } from '@angular/router';

import { APP_TABS, AppTabId, tabOf } from '../navigation/app-tabs';
import { SESSION_STORAGE } from './reload-guard';

export const RELOAD_PLACE_KEY = 'nfnn.reload-place';
export const RELOAD_PLACE_LONGEST_MS = 60_000;
export const PLACE_WAIT_LONGEST_MS = 5_000;

const USER_INPUTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

interface KeptPlace {
  readonly address: string;
  readonly top: number | null;
  readonly tabs: Readonly<Partial<Record<AppTabId, string>>>;
  readonly at: number;
}

@Injectable({ providedIn: 'root' })
export class ReloadPlace {
  private readonly storage = inject(SESSION_STORAGE);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly kept = this.takeKept();
  private tabsNow: () => ReadonlyMap<AppTabId, string> = () => new Map();

  constructor() {
    const top = this.kept?.top ?? null;
    if (top === null) {
      return;
    }
    const navigations = inject(Router).events.subscribe((event) => {
      if (event instanceof Scroll) {
        navigations.unsubscribe();
        const arrived = event.routerEvent;
        const url = arrived instanceof NavigationEnd ? arrived.urlAfterRedirects : arrived.url;
        if (this.addressOf(url) === this.kept?.address) {
          queueMicrotask(() => this.putBack(top));
        }
      }
    });
    inject(DestroyRef).onDestroy(() => navigations.unsubscribe());
  }

  keptTabs(): ReadonlyMap<AppTabId, string> {
    return new Map(
      APP_TABS.flatMap((tab) => {
        const url = this.kept?.tabs[tab.id];
        return url !== undefined && liesUnder(url, tab.id) ? [[tab.id, url] as const] : [];
      }),
    );
  }

  followTabs(tabs: () => ReadonlyMap<AppTabId, string>): void {
    this.tabsNow = tabs;
  }

  keep(url: string): void {
    const address = this.addressOf(url);
    const place: KeptPlace = {
      address,
      top: address === this.addressOf(this.here()) ? (this.window?.scrollY ?? 0) : null,
      tabs: Object.fromEntries(this.tabsNow()),
      at: Date.now(),
    };
    try {
      this.storage().setItem(RELOAD_PLACE_KEY, JSON.stringify(place));
    } catch {
      return;
    }
  }

  private takeKept(): KeptPlace | null {
    try {
      const storage = this.storage();
      const stored = storage.getItem(RELOAD_PLACE_KEY);
      storage.removeItem(RELOAD_PLACE_KEY);
      const place: unknown = stored === null ? null : JSON.parse(stored);
      return isKeptPlace(place) && isRecent(place.at) ? place : null;
    } catch {
      return null;
    }
  }

  private putBack(top: number): void {
    const view = this.window;
    if (!view) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => placeWhenTall()) : null;
    const finish = (): void => {
      clearTimeout(timer);
      observer?.disconnect();
      this.document.removeEventListener('visibilitychange', startWaiting);
      for (const type of USER_INPUTS) {
        view.removeEventListener(type, finish, { capture: true });
      }
    };
    const place = (): void => {
      finish();
      view.scrollTo({ top, behavior: 'instant' });
    };
    const placeWhenTall = (): void => {
      if (this.document.documentElement.scrollHeight >= top + view.innerHeight) {
        place();
      }
    };
    const startWaiting = (): void => {
      if (timer === undefined && this.document.visibilityState !== 'hidden') {
        timer = setTimeout(place, PLACE_WAIT_LONGEST_MS);
      }
    };
    for (const type of USER_INPUTS) {
      view.addEventListener(type, finish, { capture: true, passive: true });
    }
    observer?.observe(this.document.body);
    this.document.addEventListener('visibilitychange', startWaiting);
    startWaiting();
    placeWhenTall();
  }

  private here(): string {
    const location = this.window?.location;
    return location ? `${location.pathname}${location.search}` : '/';
  }

  private addressOf(url: string): string {
    return url.replace(/#.*$/, '');
  }
}

function liesUnder(url: string, tab: AppTabId): boolean {
  return url.startsWith('/') && !url.startsWith('//') && tabOf(url)?.id === tab;
}

function isRecent(at: number): boolean {
  const elapsed = Date.now() - at;
  return elapsed >= 0 && elapsed <= RELOAD_PLACE_LONGEST_MS;
}

function isKeptPlace(value: unknown): value is KeptPlace {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const place = value as Record<string, unknown>;
  return (
    typeof place['address'] === 'string' &&
    (place['top'] === null || (typeof place['top'] === 'number' && place['top'] >= 0)) &&
    typeof place['tabs'] === 'object' &&
    place['tabs'] !== null &&
    Object.values(place['tabs']).every((url) => typeof url === 'string') &&
    typeof place['at'] === 'number'
  );
}
