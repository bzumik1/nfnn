import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

export const OFFER_HIDDEN_KEY = 'nfnn.alerts-offer.hidden-until';
export const DEVICE_OWNER_KEY = 'nfnn.alerts.device-owner';
export const OFFER_HIDDEN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const OWNER_LABEL = 'nfnn.alerts.device-owner:';

@Injectable({ providedIn: 'root' })
export class DeviceAlertMarks {
  private readonly window = inject(DOCUMENT).defaultView;

  offerHidden(): boolean {
    const until = Number(this.read(OFFER_HIDDEN_KEY) ?? 0);
    return Number.isFinite(until) && until > Date.now();
  }

  hideOffer(): void {
    this.write(OFFER_HIDDEN_KEY, String(Date.now() + OFFER_HIDDEN_DAYS * DAY_MS));
  }

  async ownedBy(donorId: string): Promise<boolean> {
    const stored = this.read(DEVICE_OWNER_KEY);
    return stored !== null && stored === (await this.ownerMark(donorId));
  }

  async markOwner(donorId: string): Promise<void> {
    this.write(DEVICE_OWNER_KEY, await this.ownerMark(donorId));
  }

  clearOwner(): void {
    try {
      this.window?.localStorage.removeItem(DEVICE_OWNER_KEY);
    } catch {
      return;
    }
  }

  private async ownerMark(donorId: string): Promise<string> {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(OWNER_LABEL + donorId),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }

  private read(key: string): string | null {
    try {
      return this.window?.localStorage.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.window?.localStorage.setItem(key, value);
    } catch {
      return;
    }
  }
}
