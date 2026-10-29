import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SignedOutNotice {
  private readonly visible = signal(false);
  readonly shown = this.visible.asReadonly();

  show(): void {
    this.visible.set(true);
  }

  dismiss(): void {
    this.visible.set(false);
  }
}
