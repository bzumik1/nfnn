import { DOCUMENT, Location } from '@angular/common';
import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';

export interface DialogHistoryListener {
  stepBack(): void;
  close(): void;
}

const DEPTH_KEY = 'nfnnDialogDepth';
const popStateListeners = new Set<(event: PopStateEvent) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener(
    'popstate',
    (event) => popStateListeners.forEach((listener) => listener(event)),
    { capture: true },
  );
}

@Injectable({ providedIn: 'root' })
export class DialogHistory {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly window = inject(DOCUMENT).defaultView;
  private owned = 0;
  private wanted = 0;
  private ownPops = 0;
  private entryPath = '';
  private listener: DialogHistoryListener | null = null;

  constructor() {
    const onPopState = (event: PopStateEvent): void => this.popped(event);
    popStateListeners.add(onPopState);
    const navigations = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart && event.navigationTrigger !== 'popstate') {
        this.owned = 0;
      }
    });
    effect(() => {
      if (this.router.currentNavigation() === null) {
        untracked(() => this.settle());
      }
    });
    inject(DestroyRef).onDestroy(() => {
      popStateListeners.delete(onPopState);
      navigations.unsubscribe();
    });
  }

  open(listener: DialogHistoryListener): void {
    this.listener = listener;
    this.wanted = Math.max(this.wanted, 1);
    this.settle();
  }

  showStep(depth: number): void {
    if (this.listener === null) {
      return;
    }
    this.wanted = 1 + depth;
    this.settle();
  }

  close(): void {
    this.listener = null;
    this.wanted = 0;
    this.settle();
  }

  handOver(url: string): void {
    const owned = this.owned;
    this.release();
    if (owned > 0) {
      this.location.replaceState(url);
    }
  }

  release(): void {
    this.listener = null;
    this.wanted = 0;
    this.owned = 0;
  }

  private popped(event: PopStateEvent): void {
    if (this.ownPops > 0) {
      this.ownPops--;
      event.stopImmediatePropagation();
      this.settle();
      return;
    }
    const depth = depthOf(event.state);
    if (depth >= this.owned) {
      return;
    }
    if (this.location.path(true) !== this.entryPath) {
      const listener = this.listener;
      this.release();
      listener?.close();
      return;
    }
    event.stopImmediatePropagation();
    const stepsBack = this.owned - depth;
    this.owned = depth;
    this.wanted = depth;
    const listener = this.listener;
    if (depth === 0) {
      this.listener = null;
      listener?.close();
    } else {
      for (let step = 0; step < stepsBack; step++) {
        listener?.stepBack();
      }
    }
  }

  private settle(): void {
    const history = this.window?.history;
    if (history === undefined || this.ownPops > 0) {
      return;
    }
    if (untracked(this.router.currentNavigation) !== null) {
      return;
    }
    if (this.owned < this.wanted) {
      this.push(history, this.wanted - this.owned);
    } else if (this.owned > this.wanted) {
      const steps = this.owned - this.wanted;
      this.owned = this.wanted;
      this.ownPops++;
      history.go(-steps);
    }
  }

  private push(history: History, entries: number): void {
    if (this.owned === 0) {
      this.entryPath = this.location.path(true);
    }
    for (let entry = 0; entry < entries; entry++) {
      this.owned++;
      history.pushState({ ...stateOf(history.state), [DEPTH_KEY]: this.owned }, '');
    }
  }
}

function stateOf(state: unknown): Record<string, unknown> {
  return typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {};
}

function depthOf(state: unknown): number {
  const depth = stateOf(state)[DEPTH_KEY];
  return typeof depth === 'number' ? depth : 0;
}
