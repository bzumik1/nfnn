/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthStore } from '../../../../core/auth/auth-store';
import { PASSWORD_MIN_LENGTH } from '../../../../core/auth/donor';
import { FocusFirstInvalid } from '../../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../../shared/ui/form-field/form-control';
import { FormField } from '../../../../shared/ui/form-field/form-field';
import { PasswordReveal } from '../../../../shared/ui/password-reveal/password-reveal';

type Panel = 'closed' | 'email' | 'password';

const UNAUTHENTICATED = 'auth/unauthenticated';

@Component({
  selector: 'app-account-card',
  imports: [FormsModule, FormField, FormControlDirective, FocusFirstInvalid, PasswordReveal],
  templateUrl: './account-card.html',
  styleUrl: './account-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountCard {
  private readonly auth = inject(AuthStore);
  private readonly injector = inject(Injector);

  readonly sessionEnded = output<void>();

  private readonly emailButton = viewChild<ElementRef<HTMLButtonElement>>('emailButton');
  private readonly passwordButton = viewChild<ElementRef<HTMLButtonElement>>('passwordButton');
  private readonly firstField = viewChild<ElementRef<HTMLInputElement>>('firstField');

  protected readonly donor = this.auth.donor;
  protected readonly panel = signal<Panel>('closed');
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly linkSentTo = signal('');
  protected readonly passwordChanged = signal(false);
  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;

  protected readonly newEmailMessages = {
    required: $localize`:@@donor.account.newEmail.required:Vyplňte prosím novou e-mailovou adresu.`,
    email: $localize`:@@donor.account.newEmail.invalid:Zadejte prosím platnou e-mailovou adresu.`,
  };
  protected readonly currentPasswordMessages = {
    required: $localize`:@@donor.account.currentPassword.required:Zadejte prosím své současné heslo.`,
  };
  protected readonly newPasswordHint = $localize`:@@donor.account.newPassword.hint:Alespoň 12 znaků. Klidně celá věta, která se vám dobře pamatuje.`;
  protected readonly newPasswordMessages = {
    required: $localize`:@@donor.form.newPassword.required:Zvolte si prosím heslo.`,
    minlength: $localize`:@@donor.form.newPassword.tooShort:Heslo musí mít alespoň 12 znaků.`,
  };
  protected readonly confirmationMessages = {
    required: $localize`:@@donor.account.newPasswordConfirm.required:Napište prosím nové heslo ještě jednou.`,
  };

  protected newEmail = '';
  protected password = '';
  protected currentPassword = '';
  protected newPassword = '';
  protected newPasswordConfirmation = '';

  open(panel: Exclude<Panel, 'closed'>): void {
    this.reset();
    this.panel.set(panel);
    afterNextRender(() => this.firstField()?.nativeElement.focus(), { injector: this.injector });
  }

  cancel(): void {
    this.close(this.panel());
  }

  requestEmailChange(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }
    const newEmail = this.newEmail.trim();
    this.start();
    this.auth.requestEmailChange({ newEmail, password: this.password }).subscribe({
      next: () => {
        this.saving.set(false);
        this.linkSentTo.set(newEmail);
        this.close('email');
      },
      error: (failure: unknown) =>
        this.fail(
          failure,
          $localize`:@@donor.account.email.error.generic:Odkaz se nepodařilo poslat. Zkuste to prosím znovu.`,
        ),
    });
  }

  changePassword(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }
    if (this.newPassword !== this.newPasswordConfirmation) {
      this.error.set($localize`:@@donor.account.password.mismatch:Nová hesla se neshodují.`);
      return;
    }
    this.start();
    this.auth
      .changePassword({ currentPassword: this.currentPassword, newPassword: this.newPassword })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.passwordChanged.set(true);
          this.close('password');
        },
        error: (failure: unknown) =>
          this.fail(
            failure,
            $localize`:@@donor.account.password.error.generic:Heslo se nepodařilo změnit. Zkuste to prosím znovu.`,
          ),
      });
  }

  private start(): void {
    this.saving.set(true);
    this.error.set('');
    this.linkSentTo.set('');
    this.passwordChanged.set(false);
  }

  private fail(failure: unknown, fallback: string): void {
    this.saving.set(false);
    if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
      this.sessionEnded.emit();
      return;
    }
    this.error.set(describeProblem(failure, fallback));
  }

  private reset(): void {
    this.error.set('');
    this.linkSentTo.set('');
    this.passwordChanged.set(false);
    this.newEmail = '';
    this.password = '';
    this.currentPassword = '';
    this.newPassword = '';
    this.newPasswordConfirmation = '';
  }

  private close(panel: Panel): void {
    this.panel.set('closed');
    this.newEmail = '';
    this.password = '';
    this.currentPassword = '';
    this.newPassword = '';
    this.newPasswordConfirmation = '';
    afterNextRender(
      () => (panel === 'email' ? this.emailButton() : this.passwordButton())?.nativeElement.focus(),
      { injector: this.injector },
    );
  }
}
