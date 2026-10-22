/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthApi } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { DonorLocale, DonorType, PASSWORD_MIN_LENGTH } from '../../../core/auth/donor';
import { LoginDialogMode, LoginDialogService } from '../../../core/auth/login-dialog.service';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { PasswordReveal } from '../../../shared/ui/password-reveal/password-reveal';
import {
  CITY_MESSAGES,
  COMPANY_NAME_MESSAGES,
  PERSON_NAME_MESSAGES,
  POSTAL_CODE_MESSAGES,
  STREET_MESSAGES,
} from '../donor-field-messages';

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
const EMAIL_NOT_VERIFIED = 'auth/email-not-verified';

@Component({
  selector: 'app-login-dialog',
  imports: [
    FormsModule,
    RouterLink,
    Dialog,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    PasswordReveal,
  ],
  templateUrl: './login-dialog.html',
  styleUrl: './login-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  protected readonly registrationSent = signal(false);
  protected readonly emailNotVerified = signal(false);
  protected readonly verificationResent = signal(false);
  protected readonly error = signal('');

  protected email = '';
  protected password = '';
  protected registration: RegistrationFields = emptyRegistration();
  protected resetEmail = '';

  protected readonly emailMessages = {
    required: $localize`:@@donor.form.email.required:Vyplňte prosím e-mail.`,
    email: $localize`:@@donor.form.email.invalid:Zadejte e-mail ve tvaru jana@example.cz.`,
  };
  protected readonly signInPasswordMessages = {
    required: $localize`:@@donor.form.password.required:Vyplňte prosím heslo.`,
  };
  protected readonly newPasswordHint = $localize`:@@donor.register.passwordHint:Alespoň 12 znaků. Klidně celá věta, která se vám dobře pamatuje.`;
  protected readonly newPasswordMessages = {
    required: $localize`:@@donor.form.newPassword.required:Zvolte si prosím heslo.`,
    minlength: $localize`:@@donor.form.newPassword.tooShort:Heslo musí mít alespoň 12 znaků.`,
  };
  protected readonly personNameMessages = PERSON_NAME_MESSAGES;
  protected readonly companyNameMessages = COMPANY_NAME_MESSAGES;
  protected readonly companyIdentifierHint = $localize`:@@donor.register.companyIdentifierHint:Osm číslic, uvedeme ho na potvrzení o daru.`;
  protected readonly companyIdentifierMessages = {
    required: $localize`:@@donor.register.companyIdentifier.required:Vyplňte prosím IČO.`,
    pattern: $localize`:@@donor.register.companyIdentifier.invalid:IČO má osm číslic.`,
  };
  protected readonly streetMessages = STREET_MESSAGES;
  protected readonly cityMessages = CITY_MESSAGES;
  protected readonly postalCodeMessages = POSTAL_CODE_MESSAGES;

  private readonly tooManyAttempts = $localize`:@@donor.login.error.tooManyAttempts:Příliš mnoho pokusů z této adresy. Zkuste to prosím za chvíli znovu.`;
  private readonly tooManyResetRequests = $localize`:@@donor.login.reset.error.tooMany:Odeslali jste příliš mnoho žádostí. Zkuste to prosím za hodinu.`;

  setMode(next: LoginDialogMode): void {
    this.mode.set(next);
    this.error.set('');
    this.emailNotVerified.set(false);
    this.verificationResent.set(false);
  }

  setDonorType(type: DonorType): void {
    this.donorType.set(type);
    this.error.set('');
  }

  submitLogin(form: NgForm): void {
    if (!this.readyToSend(form)) {
      return;
    }
    this.emailNotVerified.set(false);
    this.verificationResent.set(false);
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => this.enterPortal(),
      error: (failure: unknown) => {
        this.emailNotVerified.set(problemTypeEndsWith(failure, EMAIL_NOT_VERIFIED));
        this.failUnlessThrottled(failure, this.tooManyAttempts);
      },
    });
  }

  resendVerification(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.authApi.requestEmailVerification(this.email.trim()).subscribe({
      next: () => {
        this.loading.set(false);
        this.emailNotVerified.set(false);
        this.verificationResent.set(true);
      },
      error: (failure: unknown) => this.failUnlessThrottled(failure, this.tooManyResetRequests),
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
        next: () => {
          this.loading.set(false);
          this.registrationSent.set(true);
        },
        error: (failure: unknown) => this.failUnlessThrottled(failure, this.tooManyAttempts),
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
      error: (failure: unknown) => this.failUnlessThrottled(failure, this.tooManyResetRequests),
    });
  }

  backToLogin(): void {
    this.resetSent.set(false);
    this.registrationSent.set(false);
    this.setMode('login');
  }

  closeDialog(): void {
    this.dialog.close();
  }

  private readyToSend(form: NgForm): boolean {
    if (form.invalid) {
      this.error.set('');
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
      describeProblem(
        failure,
        $localize`:@@donor.login.error.generic:Spojení se serverem se nepodařilo. Zkuste to prosím znovu.`,
      ),
    );
  }

  private failUnlessThrottled(failure: unknown, tooMany: string): void {
    if (failure instanceof HttpErrorResponse && failure.status === TOO_MANY_REQUESTS) {
      this.loading.set(false);
      this.error.set(tooMany);
      return;
    }
    this.fail(failure);
  }
}

function emptyRegistration(): RegistrationFields {
  return {
    name: '',
    companyIdentifier: '',
    street: '',
    city: '',
    postalCode: '',
    email: '',
    password: '',
  };
}

function preferredLocaleOf(locale: string): DonorLocale {
  return locale.toLowerCase().startsWith('en') ? 'en' : 'cs';
}
