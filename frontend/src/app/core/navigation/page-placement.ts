import type { HttpInterceptorFn } from '@angular/common/http';
import { DestroyRef, inject, Injectable } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  Scroll,
} from '@angular/router';
import { finalize } from 'rxjs';

const API_PATH = '/api/';

interface AwaitedScroll {
  readonly navigation: number;
  readonly placed: () => void;
}

@Injectable({ providedIn: 'root' })
export class PagePlacement {
  private readonly waiting = new Set<object>();
  private settled: (() => void)[] = [];
  private reads = new Set<object>();
  private readsAnswered: (() => void)[] = [];
  private countsReads = false;
  private routerScrolls = false;
  private awaitedScroll: AwaitedScroll | null = null;

  constructor() {
    const events = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.stopAwaitingScroll();
        this.forgetReads();
        this.countsReads = true;
      } else if (event instanceof NavigationEnd) {
        if (this.routerScrolls) {
          this.awaitScrollAfter(event.id);
        } else {
          this.countsReads = false;
        }
      } else if (event instanceof Scroll) {
        this.routerScrolled(event.routerEvent.id);
      } else if (
        event instanceof NavigationCancel ||
        event instanceof NavigationError ||
        event instanceof NavigationSkipped
      ) {
        this.countsReads = false;
      }
    });
    inject(DestroyRef).onDestroy(() => {
      events.unsubscribe();
      this.stopAwaitingScroll();
      this.forgetReads();
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
    return awaited(this.settled, view, longestMs);
  }

  reading(): () => void {
    if (!this.countsReads) {
      return () => undefined;
    }
    const read = {};
    const reads = this.reads;
    reads.add(read);
    return () => {
      if (reads.delete(read) && reads.size === 0 && reads === this.reads) {
        this.answerReads();
      }
    };
  }

  isAnswered(): boolean {
    return this.reads.size === 0;
  }

  answered(view: Window, longestMs: number): Promise<void> {
    if (this.reads.size === 0) {
      return Promise.resolve();
    }
    return awaited(this.readsAnswered, view, longestMs);
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
      this.countsReads = false;
      queueMicrotask(awaited.placed);
    }
  }

  private stopAwaitingScroll(): void {
    this.awaitedScroll?.placed();
    this.awaitedScroll = null;
  }

  private forgetReads(): void {
    this.reads = new Set();
    this.answerReads();
  }

  private answerReads(): void {
    const answered = this.readsAnswered;
    this.readsAnswered = [];
    answered.forEach((done) => done());
  }
}

function awaited(waiters: (() => void)[], view: Window, longestMs: number): Promise<void> {
  return new Promise((done) => {
    const timer = view.setTimeout(settle, longestMs);
    waiters.push(settle);
    function settle(): void {
      view.clearTimeout(timer);
      done();
    }
  });
}

export const pageReadsInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.method !== 'GET' || !request.url.startsWith(API_PATH)) {
    return next(request);
  }
  return next(request).pipe(finalize(inject(PagePlacement).reading()));
};
