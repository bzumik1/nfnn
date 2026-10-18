import { Injectable, signal } from '@angular/core';

export type LoginDialogMode = 'login' | 'register' | 'reset';

@Injectable({ providedIn: 'root' })
export class LoginDialogService {
  private readonly opened = signal(false);
  private readonly mode = signal<LoginDialogMode>('login');
  readonly isOpen = this.opened.asReadonly();
  readonly initialMode = this.mode.asReadonly();

  open(mode: LoginDialogMode = 'login'): void {
    this.mode.set(mode);
    this.opened.set(true);
  }

  close(): void {
    this.opened.set(false);
  }
}
