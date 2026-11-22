import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScrollHold {
  private holds = false;
  private held: (() => void) | null = null;
  private readonly waiting = new Set<() => void>();

  get holding(): boolean {
    return this.holds;
  }

  hold(): void {
    this.holds = true;
  }

  release(): void {
    const held = this.held;
    const waiting = [...this.waiting];
    this.holds = false;
    this.held = null;
    this.waiting.clear();
    held?.();
    waiting.forEach((then) => then());
  }

  run(scroll: () => void): void {
    if (this.holds) {
      this.held = scroll;
    } else {
      scroll();
    }
  }

  whenReleased(then: () => void): () => void {
    if (!this.holds) {
      then();
      return () => undefined;
    }
    this.waiting.add(then);
    return () => this.waiting.delete(then);
  }
}
