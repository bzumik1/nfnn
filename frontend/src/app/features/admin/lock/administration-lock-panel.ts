/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { describeProblem } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { PasskeyAuthenticator } from '../../../core/auth/passkey-authenticator';
import { AccountUsername } from '../../../shared/ui/account-username/account-username';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FieldMessages, FormField } from '../../../shared/ui/form-field/form-field';
import { PasswordReveal } from '../../../shared/ui/password-reveal/password-reveal';
import { AdministrationLockService } from './administration-lock-service';

const PASSWORD_MESSAGES: FieldMessages = {
  required: $localize`:@@admin.lock.password.required:Zadejte prosím své heslo.`,
};

const CODE_MESSAGES: FieldMessages = {
  required: $localize`:@@donor.form.code.required:Opište prosím kód z aplikace.`,
  pattern: $localize`:@@donor.form.code.invalid:Kód má přesně šest číslic.`,
};

const UNLOCK_FAILED = $localize`:@@admin.lock.password.failed:Správu se nepodařilo odemknout. Zkuste to prosím znovu.`;

type View = 'locked' | 'password';

@Component({
  selector: 'app-administration-lock-panel',
  imports: [
    AccountUsername,
    FocusFirstInvalid,
    FormControlDirective,
    FormField,
    FormsModule,
    PasswordReveal,
  ],
  templateUrl: './administration-lock-panel.html',
  styleUrl: './administration-lock-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdministrationLockPanel {
  private readonly lock = inject(AdministrationLockService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly passwordField = viewChild<ElementRef<HTMLInputElement>>('passwordField');

  protected readonly passwordMessages = PASSWORD_MESSAGES;
  protected readonly codeMessages = CODE_MESSAGES;
  protected readonly view = signal<View>('locked');
  protected readonly online = signal(this.window?.navigator.onLine !== false);
  protected readonly passkeyUnlocks = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly email = computed(() => this.auth.donor()?.email ?? '');
  protected readonly passwordUnlocks = computed(() => {
    const donor = this.auth.donor();
    return donor !== null && donor.hasPassword && donor.secondFactor.enabled;
  });
  protected readonly nothingUnlocks = computed(
    () => !this.passkeyUnlocks() && !this.passwordUnlocks(),
  );

  protected password = '';
  protected code = '';

  constructor() {
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    const supported = inject(PasskeyAuthenticator).supported();
    if (supported) {
      void this.lock.passkeyUnlocks().then((unlocks) => this.passkeyUnlocks.set(unlocks));
    }
    const changed = () => this.online.set(this.window?.navigator.onLine !== false);
    this.window?.addEventListener('online', changed);
    this.window?.addEventListener('offline', changed);
    this.destroyRef.onDestroy(() => {
      this.window?.removeEventListener('online', changed);
      this.window?.removeEventListener('offline', changed);
    });
  }

  protected async withPasskey(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.error.set('');
    this.busy.set(true);
    const unlocked = await this.lock.unlockWithPasskey();
    this.busy.set(false);
    if (!unlocked) {
      this.error.set(
        $localize`:@@admin.lock.passkey.failed:Přístupový klíč správu neodemkl. Zkuste to znovu, nebo použijte heslo.`,
      );
    }
  }

  protected usePassword(): void {
    this.error.set('');
    this.view.set('password');
    afterNextRender(() => this.passwordField()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected back(): void {
    this.error.set('');
    this.password = '';
    this.code = '';
    this.view.set('locked');
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  protected submit(form: NgForm): void {
    if (this.busy() || form.invalid || !this.online()) {
      return;
    }
    this.error.set('');
    this.busy.set(true);
    this.lock
      .unlockWithPassword(this.password, this.code.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.password = '';
          this.code = '';
          this.busy.set(false);
        },
        error: (failure: unknown) => {
          this.busy.set(false);
          this.error.set(describeProblem(failure, UNLOCK_FAILED));
        },
      });
  }

  protected async signOut(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    await this.lock.signOut();
    this.busy.set(false);
  }
}
