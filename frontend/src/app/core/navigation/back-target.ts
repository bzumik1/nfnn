import { Location } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { pathOf, tabOf } from './app-tabs';

export const APP_DEPTH_KEY = 'nfnnAppDepth';
export const APP_BEHIND_KEY = 'nfnnAppBehind';

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
  private started = false;
  private popped = false;
  private restoredDepth = 0;
  private restoredBehind: string | null = null;
  private buttonPressed = false;
  private byButton = false;

  constructor() {
    const navigations = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.popped = event.navigationTrigger === 'popstate';
        this.byButton = this.popped && this.buttonPressed;
        this.buttonPressed = false;
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
      void this.router.navigateByUrl(parent, { replaceUrl: true });
    }
  }

  toTabRoot(root: string): void {
    if (this.canGoBack && this.behind === root) {
      this.buttonPressed = true;
      this.location.back();
    } else {
      void this.router.navigateByUrl(root, { replaceUrl: true });
    }
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
    this.path = pathOf(this.router.url);
    if (!extras.skipLocationChange) {
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

function behindIn(state: unknown): string | null {
  const behind = stateOf(state)[APP_BEHIND_KEY];
  return typeof behind === 'string' ? behind : null;
}
