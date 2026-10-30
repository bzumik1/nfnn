/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  describeProblem,
  describeProblemWithoutFields,
  problemOf,
  problemTypeEndsWith,
} from '../../../core/auth/api-problem';
import { AuthApi } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import {
  DonorLocale,
  DonorType,
  PASSWORD_MIN_LENGTH,
  SecondFactorRecovery,
} from '../../../core/auth/donor';
import {
  LoginDialogMode,
  LoginDialogService,
  RegistrationDraft,
} from '../../../core/auth/login-dialog.service';
import {
  PasskeyAuthenticator,
  PasskeyCeremonyError,
} from '../../../core/auth/passkey-authenticator';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { PasswordReveal } from '../../../shared/ui/password-reveal/password-reveal';
import { QrCode } from '../../../shared/ui/qr-code/qr-code';
import { placeServerErrors } from '../../../shared/ui/form-field/server-errors';
import { RadioGroup } from '../../../shared/ui/radio-group/radio-group';
import { formatMinorUnits } from '../../donations/donation-amount';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { CompanyIdentifierValidator, hasValidCheckDigit } from '../company-identifier';
import { CompanyLookupApi, RegisteredCompany } from '../company-lookup-api';
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

type RegisterField = 'name' | 'street' | 'city' | 'postalCode';

type Step = 'login' | 'code' | 'recovery' | 'register' | 'registered' | 'reset' | 'reset-sent';

const TOO_MANY_REQUESTS = 429;
const EMAIL_NOT_VERIFIED = 'auth/email-not-verified';
const SECOND_FACTOR_REQUIRED = 'auth/second-factor-required';
const INVALID_SECOND_FACTOR_CHALLENGE = 'auth/invalid-second-factor-challenge';
const STEP_FOCUS = '[autofocus]';
const STEP_DEPTH: Readonly<Record<Step, number>> = {
  login: 0,
  code: 1,
  recovery: 2,
  register: 0,
  registered: 0,
  reset: 0,
  'reset-sent': 0,
};
const REGISTER_FIELDS: readonly RegisterField[] = ['name', 'street', 'city', 'postalCode'];
const REGISTRATION_FIELDS: Readonly<Record<string, string>> = {
  name: 'name',
  companyIdentifier: 'companyIdentifier',
  'address.street': 'street',
  'address.city': 'city',
  'address.postalCode': 'postalCode',
  email: 'email',
  password: 'password',
};

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
    RadioGroup,
    CopyButton,
    QrCode,
    CompanyIdentifierValidator,
  ],
  templateUrl: './login-dialog.html',
  styleUrl: './login-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginDialog {
  private readonly dialog = inject(LoginDialogService);
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly passkeyAuthenticator = inject(PasskeyAuthenticator);
  private readonly companyLookup = inject(CompanyLookupApi);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly draft = this.dialog.registrationDraft();
  private readonly confirmationReturnTo = this.dialog.confirmationReturnTo();

  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  protected readonly recoveryQrLabel = $localize`:@@donor.login.recovery.qrAlt:QR platba 1 Kč se zprávou pro obnovu přístupu`;
  protected readonly passkeysSupported = this.passkeyAuthenticator.supported();
  protected readonly mode = signal<LoginDialogMode>(this.dialog.initialMode());
  protected readonly forAdministration = this.dialog.forAdministration();
  protected readonly donorType = signal<DonorType>(this.draft?.donorType ?? 'PERSON');
  protected readonly signInMethod = signal<'password' | 'passkey'>(
    this.passkeysSupported ? (this.draft?.signInMethod ?? 'password') : 'password',
  );
  protected readonly loading = signal(false);
  protected readonly resetSent = signal(false);
  protected readonly resetResent = signal(false);
  protected readonly registrationSent = signal(false);
  protected readonly registrationResent = signal(false);
  protected readonly emailNotVerified = signal(false);
  protected readonly verificationResent = signal(false);
  protected readonly challenge = signal<string | null>(null);
  protected readonly recovery = signal<SecondFactorRecovery | null>(null);
  protected readonly error = signal('');
  protected readonly passkeyError = signal('');
  protected readonly filledFromRegister = signal(false);
  protected readonly step = computed<Step>(() => {
    switch (this.mode()) {
      case 'register':
        return this.registrationSent() ? 'registered' : 'register';
      case 'reset':
        return this.resetSent() ? 'reset-sent' : 'reset';
      default:
        if (this.recovery() !== null) {
          return 'recovery';
        }
        return this.challenge() === null ? 'login' : 'code';
    }
  });
  protected readonly atCrossroads = computed(
    () => this.step() === 'login' || this.step() === 'register',
  );

  protected email = this.mode() === 'login' ? this.dialog.initialEmail() : '';
  protected password = '';
  protected code = '';
  protected registration: RegistrationFields = registrationOf(
    this.draft,
    this.mode() === 'register' ? this.dialog.initialEmail() : '',
  );
  protected resetEmail = this.mode() === 'reset' ? this.dialog.initialEmail() : '';

  protected readonly emailMessages = {
    required: $localize`:@@donor.form.email.required:Vyplňte prosím e-mail.`,
    email: $localize`:@@donor.form.email.invalid:Zadejte e-mail ve tvaru jana@example.cz.`,
  };
  protected readonly signInPasswordMessages = {
    required: $localize`:@@donor.form.password.required:Vyplňte prosím heslo.`,
  };
  protected readonly codeHint = $localize`:@@donor.login.secondFactor.codeHint:Šest číslic z ověřovací aplikace; kód se mění každých 30 sekund.`;
  protected readonly codeMessages = {
    required: $localize`:@@donor.form.code.required:Opište prosím kód z aplikace.`,
    pattern: $localize`:@@donor.form.code.invalid:Kód má přesně šest číslic.`,
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
    companyIdentifier: $localize`:@@donor.register.companyIdentifier.checksum:Toto IČO neexistuje, zkontrolujte prosím číslice.`,
  };
  protected readonly streetMessages = STREET_MESSAGES;
  protected readonly cityMessages = CITY_MESSAGES;
  protected readonly postalCodeMessages = POSTAL_CODE_MESSAGES;

  private readonly tooManyAttempts = $localize`:@@donor.login.error.tooManyAttempts:Příliš mnoho pokusů z této adresy. Zkuste to prosím za chvíli znovu.`;
  private readonly passkeyNotUsed = $localize`:@@donor.login.passkey.notUsed:Přihlášení přístupovým klíčem neproběhlo. Zkuste to prosím znovu, nebo se přihlaste heslem.`;
  private readonly tooManyResetRequests = $localize`:@@donor.login.reset.error.tooMany:Odeslali jste příliš mnoho žádostí. Zkuste to prosím za hodinu.`;

  private pendingLookup: Subscription | null = null;
  private lookedUpIdentifier = '';
  private fromRegister: Partial<Record<RegisterField, string>> = {};

  constructor() {
    this.dialog.onStepBack(() => this.stepBack());
    effect(() => this.dialog.showStep(STEP_DEPTH[this.step()]));
    inject(DestroyRef).onDestroy(() => {
      this.dropCompanyLookup();
      this.dialog.onStepBack(null);
      this.keepDraft();
    });
  }

  setMode(next: LoginDialogMode): void {
    this.carryEmail(next);
    this.mode.set(next);
    this.error.set('');
    this.passkeyError.set('');
    this.emailNotVerified.set(false);
    this.verificationResent.set(false);
    this.leaveCodeStep();
    this.focusStep();
  }

  setDonorType(type: DonorType): void {
    this.donorType.set(type);
    this.error.set('');
    if (type === 'PERSON') {
      this.forgetCompanyLookup();
    }
  }

  lookUpCompany(typed: string | null): void {
    const digits = (typed ?? '').replace(/\s+/g, '');
    if (digits === this.lookedUpIdentifier) {
      return;
    }
    this.forgetCompanyLookup();
    if (!hasValidCheckDigit(digits)) {
      return;
    }
    this.lookedUpIdentifier = digits;
    this.pendingLookup = this.companyLookup.lookUp(digits).subscribe({
      next: (company) => {
        this.pendingLookup = null;
        if (company !== null) {
          this.fillFromRegister(company);
        }
      },
      error: () => {
        this.pendingLookup = null;
      },
    });
  }

  submitLogin(form: NgForm): void {
    if (!this.readyToSend(form)) {
      return;
    }
    this.passkeyError.set('');
    this.emailNotVerified.set(false);
    this.verificationResent.set(false);
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => this.enterPortal(),
      error: (failure: unknown) => {
        if (problemTypeEndsWith(failure, SECOND_FACTOR_REQUIRED)) {
          this.askForCode(problemOf(failure)?.challenge ?? '');
          return;
        }
        this.emailNotVerified.set(problemTypeEndsWith(failure, EMAIL_NOT_VERIFIED));
        this.failUnlessThrottled(failure, this.tooManyAttempts);
      },
    });
  }

  signInWithPasskey(form: NgForm): void {
    if (this.loading()) {
      return;
    }
    form.form.markAsUntouched();
    this.loading.set(true);
    this.error.set('');
    this.passkeyError.set('');
    this.emailNotVerified.set(false);
    this.verificationResent.set(false);
    this.auth.signInWithPasskey().subscribe({
      next: () => this.enterPortal(),
      error: (failure: unknown) => {
        this.loading.set(false);
        this.passkeyError.set(
          failure instanceof PasskeyCeremonyError
            ? this.passkeyNotUsed
            : this.describeFailure(failure, this.tooManyAttempts),
        );
      },
    });
  }

  submitCode(form: NgForm): void {
    const challenge = this.challenge();
    if (challenge === null || !this.readyToSend(form)) {
      return;
    }
    this.auth.completeSecondFactor(challenge, this.code.trim()).subscribe({
      next: () => this.enterPortal(),
      error: (failure: unknown) => {
        if (problemTypeEndsWith(failure, INVALID_SECOND_FACTOR_CHALLENGE)) {
          this.leaveCodeStep();
        }
        this.failUnlessThrottled(failure, this.tooManyAttempts);
      },
    });
  }

  recoverByPayment(): void {
    const challenge = this.challenge();
    if (challenge === null || this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.authApi.startSecondFactorRecovery(challenge).subscribe({
      next: (recovery) => {
        this.loading.set(false);
        this.recovery.set(recovery);
        this.focusStep();
      },
      error: (failure: unknown) => {
        if (problemTypeEndsWith(failure, INVALID_SECOND_FACTOR_CHALLENGE)) {
          this.leaveCodeStep();
        }
        this.failUnlessThrottled(failure, this.tooManyAttempts);
      },
    });
  }

  backToCode(): void {
    this.recovery.set(null);
    this.error.set('');
    this.focusStep();
  }

  protected amount(recovery: SecondFactorRecovery): string {
    return formatMinorUnits(recovery.amountMinor);
  }

  protected day(isoDate: string): string {
    return formatDonationDate(isoDate);
  }

  protected time(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }

  backToPassword(): void {
    this.leaveCodeStep();
    this.error.set('');
    this.focusStep();
  }

  resendVerification(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.authApi.requestEmailVerification(this.email.trim(), this.confirmationReturnTo).subscribe({
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
    this.dropCompanyLookup();
    this.registrationResent.set(false);
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
        password: this.signInMethod() === 'password' ? this.registration.password : null,
        preferredLocale: preferredLocaleOf(this.document.documentElement.lang),
        ...(this.confirmationReturnTo === null ? {} : { returnTo: this.confirmationReturnTo }),
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.registrationSent.set(true);
          this.focusStep();
        },
        error: (failure: unknown) => this.refuseRegistration(form, failure),
      });
  }

  resendRegistrationLink(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.registrationResent.set(false);
    this.authApi
      .requestEmailVerification(this.registration.email.trim(), this.confirmationReturnTo)
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.registrationResent.set(true);
        },
        error: (failure: unknown) => this.failUnlessThrottled(failure, this.tooManyResetRequests),
      });
  }

  editRegistration(): void {
    this.registrationSent.set(false);
    this.registrationResent.set(false);
    this.error.set('');
    this.focusStep('#register-email');
  }

  submitReset(form: NgForm): void {
    if (!this.readyToSend(form)) {
      return;
    }
    this.resetResent.set(false);
    this.authApi.requestPasswordReset(this.resetEmail.trim()).subscribe({
      next: () => {
        this.loading.set(false);
        this.resetSent.set(true);
        this.focusStep();
      },
      error: (failure: unknown) => this.failUnlessThrottled(failure, this.tooManyResetRequests),
    });
  }

  resendReset(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.resetResent.set(false);
    this.authApi.requestPasswordReset(this.resetEmail.trim()).subscribe({
      next: () => {
        this.loading.set(false);
        this.resetResent.set(true);
      },
      error: (failure: unknown) => this.failUnlessThrottled(failure, this.tooManyResetRequests),
    });
  }

  backToLogin(): void {
    this.resetSent.set(false);
    this.resetResent.set(false);
    if (this.registrationSent()) {
      this.registrationSent.set(false);
      this.registrationResent.set(false);
      this.registration = emptyRegistration();
      this.dialog.dropRegistrationDraft();
    }
    this.setMode('login');
  }

  closeDialog(): void {
    this.dialog.close();
  }

  openPrivacyPolicy(): void {
    this.dialog.closeForNavigation();
  }

  private stepBack(): void {
    if (this.step() === 'recovery') {
      this.backToCode();
    } else if (this.step() === 'code') {
      this.backToPassword();
    }
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

  private askForCode(challenge: string): void {
    this.loading.set(false);
    this.error.set('');
    this.code = '';
    this.challenge.set(challenge);
    this.focusStep();
  }

  private focusStep(selector = STEP_FOCUS): void {
    afterNextRender(() => this.host.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }

  private carryEmail(next: LoginDialogMode): void {
    const typed = this.emailOf(this.mode()).trim();
    if (typed === '' || next === this.mode()) {
      return;
    }
    if (next === 'register') {
      this.registration.email = typed;
    } else if (next === 'reset') {
      this.resetEmail = typed;
    } else {
      this.email = typed;
    }
  }

  private emailOf(mode: LoginDialogMode): string {
    switch (mode) {
      case 'register':
        return this.registration.email;
      case 'reset':
        return this.resetEmail;
      default:
        return this.email;
    }
  }

  private keepDraft(): void {
    if (this.registrationSent() || !hasContent(this.registration)) {
      return;
    }
    this.dialog.keepRegistrationDraft({
      donorType: this.donorType(),
      signInMethod: this.signInMethod(),
      name: this.registration.name,
      companyIdentifier: this.registration.companyIdentifier,
      street: this.registration.street,
      city: this.registration.city,
      postalCode: this.registration.postalCode,
      email: this.registration.email,
    });
  }

  private fillFromRegister(company: RegisteredCompany): void {
    const offered: Record<RegisterField, string> = {
      name: company.name,
      street: company.address?.street ?? '',
      city: company.address?.city ?? '',
      postalCode: company.address?.postalCode ?? '',
    };
    let filled = false;
    for (const field of REGISTER_FIELDS) {
      const current = this.registration[field];
      if (current.trim() !== '' && current !== this.fromRegister[field]) {
        continue;
      }
      this.registration[field] = offered[field];
      this.fromRegister[field] = offered[field];
      filled = filled || offered[field] !== '';
    }
    this.filledFromRegister.set(filled);
    this.changeDetector.markForCheck();
  }

  private forgetCompanyLookup(): void {
    this.dropCompanyLookup();
    this.lookedUpIdentifier = '';
    this.filledFromRegister.set(false);
  }

  private dropCompanyLookup(): void {
    this.pendingLookup?.unsubscribe();
    this.pendingLookup = null;
  }

  private refuseRegistration(form: NgForm, failure: unknown): void {
    const errors = problemOf(failure)?.errors ?? [];
    if (placeServerErrors(form, errors, REGISTRATION_FIELDS).length === errors.length) {
      this.failUnlessThrottled(failure, this.tooManyAttempts);
      return;
    }
    this.loading.set(false);
    this.error.set(describeProblemWithoutFields(failure, this.genericError()));
    this.focusStep('.register-form .form-control.ng-invalid');
  }

  private leaveCodeStep(): void {
    this.challenge.set(null);
    this.recovery.set(null);
    this.code = '';
  }

  private enterPortal(): void {
    this.loading.set(false);
    this.registration = emptyRegistration();
    this.dialog.signedIn();
  }

  private genericError(): string {
    return $localize`:@@donor.login.error.generic:Spojení se serverem se nepodařilo. Zkuste to prosím znovu.`;
  }

  private describeFailure(failure: unknown, tooMany: string): string {
    if (failure instanceof HttpErrorResponse && failure.status === TOO_MANY_REQUESTS) {
      return tooMany;
    }
    return describeProblem(failure, this.genericError());
  }

  private failUnlessThrottled(failure: unknown, tooMany: string): void {
    this.loading.set(false);
    this.error.set(this.describeFailure(failure, tooMany));
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

function registrationOf(draft: RegistrationDraft | null, email: string): RegistrationFields {
  const fields = draft === null ? emptyRegistration() : { ...emptyRegistration(), ...draft };
  return {
    name: fields.name,
    companyIdentifier: fields.companyIdentifier,
    street: fields.street,
    city: fields.city,
    postalCode: fields.postalCode,
    email: email === '' ? fields.email : email,
    password: '',
  };
}

function hasContent(fields: RegistrationFields): boolean {
  return [fields.name, fields.companyIdentifier, fields.street, fields.city, fields.postalCode]
    .concat(fields.email)
    .some((value) => value.trim() !== '');
}

function preferredLocaleOf(locale: string): DonorLocale {
  return locale.toLowerCase().startsWith('en') ? 'en' : 'cs';
}
