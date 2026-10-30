import { Injectable, signal } from '@angular/core';

export type AdminAccessRefusalReason = 'not-administrator' | 'second-factor';

@Injectable({ providedIn: 'root' })
export class AdminAccessRefusal {
  private readonly current = signal<AdminAccessRefusalReason | null>(null);

  readonly reason = this.current.asReadonly();

  refuse(reason: AdminAccessRefusalReason): void {
    this.current.set(reason);
  }

  clear(): void {
    this.current.set(null);
  }
}
