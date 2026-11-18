import { Injectable } from '@angular/core';
import { HistoryState } from '../../core/navigation/back-target';

export const APP_ACCOUNT_KEY = 'nfnnAppAccount';

export function accountLeftIn(state: HistoryState | null): string | null {
  const section = state?.[APP_ACCOUNT_KEY];
  return typeof section === 'string' ? section : null;
}

@Injectable({ providedIn: 'root' })
export class AccountReturn {
  private closing = false;

  closeAdministration(): void {
    this.closing = true;
  }

  returnsByStep(): boolean {
    const closed = this.closing;
    this.closing = false;
    return !closed;
  }
}
