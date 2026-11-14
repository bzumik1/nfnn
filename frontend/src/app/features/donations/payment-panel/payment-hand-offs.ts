import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PaymentHandOffs {
  private readonly last = signal<number | null>(null);

  readonly handedOffAt = this.last.asReadonly();

  note(): void {
    this.last.set(Date.now());
  }

  clear(): void {
    this.last.set(null);
  }
}
