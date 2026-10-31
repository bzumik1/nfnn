/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { describeProblem } from '../../../../core/auth/api-problem';
import { AuthStore } from '../../../../core/auth/auth-store';
import {
  PasskeyAuthenticator,
  PasskeyCeremonyError,
} from '../../../../core/auth/passkey-authenticator';
import { Dialog } from '../../../../shared/ui/dialog/dialog';
import { FocusFirstInvalid } from '../../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../../shared/ui/form-field/form-control';
import { FieldMessages, FormField } from '../../../../shared/ui/form-field/form-field';
import {
  AdminApi,
  FreshSecondFactorRequest,
  ReceiptSigningKeyWithdrawalResponse,
} from '../../admin-api';

const CODE_MESSAGES: FieldMessages = {
  required: $localize`:@@donor.form.code.required:Opište prosím kód z aplikace.`,
  pattern: $localize`:@@donor.form.code.invalid:Kód má přesně šest číslic.`,
};

const WITHDRAWAL_FAILED = $localize`:@@admin.signingKey.withdraw.failed:Klíč se nepodařilo stáhnout. Zkuste to prosím znovu.`;

@Component({
  selector: 'app-key-withdrawal-dialog',
  imports: [Dialog, FormsModule, FormField, FormControlDirective, FocusFirstInvalid],
  templateUrl: './key-withdrawal-dialog.html',
  styleUrl: './key-withdrawal-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyWithdrawalDialog {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly codeField = viewChild<ElementRef<HTMLInputElement>>('codeField');

  readonly keyId = input.required<string>();
  readonly current = input.required<boolean>();
  readonly hasPasskey = input(false);
  readonly withdrawn = output<ReceiptSigningKeyWithdrawalResponse>();
  readonly dismissed = output<void>();

  protected readonly codeMessages = CODE_MESSAGES;
  protected readonly codeHint = $localize`:@@admin.signingKey.withdraw.codeHint:Počkejte, až aplikace ukáže nový kód (mění se každých 30 sekund), a opište ho.`;
  protected readonly passkeySupported = inject(PasskeyAuthenticator).supported();
  protected readonly usesCode = computed(() => this.auth.donor()?.secondFactor.enabled ?? false);
  private readonly codeChosen = signal(false);
  protected readonly asksCode = computed(
    () => this.usesCode() && !(this.passkeySupported && this.hasPasskey() && !this.codeChosen()),
  );
  protected readonly withdrawing = signal(false);
  protected readonly error = signal('');

  protected code = '';

  protected chooseCode(): void {
    this.error.set('');
    this.codeChosen.set(true);
    afterNextRender(() => this.codeField()?.nativeElement.focus(), { injector: this.injector });
  }

  protected submit(form: NgForm): void {
    if (this.withdrawing()) {
      return;
    }
    if (!this.asksCode()) {
      this.withPasskey();
      return;
    }
    if (form.invalid) {
      return;
    }
    this.send({ secondFactorCode: this.code.trim() });
  }

  protected withPasskey(): void {
    if (this.withdrawing()) {
      return;
    }
    this.error.set('');
    this.withdrawing.set(true);
    this.auth
      .confirmWith(null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (confirmation) => this.send({ passkey: confirmation.passkey }),
        error: (failure: unknown) => {
          this.withdrawing.set(false);
          this.error.set(
            failure instanceof PasskeyCeremonyError
              ? failure.reason === 'unsupported'
                ? $localize`:@@admin.signingKey.withdraw.passkeyUnsupported:Tento prohlížeč přístupové klíče nepodporuje. Klíč stáhněte v prohlížeči, ve kterém se klíčem přihlašujete.`
                : $localize`:@@admin.signingKey.withdraw.passkeyCancelled:Zařízení stažení nepotvrdilo. Zkuste to prosím znovu.`
              : describeProblem(failure, WITHDRAWAL_FAILED),
          );
        },
      });
  }

  protected dismiss(): void {
    if (!this.withdrawing()) {
      this.dismissed.emit();
    }
  }

  private send(proof: FreshSecondFactorRequest): void {
    this.withdrawing.set(true);
    this.error.set('');
    this.api
      .withdrawReceiptSigningKey(this.keyId(), proof)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.withdrawing.set(false);
          this.withdrawn.emit(response);
        },
        error: (failure: unknown) => {
          this.withdrawing.set(false);
          this.error.set(describeProblem(failure, WITHDRAWAL_FAILED));
          afterNextRender(
            () => {
              const field = this.codeField()?.nativeElement;
              field?.focus();
              field?.select();
            },
            { injector: this.injector },
          );
        },
      });
  }
}
