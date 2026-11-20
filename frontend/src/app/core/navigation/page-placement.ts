import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PagePlacement {
  private readonly waiting = new Set<object>();
  private settled: (() => void)[] = [];

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
}
