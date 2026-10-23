/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Observable, switchMap } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthApi } from '../../../../core/auth/auth-api';
import { AuthStore } from '../../../../core/auth/auth-store';
import {
  Confirmation,
  ConnectedApp,
  PASSWORD_MIN_LENGTH,
  SecondFactorEnrolment,
} from '../../../../core/auth/donor';
import { PasskeyCeremonyError } from '../../../../core/auth/passkey-authenticator';
import { formatDonationDate } from '../../../donations/donation-date';
import { describeScopes } from '../../connect-app/oauth-scopes';
import { CopyButton } from '../../../../shared/ui/copy-button/copy-button';
import { FocusFirstInvalid } from '../../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../../shared/ui/form-field/form-control';
import { FormField } from '../../../../shared/ui/form-field/form-field';
import { PasswordReveal } from '../../../../shared/ui/password-reveal/password-reveal';
import { QrCode } from '../../../../shared/ui/qr-code/qr-code';

type Panel =
  'closed' | 'email' | 'password' | 'password-remove' | 'second-factor-on' | 'second-factor-off';

const UNAUTHENTICATED = 'auth/unauthenticated';
const SECRET_GROUP = 4;

@Component({
  selector: 'app-account-card',
  imports: [
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    PasswordReveal,
    CopyButton,
    QrCode,
  ],
  templateUrl: './account-card.html',
  styleUrl: './account-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountCard {
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly passkeyCount = input<number | null>(null);
  readonly sessionEnded = output<void>();

  private readonly emailButton = viewChild<ElementRef<HTMLButtonElement>>('emailButton');
  private readonly passwordButton = viewChild<ElementRef<HTMLButtonElement>>('passwordButton');
  private readonly removePasswordButton =
    viewChild<ElementRef<HTMLButtonElement>>('removePasswordButton');
  private readonly secondFactorButton =
    viewChild<ElementRef<HTMLButtonElement>>('secondFactorButton');
  private readonly firstField = viewChild<ElementRef<HTMLInputElement>>('firstField');
  private readonly codeField = viewChild<ElementRef<HTMLInputElement>>('codeField');

  protected readonly donor = this.auth.donor;
  protected readonly secondFactor = computed(
    () => this.donor()?.secondFactor ?? { enabled: false, neededForAdministration: false },
  );
  protected readonly hasPassword = computed(() => this.donor()?.hasPassword ?? true);
  protected readonly canRemovePassword = computed(
    () => this.hasPassword() && (this.passkeyCount() ?? 0) > 0,
  );
  protected readonly panel = signal<Panel>('closed');
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly linkSentTo = signal('');
  protected readonly passwordChanged = signal<'changed' | 'set' | 'removed' | null>(null);
  protected readonly secondFactorChanged = signal<'on' | 'off' | null>(null);
  protected readonly enrolment = signal<SecondFactorEnrolment | null>(null);
  protected readonly groupedSecret = computed(() => {
    const secret = this.enrolment()?.secret ?? '';
    return secret.match(new RegExp(`.{1,${SECRET_GROUP}}`, 'g'))?.join(' ') ?? '';
  });
  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly connections = signal<ConnectedApp[] | null>(null);
  protected readonly connectionsError = signal('');
  protected readonly disconnecting = signal<string | null>(null);
  protected readonly disconnected = signal('');

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
  protected readonly codeHint = $localize`:@@donor.account.secondFactor.codeHint:Šest číslic, které aplikace právě ukazuje.`;
  protected readonly codeMessages = {
    required: $localize`:@@donor.form.code.required:Opište prosím kód z aplikace.`,
    pattern: $localize`:@@donor.form.code.invalid:Kód má přesně šest číslic.`,
  };

  protected newEmail = '';
  protected password = '';
  protected currentPassword = '';
  protected newPassword = '';
  protected newPasswordConfirmation = '';
  protected code = '';

  constructor() {
    if (this.isAdmin()) {
      this.loadConnections();
    }
  }

  loadConnections(): void {
    this.connectionsError.set('');
    this.authApi.connections().subscribe({
      next: (list) => this.connections.set(list.items),
      error: (failure: unknown) => {
        if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
          this.sessionEnded.emit();
          return;
        }
        this.connectionsError.set(
          describeProblem(
            failure,
            $localize`:@@donor.account.connections.error.load:Připojené aplikace se nepodařilo načíst.`,
          ),
        );
      },
    });
  }

  disconnect(app: ConnectedApp): void {
    if (this.disconnecting() !== null) {
      return;
    }
    this.disconnecting.set(app.id);
    this.connectionsError.set('');
    this.disconnected.set('');
    this.authApi.disconnect(app.id).subscribe({
      next: () => {
        this.disconnecting.set(null);
        this.connections.update((apps) => (apps ?? []).filter((other) => other.id !== app.id));
        this.disconnected.set(app.client);
      },
      error: (failure: unknown) => {
        this.disconnecting.set(null);
        if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
          this.sessionEnded.emit();
          return;
        }
        this.connectionsError.set(
          describeProblem(
            failure,
            $localize`:@@donor.account.connections.error.disconnect:Aplikaci se nepodařilo odpojit. Zkuste to prosím znovu.`,
          ),
        );
      },
    });
  }

  protected scopeLabels(app: ConnectedApp): string[] {
    return describeScopes(app.scopes);
  }

  protected formatDate(isoInstant: string): string {
    return formatDonationDate(isoInstant);
  }

  open(panel: Exclude<Panel, 'closed'>): void {
    this.reset();
    this.panel.set(panel);
    afterNextRender(() => this.firstControl()?.focus(), { injector: this.injector });
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
    this.confirmed(this.password, (confirmation) =>
      this.auth.requestEmailChange({ newEmail, ...confirmation }),
    ).subscribe({
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
    const setting = !this.hasPassword();
    const newPassword = this.newPassword;
    this.start();
    this.confirmed(this.currentPassword, (confirmation) =>
      this.auth.changePassword({
        currentPassword: confirmation.password,
        passkey: confirmation.passkey,
        newPassword,
      }),
    ).subscribe({
      next: () => {
        this.saving.set(false);
        this.passwordChanged.set(setting ? 'set' : 'changed');
        this.close('password');
      },
      error: (failure: unknown) =>
        this.fail(
          failure,
          $localize`:@@donor.account.password.error.generic:Heslo se nepodařilo změnit. Zkuste to prosím znovu.`,
        ),
    });
  }

  removePassword(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }
    this.start();
    this.auth.removePassword({ password: this.password }).subscribe({
      next: () => {
        this.saving.set(false);
        this.passwordChanged.set('removed');
        this.close('password');
      },
      error: (failure: unknown) =>
        this.fail(
          failure,
          $localize`:@@donor.account.removePassword.error.generic:Heslo se nepodařilo odebrat. Zkuste to prosím znovu.`,
        ),
    });
  }

  startSecondFactor(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }
    this.start();
    this.confirmed(this.password, (confirmation) =>
      this.auth.setupSecondFactor(confirmation),
    ).subscribe({
      next: (enrolment) => {
        this.saving.set(false);
        this.password = '';
        this.enrolment.set(enrolment);
        afterNextRender(() => this.codeField()?.nativeElement.focus(), { injector: this.injector });
      },
      error: (failure: unknown) =>
        this.fail(
          failure,
          $localize`:@@donor.account.secondFactor.error.setup:Nastavení se nepodařilo začít. Zkuste to prosím znovu.`,
        ),
    });
  }

  confirmSecondFactor(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }
    this.start();
    this.auth.confirmSecondFactor(this.code.trim()).subscribe({
      next: () => {
        this.saving.set(false);
        this.secondFactorChanged.set('on');
        this.close('second-factor-on');
      },
      error: (failure: unknown) =>
        this.fail(
          failure,
          $localize`:@@donor.account.secondFactor.error.confirm:Kód se nepodařilo ověřit. Zkuste to prosím znovu.`,
        ),
    });
  }

  disableSecondFactor(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }
    this.start();
    const code = this.code.trim();
    this.confirmed(this.password, (confirmation) =>
      this.auth.disableSecondFactor({ ...confirmation, code }),
    ).subscribe({
      next: () => {
        this.saving.set(false);
        this.secondFactorChanged.set('off');
        this.close('second-factor-off');
      },
      error: (failure: unknown) =>
        this.fail(
          failure,
          $localize`:@@donor.account.secondFactor.error.disable:Dvoufaktorové ověření se nepodařilo vypnout. Zkuste to prosím znovu.`,
        ),
    });
  }

  private firstControl(): HTMLElement | null {
    return (
      this.firstField()?.nativeElement ??
      this.host.nativeElement.querySelector<HTMLElement>(
        '.account-form input, .account-form button[type="submit"]',
      )
    );
  }

  private confirmed<T>(
    password: string,
    change: (confirmation: Confirmation) => Observable<T>,
  ): Observable<T> {
    return this.auth.confirmWith(this.hasPassword() ? password : null).pipe(switchMap(change));
  }

  private start(): void {
    this.saving.set(true);
    this.error.set('');
    this.linkSentTo.set('');
    this.passwordChanged.set(null);
    this.secondFactorChanged.set(null);
  }

  private fail(failure: unknown, fallback: string): void {
    this.saving.set(false);
    if (failure instanceof PasskeyCeremonyError) {
      this.error.set(
        $localize`:@@donor.account.passkeyConfirmation.failed:Změnu se nepodařilo potvrdit přístupovým klíčem. Zkuste to prosím znovu a v okně zařízení zvolte klíč k tomuto účtu.`,
      );
      return;
    }
    if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
      this.sessionEnded.emit();
      return;
    }
    this.error.set(describeProblem(failure, fallback));
  }

  private reset(): void {
    this.error.set('');
    this.linkSentTo.set('');
    this.passwordChanged.set(null);
    this.secondFactorChanged.set(null);
    this.clearFields();
  }

  private close(panel: Panel): void {
    this.panel.set('closed');
    this.clearFields();
    afterNextRender(() => this.buttonFor(panel)?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  private clearFields(): void {
    this.newEmail = '';
    this.password = '';
    this.currentPassword = '';
    this.newPassword = '';
    this.newPasswordConfirmation = '';
    this.code = '';
    this.enrolment.set(null);
  }

  private buttonFor(panel: Panel): ElementRef<HTMLButtonElement> | undefined {
    switch (panel) {
      case 'email':
        return this.emailButton();
      case 'password':
        return this.passwordButton();
      case 'password-remove':
        return this.removePasswordButton();
      default:
        return this.secondFactorButton();
    }
  }
}
