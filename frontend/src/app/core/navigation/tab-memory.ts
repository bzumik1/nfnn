import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AppTab, AppTabId, pathOf, tabOf } from './app-tabs';

@Injectable({ providedIn: 'root' })
export class TabMemory {
  private readonly router = inject(Router);
  private readonly lastUrls = new Map<AppTabId, string>();
  private readonly current = signal<AppTab | null>(tabOf(this.router.url));
  readonly currentTab = this.current.asReadonly();
  private readonly path = signal(pathOf(this.router.url));

  constructor() {
    const navigations = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.visited(event.urlAfterRedirects);
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

  isAtRoot(tab: AppTab): boolean {
    return this.current()?.id === tab.id && this.path() === tab.path;
  }

  private visited(url: string): void {
    const tab = tabOf(url);
    this.current.set(tab);
    this.path.set(pathOf(url));
    if (tab !== null) {
      this.lastUrls.set(tab.id, url);
    }
  }
}
