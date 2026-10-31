import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

export const RECEIPT_RESTART_PARAM = 'stahnout';
const RESTART_KEY = 'nfnn.receipt-restart';

export type ReceiptRestartOutcome = 'reloading' | 'reloaded-already' | 'unavailable';

@Injectable({ providedIn: 'root' })
export class ReceiptRestart {
  private readonly document = inject(DOCUMENT);

  tryRestart(download: string): ReceiptRestartOutcome {
    if (this.read() === download) {
      this.finished();
      return 'reloaded-already';
    }
    if (!this.write(download)) {
      return 'unavailable';
    }
    const url = new URL(this.document.location.href);
    url.searchParams.set(RECEIPT_RESTART_PARAM, download);
    this.document.location.assign(url.toString());
    return 'reloading';
  }

  abandoned(download: string): void {
    if (this.read() === download) {
      this.finished();
    }
  }

  resumes(download: string): boolean {
    return this.read() === download;
  }

  finished(): void {
    try {
      sessionStorage.removeItem(RESTART_KEY);
    } catch {
      return;
    }
  }

  private read(): string | null {
    try {
      return sessionStorage.getItem(RESTART_KEY);
    } catch {
      return null;
    }
  }

  private write(download: string): boolean {
    try {
      sessionStorage.setItem(RESTART_KEY, download);
      return sessionStorage.getItem(RESTART_KEY) === download;
    } catch {
      return false;
    }
  }
}
