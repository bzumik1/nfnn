import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScrollHold {
  private holding = false;
  private held: (() => void) | null = null;

  hold(): void {
    this.holding = true;
  }

  release(): void {
    const held = this.held;
    this.holding = false;
    this.held = null;
    held?.();
  }

  run(scroll: () => void): void {
    if (this.holding) {
      this.held = scroll;
    } else {
      scroll();
    }
  }
}
