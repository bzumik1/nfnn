import { Injectable, signal } from '@angular/core';

export type SignedOutReason = 'signed-out' | 'device-data-deleted';

@Injectable({ providedIn: 'root' })
export class SignedOutNotice {
  private readonly visible = signal(false);
  private readonly why = signal<SignedOutReason>('signed-out');
  readonly shown = this.visible.asReadonly();
  readonly reason = this.why.asReadonly();

  show(reason: SignedOutReason = 'signed-out'): void {
    this.why.set(reason);
    this.visible.set(true);
  }

  dismiss(): void {
    this.visible.set(false);
  }
}
