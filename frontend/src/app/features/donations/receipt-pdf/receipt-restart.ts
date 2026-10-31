import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

export const RECEIPT_RESTART_PARAM = 'stahnout';
const RESTART_KEY = 'nfnn.receipt-restart';

@Injectable({ providedIn: 'root' })
export class ReceiptRestart {
  private readonly document = inject(DOCUMENT);

  tryRestart(download: string): boolean {
    if (this.read() === download) {
      this.finished();
      return false;
    }
    if (!this.write(download)) {
      return false;
    }
    const url = new URL(this.document.location.href);
    url.searchParams.set(RECEIPT_RESTART_PARAM, download);
    this.document.location.assign(url.toString());
    return true;
  }

  resumes(download: string): boolean {
    return download === '';
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
