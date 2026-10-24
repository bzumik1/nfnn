import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DialogHistory } from '../../shared/ui/dialog/dialog-history';
import { DonorType } from './donor';

export type LoginDialogMode = 'login' | 'register' | 'reset';

export interface LoginDialogOptions {
  returnTo?: string;
  afterSignIn?: () => void;
  email?: string;
}

export interface RegistrationDraft {
  donorType: DonorType;
  signInMethod: 'password' | 'passkey';
  name: string;
  companyIdentifier: string;
  street: string;
  city: string;
  postalCode: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class LoginDialogService {
  private readonly router = inject(Router);
  private readonly history = inject(DialogHistory);
  private readonly opened = signal(false);
  private readonly mode = signal<LoginDialogMode>('login');
  private readonly email = signal('');
  private readonly draft = signal<RegistrationDraft | null>(null);
  private options: LoginDialogOptions = {};
  private stepBack: (() => void) | null = null;
  readonly isOpen = this.opened.asReadonly();
  readonly initialMode = this.mode.asReadonly();
  readonly initialEmail = this.email.asReadonly();
  readonly registrationDraft = this.draft.asReadonly();

  open(mode: LoginDialogMode = 'login', options: LoginDialogOptions = {}): void {
    this.mode.set(mode);
    this.email.set(options.email ?? '');
    this.options = options;
    this.opened.set(true);
    this.history.open({
      stepBack: () => this.stepBack?.(),
      close: () => this.close(),
    });
  }

  showStep(depth: number): void {
    this.history.showStep(depth);
  }

  onStepBack(handler: (() => void) | null): void {
    this.stepBack = handler;
  }

  keepRegistrationDraft(draft: RegistrationDraft): void {
    this.draft.set(draft);
  }

  dropRegistrationDraft(): void {
    this.draft.set(null);
  }

  close(): void {
    this.dismiss();
    this.history.close();
  }

  closeForNavigation(): void {
    this.dismiss();
    this.history.release();
  }

  signedIn(): void {
    const { returnTo, afterSignIn } = this.options;
    this.draft.set(null);
    this.dismiss();
    if (returnTo !== undefined) {
      this.history.handOver(returnTo);
      void this.router.navigateByUrl(returnTo);
      return;
    }
    this.history.close();
    afterSignIn?.();
  }

  private dismiss(): void {
    this.opened.set(false);
    this.options = {};
  }
}
