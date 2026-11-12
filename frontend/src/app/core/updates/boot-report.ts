import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

import { ErrorReporter } from '../errors/error-reporter';
import { SESSION_STORAGE } from '../reload/reload-guard';

export const BOOT_RECOVERED_KEY = 'nfnn.boot.recovered';
export const BOOT_LAST_ATTEMPT_KEY = 'nfnn.boot.last';
export const STARTED_ATTRIBUTE = 'data-nfnn-started';
export const CODE_ARRIVED_ATTRIBUTE = 'data-nfnn-loading';

export function markCodeArrived(document: Document): void {
  document.documentElement.setAttribute(CODE_ARRIVED_ATTRIBUTE, '');
}

@Injectable({ providedIn: 'root' })
export class BootReport {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(SESSION_STORAGE);
  private readonly reporter = inject(ErrorReporter);

  started(): void {
    this.document.documentElement.setAttribute(STARTED_ATTRIBUTE, '');
    let recovered: boolean;
    try {
      const storage = this.storage();
      recovered = storage.getItem(BOOT_RECOVERED_KEY) !== null;
      storage.removeItem(BOOT_RECOVERED_KEY);
    } catch {
      return;
    }
    if (recovered) {
      this.reporter.report('boot', 'start-up');
    }
  }
}
