import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoginDialogService {
  private readonly opened = signal(false);
  readonly isOpen = this.opened.asReadonly();

  open(): void {
    this.opened.set(true);
  }

  close(): void {
    this.opened.set(false);
  }
}
