import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScrollHold {
  private holding = false;
  private held: (() => void) | null = null;
  private readonly waiting = new Set<() => void>();

  hold(): void {
    this.holding = true;
  }

  release(): void {
    const held = this.held;
    const waiting = [...this.waiting];
    this.holding = false;
    this.held = null;
    this.waiting.clear();
    held?.();
    waiting.forEach((then) => then());
  }

  run(scroll: () => void): void {
    if (this.holding) {
      this.held = scroll;
    } else {
      scroll();
    }
  }

  whenReleased(then: () => void): () => void {
    if (!this.holding) {
      then();
      return () => undefined;
    }
    this.waiting.add(then);
    return () => this.waiting.delete(then);
  }
}
