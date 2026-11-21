import { Location } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { APP_DEPTH_KEY } from '../../core/navigation/back-target';
import { PageTransitions } from '../../core/navigation/page-transitions';

export const APP_ACCOUNT_KEY = 'nfnnAppAccount';
export const APP_ACCOUNT_SCROLL_KEY = 'nfnnAppAccountScroll';

type HistoryState = Readonly<Record<string, unknown>>;

@Injectable({ providedIn: 'root' })
export class AccountReturn {
  private readonly location = inject(Location);
  private readonly transitions = inject(PageTransitions);
  private entry = stateOf(this.location.getState());
  private steppingBack = false;
  private closing = false;
  private readonly reopenOn = signal<string | null>(null);
  private reopenAt: readonly number[] = [];
  readonly sectionToReopen = this.reopenOn.asReadonly();

  constructor() {
    const navigations = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.steppingBack =
          event.navigationTrigger === 'popstate' &&
          depthIn(event.restoredState) < depthIn(this.entry);
        this.reopenOn.set(null);
        this.reopenAt = [];
      } else if (event instanceof NavigationEnd) {
        this.settled();
      }
    });
    inject(DestroyRef).onDestroy(() => navigations.unsubscribe());
  }

  closeAdministration(): void {
    this.closing = true;
  }

  takeSectionToReopen(): string | null {
    const section = this.reopenOn();
    this.reopenOn.set(null);
    return section;
  }

  takeScrollToReopen(): readonly number[] {
    const scrolls = this.reopenAt;
    this.reopenAt = [];
    return scrolls;
  }

  private settled(): void {
    if (this.steppingBack) {
      this.reopenOn.set(this.closing ? null : accountIn(this.entry));
      this.reopenAt = this.closing ? [] : scrollsIn(this.entry);
      this.closing = false;
    }
    this.entry = stateOf(this.location.getState());
    if (this.reopenOn() === null && accountIn(this.entry) === null) {
      this.transitions.forgetSheetsOf(this);
    }
  }
}

function stateOf(state: unknown): HistoryState {
  return typeof state === 'object' && state !== null ? (state as HistoryState) : {};
}

function depthIn(state: unknown): number {
  const depth = stateOf(state)[APP_DEPTH_KEY];
  return typeof depth === 'number' && depth > 0 ? depth : 0;
}

function scrollsIn(state: HistoryState): readonly number[] {
  const scrolls = state[APP_ACCOUNT_SCROLL_KEY];
  return Array.isArray(scrolls)
    ? scrolls.map((top: unknown) => (typeof top === 'number' && top > 0 ? top : 0))
    : [];
}

function accountIn(state: HistoryState): string | null {
  const section = state[APP_ACCOUNT_KEY];
  return typeof section === 'string' ? section : null;
}
