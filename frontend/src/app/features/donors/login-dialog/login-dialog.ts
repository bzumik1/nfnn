/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { describeProblem } from '../../../core/auth/api-problem';
import { AuthApi } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { DonorLocale, DonorType, PASSWORD_MIN_LENGTH } from '../../../core/auth/donor';
import { LoginDialogMode, LoginDialogService } from '../../../core/auth/login-dialog.service';

interface RegistrationFields {
  name: string;
  companyIdentifier: string;
  street: string;
  city: string;
  postalCode: string;
  email: string;
  password: string;
}

const TOO_MANY_REQUESTS = 429;

@Component({
  selector: 'app-login-dialog',
  imports: [FormsModule, RouterLink],
  templateUrl: './login-dialog.html',
  styleUrl: './login-dialog.scss',
})
export class LoginDialog {
  private readonly router = inject(Router);
  private readonly dialog = inject(LoginDialogService);
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);
  private readonly document = inject(DOCUMENT);

  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  protected readonly mode = signal<LoginDialogMode>(this.dialog.initialMode());
  protected readonly donorType = signal<DonorType>('PERSON');
  protected readonly loading = signal(false);
  protected readonly resetSent = signal(false);
  protected readonly error = signal('');

  protected email = '';
  protected password = '';
  protected registration: RegistrationFields = emptyRegistration();
  protected resetEmail = '';

  setMode(next: LoginDialogMode): void {
    this.mode.set(next);
    this.error.set('');
  }

  setDonorType(type: DonorType): void {
    this.donorType.set(type);
    this.error.set('');
  }

  submitLogin(form: NgForm): void {
    if (!this.readyToSend(form)) {
      return;
    }
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => this.enterPortal(),
      error: (failure: unknown) => this.fail(failure),
    });
  }

  submitRegistration(form: NgForm): void {
    if (!this.readyToSend(form)) {
      return;
    }
    const company = this.donorType() === 'COMPANY';
    this.auth
      .register({
        type: this.donorType(),
        name: this.registration.name.trim(),
        companyIdentifier: company ? this.registration.companyIdentifier.replace(/\s+/g, '') : null,
        address: {
          street: this.registration.street.trim(),
          city: this.registration.city.trim(),
          postalCode: this.registration.postalCode.trim(),
        },
        email: this.registration.email.trim(),
        password: this.registration.password,
        preferredLocale: preferredLocaleOf(this.document.documentElement.lang),
      })
      .subscribe({
        next: () => this.enterPortal(),
        error: (failure: unknown) => this.fail(failure),
      });
  }

  submitReset(form: NgForm): void {
    if (!this.readyToSend(form)) {
      return;
    }
    this.authApi.requestPasswordReset(this.resetEmail.trim()).subscribe({
      next: () => {
        this.loading.set(false);
        this.resetSent.set(true);
      },
      error: (failure: unknown) => this.failReset(failure),
    });
  }

  backToLogin(): void {
    this.resetSent.set(false);
    this.setMode('login');
  }

  closeDialog(): void {
    this.dialog.close();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeDialog();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDialog();
  }

  private readyToSend(form: NgForm): boolean {
    if (form.invalid) {
      this.error.set($localize`:@@donor.login.error.fields:Vyplňte prosím správně všechna pole.`);
      return false;
    }
    if (this.loading()) {
      return false;
    }
    this.loading.set(true);
    this.error.set('');
    return true;
  }

  private enterPortal(): void {
    this.loading.set(false);
    this.dialog.close();
    this.router.navigateByUrl('/donor/prehled');
  }

  private fail(failure: unknown): void {
    this.loading.set(false);
    this.error.set(
      describeProblem(failure, $localize`:@@donor.login.error.generic:Spojení se serverem se nepodařilo. Zkuste to prosím znovu.`),
    );
  }

  private failReset(failure: unknown): void {
    if (failure instanceof HttpErrorResponse && failure.status === TOO_MANY_REQUESTS) {
      this.loading.set(false);
      this.error.set(
        $localize`:@@donor.login.reset.error.tooMany:Odeslali jste příliš mnoho žádostí. Zkuste to prosím za hodinu.`,
      );
      return;
    }
    this.fail(failure);
  }
}

function emptyRegistration(): RegistrationFields {
  return { name: '', companyIdentifier: '', street: '', city: '', postalCode: '', email: '', password: '' };
}

function preferredLocaleOf(locale: string): DonorLocale {
  return locale.toLowerCase().startsWith('en') ? 'en' : 'cs';
}
