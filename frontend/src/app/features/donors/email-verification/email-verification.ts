/// <reference types="@angular/localize" />

import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, Location } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { from, switchMap } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthApi } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { confirmationReturnOf, DONATE_SECTION } from '../../../core/auth/confirmation-return';
import { deviceName } from '../../../core/auth/device-name';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import {
  PasskeyAuthenticator,
  PasskeyCeremonyError,
} from '../../../core/auth/passkey-authenticator';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';

type Panel = 'missing-link' | 'confirming' | 'confirmed' | 'invalid' | 'failed' | 'link-requested';

const PAGE_PATH = '/potvrzeni-emailu';
const PORTAL_PATH = '/darce/prehled';
const INVALID_TOKEN = 'donors/invalid-email-verification-token';
const TOO_MANY_REQUESTS = 429;

@Component({
  selector: 'app-email-verification',
  imports: [FormsModule, RouterLink, FormField, FormControlDirective, FocusFirstInvalid],
  templateUrl: './email-verification.html',
  styleUrl: './email-verification.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailVerification {
  private readonly authApi = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly authenticator = inject(PasskeyAuthenticator);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly fragment = new URLSearchParams(inject(ActivatedRoute).snapshot.fragment ?? '');
  private readonly token = tokenOf(this.fragment);
  private readonly confirmationReturnTo = confirmationReturnOf(this.fragment.get('returnTo'));
  private readonly destination = this.confirmationReturnTo ?? PORTAL_PATH;

  protected readonly emailMessages = {
    required: $localize`:@@donor.form.email.required:Vyplňte prosím e-mail.`,
    email: $localize`:@@donor.form.email.invalid:Zadejte e-mail ve tvaru jana@example.cz.`,
  };
  protected readonly panel = signal<Panel>(this.token === null ? 'missing-link' : 'confirming');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly donorName = signal('');
  protected readonly needsPasskey = signal(false);
  protected readonly passkeyCreated = signal(false);
  protected readonly passkeysSupported = this.authenticator.supported();
  protected readonly returnsToDonation = this.destination === DONATE_SECTION;

  protected email = '';

  constructor() {
    const location = inject(Location);
    location.replaceState(PAGE_PATH, '', location.getState());
    if (this.token !== null) {
      this.confirm(this.token);
    }
  }

  requestNewLink(form: NgForm): void {
    if (this.loading()) {
      return;
    }
    if (form.invalid) {
      this.error.set('');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.authApi.requestEmailVerification(this.email.trim(), this.confirmationReturnTo).subscribe({
      next: () => this.show('link-requested'),
      error: (failure: unknown) => {
        this.loading.set(false);
        this.error.set(
          failure instanceof HttpErrorResponse && failure.status === TOO_MANY_REQUESTS
            ? $localize`:@@donor.login.reset.error.tooMany:Odeslali jste příliš mnoho žádostí. Zkuste to prosím za hodinu.`
            : describeProblem(
                failure,
                $localize`:@@donor.emailVerification.request.error.generic:Odkaz se nepodařilo odeslat. Zkuste to prosím znovu.`,
              ),
        );
      },
    });
  }

  retry(): void {
    if (this.token !== null) {
      this.panel.set('confirming');
      this.confirm(this.token);
    }
  }

  createPasskey(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.authApi
      .passkeyCreationOptions({})
      .pipe(
        switchMap((options) =>
          from(this.authenticator.create(options)).pipe(
            switchMap((credential) =>
              this.authApi.addPasskey(
                options.challenge,
                deviceName(this.document) ||
                  $localize`:@@donor.emailVerification.passkey.defaultName:Můj klíč`,
                credential,
              ),
            ),
          ),
        ),
      )
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.passkeyCreated.set(true);
          this.needsPasskey.set(false);
        },
        error: (failure: unknown) => {
          this.loading.set(false);
          this.error.set(
            failure instanceof PasskeyCeremonyError
              ? $localize`:@@donor.emailVerification.passkey.notCreated:Klíč se nevytvořil, zařízení ho nepotvrdilo. Zkuste to prosím znovu; jde to i později v části Údaje a zabezpečení.`
              : describeProblem(
                  failure,
                  $localize`:@@donor.emailVerification.passkey.error:Klíč se nepodařilo uložit. Zkuste to prosím znovu; jde to i později v části Údaje a zabezpečení.`,
                ),
          );
        },
      });
  }

  signIn(): void {
    this.loginDialog.open('login', { returnTo: this.destination });
  }

  enterPortal(): void {
    this.router.navigateByUrl(this.destination);
  }

  private confirm(token: string): void {
    this.auth.confirmEmail(token).subscribe({
      next: (donor) => {
        this.donorName.set(donor.name);
        this.needsPasskey.set(!donor.hasPassword);
        this.show('confirmed');
      },
      error: (failure: unknown) => {
        if (problemTypeEndsWith(failure, INVALID_TOKEN)) {
          this.show('invalid');
          return;
        }
        this.error.set(
          describeProblem(
            failure,
            $localize`:@@donor.emailVerification.error.generic:Spojení se serverem se nepodařilo. Zkuste to prosím znovu.`,
          ),
        );
        this.show('failed');
      },
    });
  }

  private show(panel: Panel): void {
    if (this.destroyRef.destroyed) {
      return;
    }
    this.loading.set(false);
    this.panel.set(panel);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }
}

function tokenOf(fragment: URLSearchParams): string | null {
  const token = fragment.get('token');
  return token === null || token === '' ? null : token;
}
