/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { from, Observable, of, switchMap } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthApi } from '../../../../core/auth/auth-api';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Confirmation, Passkey } from '../../../../core/auth/donor';
import {
  PasskeyAuthenticator,
  PasskeyCeremonyError,
  PasskeyFailure,
} from '../../../../core/auth/passkey-authenticator';
import { deviceName } from '../../../../core/auth/device-name';
import { formatDonationDate } from '../../../donations/donation-date';
import { FocusFirstInvalid } from '../../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../../shared/ui/form-field/form-control';
import { FormField } from '../../../../shared/ui/form-field/form-field';
import { PasswordReveal } from '../../../../shared/ui/password-reveal/password-reveal';

const UNAUTHENTICATED = 'auth/unauthenticated';
const PASSKEY_NAME_MAX_LENGTH = 64;

@Component({
  selector: 'app-passkeys-card',
  imports: [FormsModule, FormField, FormControlDirective, FocusFirstInvalid, PasswordReveal],
  templateUrl: './passkeys-card.html',
  styleUrl: './passkeys-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasskeysCard {
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);
  private readonly authenticator = inject(PasskeyAuthenticator);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  readonly sessionEnded = output<void>();
  readonly countChanged = output<number>();

  private readonly addButton = viewChild<ElementRef<HTMLButtonElement>>('addButton');
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('nameField');

  protected readonly supported = this.authenticator.supported();
  protected readonly passkeys = signal<Passkey[] | null>(null);
  protected readonly hasPassword = computed(() => this.auth.donor()?.hasPassword ?? true);
  protected readonly confirmation = computed<'password' | 'passkey' | 'none'>(() => {
    if (this.hasPassword()) {
      return 'password';
    }
    return (this.passkeys()?.length ?? 0) > 0 ? 'passkey' : 'none';
  });
  protected readonly lastSignInMethod = computed(
    () => !this.hasPassword() && (this.passkeys()?.length ?? 0) <= 1,
  );
  protected readonly loadError = signal('');
  protected readonly adding = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly confirming = signal<string | null>(null);
  protected readonly removing = signal<string | null>(null);
  protected readonly status = signal('');
  protected readonly nameMaxLength = PASSKEY_NAME_MAX_LENGTH;

  protected readonly nameHint = $localize`:@@donor.passkeys.name.hint:Podle názvu klíč později poznáte, třeba „iPhone“ nebo „Pracovní notebook“.`;
  protected readonly nameMessages = {
    required: $localize`:@@donor.passkeys.name.required:Pojmenujte prosím klíč.`,
  };
  protected readonly passwordMessages = {
    required: $localize`:@@donor.passkeys.password.required:Zadejte prosím své heslo.`,
  };

  protected name = '';
  protected password = '';

  constructor() {
    this.load();
    effect(() => {
      const list = this.passkeys();
      if (list !== null) {
        this.countChanged.emit(list.length);
      }
    });
  }

  load(): void {
    this.loadError.set('');
    this.authApi.passkeys().subscribe({
      next: (list) => this.passkeys.set(list.items),
      error: (failure: unknown) => {
        if (this.sessionLost(failure)) {
          return;
        }
        this.loadError.set(
          describeProblem(
            failure,
            $localize`:@@donor.passkeys.error.load:Přístupové klíče se nepodařilo načíst.`,
          ),
        );
      },
    });
  }

  openForm(): void {
    this.status.set('');
    this.error.set('');
    this.confirming.set(null);
    this.name = deviceName(this.document);
    this.password = '';
    this.adding.set(true);
    afterNextRender(() => this.nameField()?.nativeElement.focus(), { injector: this.injector });
  }

  cancel(): void {
    this.closeForm();
  }

  add(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }
    const name = this.name.trim();
    this.saving.set(true);
    this.error.set('');
    this.confirm()
      .pipe(
        switchMap((confirmation) => this.authApi.passkeyCreationOptions(confirmation)),
        switchMap((options) =>
          from(this.authenticator.create(options)).pipe(
            switchMap((credential) => this.authApi.addPasskey(options.challenge, name, credential)),
          ),
        ),
      )
      .subscribe({
        next: (passkey) => {
          this.saving.set(false);
          this.passkeys.update((list) => [...(list ?? []), passkey]);
          this.status.set(
            $localize`:@@donor.passkeys.added:Přístupový klíč ${passkey.name}:name: je přidaný. Příště se jím můžete přihlásit bez hesla.`,
          );
          this.closeForm();
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          if (failure instanceof PasskeyCeremonyError) {
            this.error.set(ceremonyMessage(failure.reason));
            return;
          }
          if (this.sessionLost(failure)) {
            return;
          }
          this.error.set(
            describeProblem(
              failure,
              $localize`:@@donor.passkeys.error.add:Klíč se nepodařilo přidat. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  askToRemove(passkey: Passkey): void {
    this.status.set('');
    this.loadError.set('');
    this.confirming.set(passkey.id);
  }

  keep(): void {
    this.confirming.set(null);
  }

  remove(passkey: Passkey): void {
    if (this.removing() !== null) {
      return;
    }
    this.removing.set(passkey.id);
    this.authApi.removePasskey(passkey.id).subscribe({
      next: () => {
        this.removing.set(null);
        this.confirming.set(null);
        this.passkeys.update((list) => (list ?? []).filter((other) => other.id !== passkey.id));
        this.status.set(
          $localize`:@@donor.passkeys.removed:Přístupový klíč ${passkey.name}:name: je odebraný. Tímto klíčem se už nepřihlásíte; v zařízení ho můžete smazat.`,
        );
      },
      error: (failure: unknown) => {
        this.removing.set(null);
        if (this.sessionLost(failure)) {
          return;
        }
        this.loadError.set(
          describeProblem(
            failure,
            $localize`:@@donor.passkeys.error.remove:Klíč se nepodařilo odebrat. Zkuste to prosím znovu.`,
          ),
        );
      },
    });
  }

  protected formatDate(isoInstant: string): string {
    return formatDonationDate(isoInstant);
  }

  private closeForm(): void {
    this.adding.set(false);
    this.name = '';
    this.password = '';
    this.error.set('');
    afterNextRender(() => this.addButton()?.nativeElement.focus(), { injector: this.injector });
  }

  private sessionLost(failure: unknown): boolean {
    if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
      this.sessionEnded.emit();
      return true;
    }
    return false;
  }

  private confirm(): Observable<Confirmation> {
    switch (this.confirmation()) {
      case 'password':
        return of({ password: this.password });
      case 'passkey':
        return this.auth.confirmWith(null);
      default:
        return of({});
    }
  }
}

function ceremonyMessage(reason: PasskeyFailure): string {
  switch (reason) {
    case 'already-registered':
      return $localize`:@@donor.passkeys.error.alreadyRegistered:Toto zařízení už přístupový klíč k vašemu účtu má. Druhý není potřeba.`;
    case 'unsupported':
      return $localize`:@@donor.passkeys.error.unsupported:Tento prohlížeč přístupové klíče nepodporuje.`;
    case 'cancelled':
      return $localize`:@@donor.passkeys.error.cancelled:Klíč se nevytvořil, zařízení ho nepotvrdilo. Zkuste to prosím znovu.`;
    default:
      return $localize`:@@donor.passkeys.error.failed:Klíč se nevytvořil. Zkuste to prosím znovu, případně v jiném prohlížeči.`;
  }
}
