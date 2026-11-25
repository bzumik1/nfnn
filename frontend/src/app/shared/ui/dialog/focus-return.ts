import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FocusReturn {
  private returning: Element | null = null;

  returnTo(element: HTMLElement): void {
    this.returning = element;
    try {
      element.focus({ preventScroll: true });
    } finally {
      this.returning = null;
    }
  }

  isReturning(element: Element): boolean {
    return this.returning === element;
  }
}
