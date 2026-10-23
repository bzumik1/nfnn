/// <reference types="@angular/localize" />

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
import { ActivatedRoute } from '@angular/router';
import { from, switchMap } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthApi } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { deviceName } from '../../../core/auth/device-name';
import { PASSWORD_MIN_LENGTH } from '../../../core/auth/donor';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import {
  PasskeyAuthenticator,
  PasskeyCeremonyError,
} from '../../../core/auth/passkey-authenticator';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { PasswordReveal } from '../../../shared/ui/password-reveal/password-reveal';
import { RadioGroup } from '../../../shared/ui/radio-group/radio-group';

type Panel = 'missing-link' | 'form' | 'success' | 'passkey-success' | 'invalid';
type Method = 'password' | 'passkey';

const PAGE_PATH = '/obnova-hesla';
const INVALID_TOKEN = 'donors/invalid-password-reset-token';
const CODE_REQUIRED = 'donors/second-factor-code-required';
const PASSKEY_NAME_MAX_LENGTH = 64;

@Component({
  selector: 'app-password-reset',
  imports: [
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    PasswordReveal,
    RadioGroup,
  ],
  templateUrl: './password-reset.html',
  styleUrl: './password-reset.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordReset {
  private readonly authApi = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(LoginDialogService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authenticator = inject(PasskeyAuthenticator);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly codeField = viewChild<ElementRef<HTMLInputElement>>('codeField');
  private readonly token = tokenOf(inject(ActivatedRoute).snapshot.fragment);

  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  protected readonly passwordHint = $localize`:@@donor.passwordReset.form.hint:Alespoň 12 znaků. Klidně celá věta, která se vám dobře pamatuje.`;
  protected readonly passwordMessages = {
    required: $localize`:@@donor.form.newPassword.required:Zvolte si prosím heslo.`,
    minlength: $localize`:@@donor.form.newPassword.tooShort:Heslo musí mít alespoň 12 znaků.`,
  };
  protected readonly confirmationMessages = {
    required: $localize`:@@donor.passwordReset.form.passwordConfirm.required:Napište prosím nové heslo ještě jednou.`,
  };
  protected readonly nameMaxLength = PASSKEY_NAME_MAX_LENGTH;
  protected readonly nameHint = $localize`:@@donor.passkeys.name.hint:Podle názvu klíč později poznáte, třeba „iPhone“ nebo „Pracovní notebook“.`;
  protected readonly nameMessages = {
    required: $localize`:@@donor.passkeys.name.required:Pojmenujte prosím klíč.`,
  };
  protected readonly codeHint = $localize`:@@donor.passwordReset.passkey.codeHint:Účet má zapnuté dvoufaktorové ověření, opište proto šest číslic z ověřovací aplikace.`;
  protected readonly codeMessages = {
    required: $localize`:@@donor.form.code.required:Opište prosím kód z aplikace.`,
    pattern: $localize`:@@donor.form.code.invalid:Kód má přesně šest číslic.`,
  };
  protected readonly passkeysSupported = this.authenticator.supported();
  protected readonly method = signal<Method>('password');
  protected readonly codeNeeded = signal(false);
  protected readonly panel = signal<Panel>(this.token === null ? 'missing-link' : 'form');
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected password = '';
  protected passwordConfirmation = '';
  protected name = deviceName(inject(DOCUMENT));
  protected code = '';

  constructor() {
    const location = inject(Location);
    location.replaceState(PAGE_PATH, '', location.getState());
  }

  submit(form: NgForm): void {
    if (this.loading() || this.token === null) {
      return;
    }
    if (form.invalid) {
      this.error.set('');
      return;
    }
    if (this.password !== this.passwordConfirmation) {
      this.error.set($localize`:@@donor.passwordReset.form.mismatch:Hesla se neshodují.`);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.authApi.confirmPasswordReset(this.token, this.password).subscribe({
      next: () => this.passwordChanged(),
      error: (failure: unknown) => this.fail(failure),
    });
  }

  chooseMethod(method: Method): void {
    this.method.set(method);
    this.error.set('');
  }

  recoverWithPasskey(form: NgForm): void {
    const token = this.token;
    if (this.loading() || token === null) {
      return;
    }
    if (form.invalid) {
      this.error.set('');
      return;
    }
    const name = this.name.trim();
    this.loading.set(true);
    this.error.set('');
    this.authApi
      .passkeyRecoveryOptions(token, this.codeNeeded() ? this.code.trim() : null)
      .pipe(
        switchMap((options) =>
          from(this.authenticator.create(options)).pipe(
            switchMap((credential) =>
              this.authApi.recoverWithPasskey(token, options.challenge, name, credential),
            ),
          ),
        ),
      )
      .subscribe({
        next: () => this.signOutThenShow('passkey-success'),
        error: (failure: unknown) => this.failPasskey(failure),
      });
  }

  requestNewLink(): void {
    this.dialog.open('reset');
  }

  signIn(): void {
    this.dialog.open('login', { returnTo: '/darce/prehled' });
  }

  private passwordChanged(): void {
    this.signOutThenShow('success');
  }

  private signOutThenShow(panel: Panel): void {
    if (!this.auth.signedIn()) {
      this.show(panel);
      return;
    }
    this.auth.logout().subscribe({ complete: () => this.show(panel) });
  }

  private failPasskey(failure: unknown): void {
    this.loading.set(false);
    if (failure instanceof PasskeyCeremonyError) {
      this.error.set(
        $localize`:@@donor.passkeys.error.cancelled:Klíč se nevytvořil, zařízení ho nepotvrdilo. Zkuste to prosím znovu.`,
      );
      return;
    }
    if (problemTypeEndsWith(failure, INVALID_TOKEN)) {
      this.show('invalid');
      return;
    }
    if (problemTypeEndsWith(failure, CODE_REQUIRED)) {
      this.codeNeeded.set(true);
      afterNextRender(() => this.codeField()?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    this.error.set(
      describeProblem(
        failure,
        $localize`:@@donor.passwordReset.passkey.error:Klíč se nepodařilo uložit. Zkuste to prosím znovu.`,
      ),
    );
  }

  private fail(failure: unknown): void {
    if (problemTypeEndsWith(failure, INVALID_TOKEN)) {
      this.show('invalid');
      return;
    }
    this.loading.set(false);
    this.error.set(
      describeProblem(
        failure,
        $localize`:@@donor.passwordReset.error.generic:Heslo se nepodařilo uložit. Zkuste to prosím znovu.`,
      ),
    );
  }

  private show(panel: Panel): void {
    if (this.destroyRef.destroyed) {
      return;
    }
    this.loading.set(false);
    this.error.set('');
    this.password = '';
    this.passwordConfirmation = '';
    this.code = '';
    this.panel.set(panel);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }
}

function tokenOf(fragment: string | null): string | null {
  const token = new URLSearchParams(fragment ?? '').get('token');
  return token === null || token === '' ? null : token;
}
