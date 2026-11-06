import { DOCUMENT, Location } from '@angular/common';
import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';

export interface DialogHistoryListener {
  stepBack(): void;
  close(): void;
}

interface OpenDialog {
  readonly listener: DialogHistoryListener;
  steps: number;
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
  private ownPops = 0;
  private entryPath = '';
  private dialogs: OpenDialog[] = [];

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
    this.foldStaleEntries();
  }

  open(listener: DialogHistoryListener): void {
    if (!this.dialogs.some((dialog) => dialog.listener === listener)) {
      this.dialogs.push({ listener, steps: 1 });
    }
    this.settle();
  }

  showStep(depth: number, listener?: DialogHistoryListener): void {
    const dialog =
      listener === undefined
        ? this.dialogs.at(-1)
        : this.dialogs.find((open) => open.listener === listener);
    if (dialog === undefined) {
      return;
    }
    dialog.steps = 1 + depth;
    this.settle();
  }

  close(listener?: DialogHistoryListener): void {
    if (listener === undefined) {
      this.dialogs.pop();
    } else {
      this.dialogs = this.dialogs.filter((dialog) => dialog.listener !== listener);
    }
    this.settle();
  }

  handOver(url: string): boolean {
    const owned = this.owned;
    this.release();
    if (owned > 0) {
      this.location.replaceState(url);
    }
    return owned > 0;
  }

  keepStep(mark: string): void {
    const history = this.window?.history;
    if (history !== undefined && this.owned > 0) {
      history.replaceState({ ...stateOf(history.state), [mark]: true }, '');
    }
    this.release();
  }

  release(): void {
    this.dialogs = [];
    this.owned = 0;
  }

  private get wanted(): number {
    return this.dialogs.reduce((sum, dialog) => sum + dialog.steps, 0);
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
      const closing = [...this.dialogs].reverse();
      this.release();
      closing.forEach((dialog) => dialog.listener.close());
      return;
    }
    event.stopImmediatePropagation();
    let stepsBack = this.owned - depth;
    this.owned = depth;
    const told: (() => void)[] = [];
    while (stepsBack > 0) {
      const top = this.dialogs.at(-1);
      if (top === undefined) {
        break;
      }
      if (stepsBack >= top.steps) {
        stepsBack -= top.steps;
        this.dialogs.pop();
        told.push(() => top.listener.close());
      } else {
        top.steps -= stepsBack;
        for (; stepsBack > 0; stepsBack--) {
          told.push(() => top.listener.stepBack());
        }
      }
    }
    told.forEach((tell) => tell());
  }

  private settle(): void {
    const history = this.window?.history;
    if (history === undefined || this.ownPops > 0) {
      return;
    }
    if (untracked(this.router.currentNavigation) !== null) {
      return;
    }
    if (this.owned === 0 && this.wanted > 0) {
      this.entryPath = this.location.path(true);
      this.owned = depthOf(history.state);
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

  private foldStaleEntries(): void {
    const history = this.window?.history;
    const stale = depthOf(history?.state);
    if (history === undefined || stale === 0) {
      return;
    }
    history.replaceState(withoutDepth(history.state), '');
    this.ownPops++;
    history.go(-stale);
  }

  private push(history: History, entries: number): void {
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

function withoutDepth(state: unknown): Record<string, unknown> {
  const rest = { ...stateOf(state) };
  delete rest[DEPTH_KEY];
  return rest;
}
