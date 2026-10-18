/// <reference types="@angular/localize" />

import { Location } from '@angular/common';
import { afterNextRender, Component, DestroyRef, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthApi } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { PASSWORD_MIN_LENGTH } from '../../../core/auth/donor';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';

type Panel = 'missing-link' | 'form' | 'success' | 'invalid';

const PAGE_PATH = '/obnova-hesla';
const INVALID_TOKEN = 'donors/invalid-password-reset-token';

@Component({
  selector: 'app-password-reset',
  imports: [FormsModule],
  templateUrl: './password-reset.html',
  styleUrl: './password-reset.scss',
})
export class PasswordReset {
  private readonly authApi = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(LoginDialogService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly token = tokenOf(inject(ActivatedRoute).snapshot.fragment);

  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  protected readonly panel = signal<Panel>(this.token === null ? 'missing-link' : 'form');
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected password = '';
  protected passwordConfirmation = '';

  constructor() {
    const location = inject(Location);
    location.replaceState(PAGE_PATH, '', location.getState());
  }

  submit(form: NgForm): void {
    if (this.loading() || this.token === null) {
      return;
    }
    if (form.invalid) {
      this.error.set($localize`:@@donor.login.error.fields:Vyplňte prosím správně všechna pole.`);
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

  requestNewLink(): void {
    this.dialog.open('reset');
  }

  signIn(): void {
    this.dialog.open('login');
  }

  private passwordChanged(): void {
    if (!this.auth.signedIn()) {
      this.show('success');
      return;
    }
    this.auth.logout().subscribe({ complete: () => this.show('success') });
  }

  private fail(failure: unknown): void {
    if (problemTypeEndsWith(failure, INVALID_TOKEN)) {
      this.show('invalid');
      return;
    }
    this.loading.set(false);
    this.error.set(
      describeProblem(failure, $localize`:@@donor.passwordReset.error.generic:Heslo se nepodařilo uložit. Zkuste to prosím znovu.`),
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
    this.panel.set(panel);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }
}

function tokenOf(fragment: string | null): string | null {
  const token = new URLSearchParams(fragment ?? '').get('token');
  return token === null || token === '' ? null : token;
}
