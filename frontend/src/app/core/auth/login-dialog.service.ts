import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

export type LoginDialogMode = 'login' | 'register' | 'reset';

export interface LoginDialogOptions {
  returnTo?: string;
  afterSignIn?: () => void;
}

@Injectable({ providedIn: 'root' })
export class LoginDialogService {
  private readonly router = inject(Router);
  private readonly opened = signal(false);
  private readonly mode = signal<LoginDialogMode>('login');
  private options: LoginDialogOptions = {};
  readonly isOpen = this.opened.asReadonly();
  readonly initialMode = this.mode.asReadonly();

  open(mode: LoginDialogMode = 'login', options: LoginDialogOptions = {}): void {
    this.mode.set(mode);
    this.options = options;
    this.opened.set(true);
  }

  close(): void {
    this.opened.set(false);
    this.options = {};
  }

  signedIn(): void {
    const { returnTo, afterSignIn } = this.options;
    this.close();
    if (returnTo !== undefined) {
      void this.router.navigateByUrl(returnTo);
      return;
    }
    afterSignIn?.();
  }
}
