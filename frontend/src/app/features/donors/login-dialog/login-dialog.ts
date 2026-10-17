/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { problemOf } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { DonorLocale, DonorType } from '../../../core/auth/donor';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';

type Mode = 'login' | 'register' | 'reset';

interface RegistrationFields {
  name: string;
  companyIdentifier: string;
  street: string;
  city: string;
  postalCode: string;
  email: string;
  password: string;
}

export const PASSWORD_MIN_LENGTH = 12;

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
  private readonly document = inject(DOCUMENT);

  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  protected readonly mode = signal<Mode>('login');
  protected readonly donorType = signal<DonorType>('PERSON');
  protected readonly loading = signal(false);
  protected readonly resetSent = signal(false);
  protected readonly error = signal('');

  protected email = '';
  protected password = '';
  protected registration: RegistrationFields = emptyRegistration();
  protected resetEmail = '';

  setMode(next: Mode): void {
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

  submitReset(): void {
    this.loading.set(true);
    setTimeout(() => {
      this.loading.set(false);
      this.resetSent.set(true);
    }, 1000);
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
    this.error.set(describeFailure(failure));
  }
}

function emptyRegistration(): RegistrationFields {
  return { name: '', companyIdentifier: '', street: '', city: '', postalCode: '', email: '', password: '' };
}

function preferredLocaleOf(locale: string): DonorLocale {
  return locale.toLowerCase().startsWith('en') ? 'en' : 'cs';
}

function describeFailure(failure: unknown): string {
  const problem = problemOf(failure);
  if (problem === null || problem.title === '') {
    return $localize`:@@donor.login.error.generic:Spojení se serverem se nepodařilo. Zkuste to prosím znovu.`;
  }
  const fieldMessages = problem.errors.map((error) => error.message).filter((message) => message !== '');
  return [problem.title + '.', problem.detail, ...fieldMessages].filter((part) => part !== '').join(' ');
}
