import { Injectable, signal } from '@angular/core';

export type LoginDialogMode = 'login' | 'register' | 'reset';

export interface LoginDialogOptions {
  stayOnPage?: boolean;
}

@Injectable({ providedIn: 'root' })
export class LoginDialogService {
  private readonly opened = signal(false);
  private readonly mode = signal<LoginDialogMode>('login');
  private readonly staying = signal(false);
  readonly isOpen = this.opened.asReadonly();
  readonly initialMode = this.mode.asReadonly();
  readonly staysOnPage = this.staying.asReadonly();

  open(mode: LoginDialogMode = 'login', options: LoginDialogOptions = {}): void {
    this.mode.set(mode);
    this.staying.set(options.stayOnPage ?? false);
    this.opened.set(true);
  }

  close(): void {
    this.opened.set(false);
    this.staying.set(false);
  }
}
