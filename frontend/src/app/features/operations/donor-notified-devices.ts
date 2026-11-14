import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DonorNotifiedDevices {
  private readonly notified = signal<ReadonlySet<string>>(new Set());

  readonly ids = this.notified.asReadonly();

  accept(deviceIds: readonly string[]): void {
    this.notified.set(new Set(deviceIds));
  }
}
