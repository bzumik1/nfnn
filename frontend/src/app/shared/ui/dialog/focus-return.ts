import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FocusReturn {
  private returning: Element | null = null;

  returnTo(element: HTMLElement): void {
    this.whileReturning(element, () => element.focus({ preventScroll: true }));
  }

  whileReturning(element: Element | null, action: () => void): void {
    const outer = this.returning;
    this.returning = element;
    try {
      action();
    } finally {
      this.returning = outer;
    }
  }

  isReturning(element: Element): boolean {
    return this.returning === element;
  }
}
