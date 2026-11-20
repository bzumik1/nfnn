import { DestroyRef, inject, Injectable } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, Scroll } from '@angular/router';

interface AwaitedScroll {
  readonly navigation: number;
  readonly placed: () => void;
}

@Injectable({ providedIn: 'root' })
export class PagePlacement {
  private readonly waiting = new Set<object>();
  private settled: (() => void)[] = [];
  private routerScrolls = false;
  private awaitedScroll: AwaitedScroll | null = null;

  constructor() {
    const events = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.stopAwaitingScroll();
      } else if (event instanceof NavigationEnd && this.routerScrolls) {
        this.awaitScrollAfter(event.id);
      } else if (event instanceof Scroll) {
        this.routerScrolled(event.routerEvent.id);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      events.unsubscribe();
      this.stopAwaitingScroll();
    });
  }

  pending(): () => void {
    const placement = {};
    this.waiting.add(placement);
    return () => {
      if (this.waiting.delete(placement) && this.waiting.size === 0) {
        const settled = this.settled;
        this.settled = [];
        settled.forEach((done) => done());
      }
    };
  }

  isSettled(): boolean {
    return this.waiting.size === 0;
  }

  placed(view: Window, longestMs: number): Promise<void> {
    if (this.waiting.size === 0) {
      return Promise.resolve();
    }
    return new Promise((done) => {
      const timer = view.setTimeout(settle, longestMs);
      this.settled.push(settle);
      function settle(): void {
        view.clearTimeout(timer);
        done();
      }
    });
  }

  private awaitScrollAfter(navigation: number): void {
    this.stopAwaitingScroll();
    this.awaitedScroll = { navigation, placed: this.pending() };
  }

  private routerScrolled(navigation: number): void {
    this.routerScrolls = true;
    const awaited = this.awaitedScroll;
    if (awaited?.navigation === navigation) {
      this.awaitedScroll = null;
      queueMicrotask(awaited.placed);
    }
  }

  private stopAwaitingScroll(): void {
    this.awaitedScroll?.placed();
    this.awaitedScroll = null;
  }
}
