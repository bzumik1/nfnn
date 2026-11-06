import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';

export const ACCOUNT_SHEET_STEP = 'nfnnAccountSheet';

@Injectable({ providedIn: 'root' })
export class AccountSheetReturn {
  private readonly asked = signal(false);
  readonly wanted = this.asked.asReadonly();

  constructor() {
    const navigations = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.asked.set(event.navigationTrigger === 'popstate' && leftBySheet(event.restoredState));
      }
    });
    inject(DestroyRef).onDestroy(() => navigations.unsubscribe());
  }

  taken(): void {
    this.asked.set(false);
  }
}

function leftBySheet(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[ACCOUNT_SHEET_STEP] === true
  );
}
