import { Location } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { pathOf, tabOf } from './app-tabs';

export const APP_DEPTH_KEY = 'nfnnAppDepth';
export const APP_BEHIND_KEY = 'nfnnAppBehind';
export const APP_ACCOUNT_KEY = 'nfnnAppAccount';
export const BACK_NAVIGATION = 'nfnn.back';

export type BackDestination =
  | { readonly kind: 'step'; readonly depth: number; readonly path: string | null }
  | { readonly kind: 'parent'; readonly path: string };

@Injectable({ providedIn: 'root' })
export class BackTarget {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private depth = 0;
  private behind: string | null = null;
  private path: string | null = null;
  private left: string | null = null;
  private started = false;
  private popped = false;
  private restoredDepth = 0;
  private restoredBehind: string | null = null;
  private buttonPressed = false;
  private byButton = false;
  private account: string | null = null;
  private leftAccount: string | null = null;
  private skipPressed = false;
  private skipped = false;
  private readonly reopenAccount = signal<string | null>(null);
  readonly accountToReopen = this.reopenAccount.asReadonly();

  constructor() {
    const navigations = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.popped = event.navigationTrigger === 'popstate';
        this.byButton = this.popped && this.buttonPressed;
        this.buttonPressed = false;
        this.skipped = this.popped && this.skipPressed;
        this.skipPressed = false;
        this.leftAccount = this.popped ? this.account : null;
        this.reopenAccount.set(null);
        this.restoredDepth = depthIn(event.restoredState);
        this.restoredBehind = behindIn(event.restoredState);
      } else if (event instanceof NavigationEnd) {
        this.settled();
      }
    });
    inject(DestroyRef).onDestroy(() => navigations.unsubscribe());
  }

  get canGoBack(): boolean {
    return this.depth > 0;
  }

  get returningByButton(): boolean {
    return this.byButton;
  }

  get leftPath(): string | null {
    return this.left;
  }

  destination(parent: string): BackDestination {
    return this.canGoBack && this.staysInTab()
      ? { kind: 'step', depth: this.depth - 1, path: this.behind }
      : { kind: 'parent', path: parent };
  }

  back(parent: string): void {
    if (this.destination(parent).kind === 'step') {
      this.buttonPressed = true;
      this.location.back();
    } else {
      void this.router.navigateByUrl(parent, { replaceUrl: true, info: BACK_NAVIGATION });
    }
  }

  backBy(steps: number): void {
    this.buttonPressed = true;
    this.skipPressed = true;
    this.location.historyGo(-steps);
  }

  toTabRoot(root: string): void {
    if (this.canGoBack && this.behind === root) {
      this.buttonPressed = true;
      this.location.back();
    } else {
      void this.router.navigateByUrl(root, { replaceUrl: true, info: BACK_NAVIGATION });
    }
  }

  takeAccountToReopen(): string | null {
    const section = this.reopenAccount();
    this.reopenAccount.set(null);
    return section;
  }

  nextDepth(): number {
    return this.depth + 1;
  }

  private staysInTab(): boolean {
    const here = tabOf(this.router.url);
    const there = this.behind === null ? null : tabOf(this.behind);
    return here === null || there === null || here.id === there.id;
  }

  private settled(): void {
    const extras = this.router.lastSuccessfulNavigation()?.extras ?? {};
    const handedOver = depthIn(extras.state);
    if (this.popped) {
      if (!this.skipped && this.leftAccount !== null && this.restoredDepth < this.depth) {
        this.reopenAccount.set(this.leftAccount);
      }
      this.depth = this.restoredDepth;
      this.behind = this.restoredBehind;
    } else if (handedOver > 0) {
      this.depth = handedOver;
      this.behind = this.path;
    } else if (!this.started) {
      this.depth = depthIn(this.location.getState());
      this.behind = behindIn(this.location.getState());
    } else if (!extras.replaceUrl && !extras.skipLocationChange) {
      this.depth++;
      this.behind = this.path;
    }
    this.started = true;
    this.left = this.path;
    this.path = pathOf(this.router.url);
    if (!extras.skipLocationChange) {
      this.account = accountIn(this.location.getState());
      this.location.replaceState(this.location.path(true), '', {
        ...stateOf(this.location.getState()),
        [APP_DEPTH_KEY]: this.depth,
        [APP_BEHIND_KEY]: this.behind,
      });
    }
  }
}

function stateOf(state: unknown): Record<string, unknown> {
  return typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {};
}

function depthIn(state: unknown): number {
  const depth = stateOf(state)[APP_DEPTH_KEY];
  return typeof depth === 'number' && depth > 0 ? depth : 0;
}

function accountIn(state: unknown): string | null {
  const account = stateOf(state)[APP_ACCOUNT_KEY];
  return typeof account === 'string' ? account : null;
}

function behindIn(state: unknown): string | null {
  const behind = stateOf(state)[APP_BEHIND_KEY];
  return typeof behind === 'string' ? behind : null;
}
