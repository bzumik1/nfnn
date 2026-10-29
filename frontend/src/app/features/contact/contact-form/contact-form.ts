/// <reference types="@angular/localize" />

import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { problemOf } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { Donor } from '../../../core/auth/donor';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { placeServerErrors } from '../../../shared/ui/form-field/server-errors';
import { ContactApi, ContactMessageRequest } from '../contact-api';

const TOO_MANY_REQUESTS = 429;
const MESSAGE_FIELDS: Readonly<Record<string, string>> = {
  fullName: 'fullName',
  email: 'email',
  message: 'message',
};

@Component({
  selector: 'app-contact-form',
  imports: [FormsModule, RouterLink, FormField, FormControlDirective, FocusFirstInvalid],
  templateUrl: './contact-form.html',
  styleUrl: './contact-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactForm {
  private readonly api = inject(ContactApi);
  private readonly auth = inject(AuthStore);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);
  private readonly successTitle = viewChild<ElementRef<HTMLElement>>('successTitle');
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('nameField');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly sent = signal(false);
  protected readonly sentTo = signal('');
  protected readonly sending = signal(false);
  protected readonly failure = signal<Failure | null>(null);
  protected model: ContactMessageRequest = emptyMessage();

  protected readonly nameMessages = {
    required: $localize`:@@home.contact.form.name.required:Napište nám prosím své jméno.`,
  };
  protected readonly emailHint = $localize`:@@home.contact.form.email.hint:Odpovíme vám na zadaný e-mail.`;
  private readonly emailInvalid = $localize`:@@home.contact.form.email.invalid:Zadejte e-mail ve tvaru jan@example.com.`;
  protected readonly emailMessages = {
    required: $localize`:@@home.contact.form.email.required:Napište nám prosím e-mail, ať vám můžeme odpovědět.`,
    email: this.emailInvalid,
    pattern: this.emailInvalid,
    server: this.emailInvalid,
  };
  protected readonly messageMessages = {
    required: $localize`:@@home.contact.form.message.required:Napište nám prosím, s čím vám můžeme pomoct.`,
  };

  constructor() {
    effect(() => {
      const donor = this.auth.donor();
      if (donor !== null) {
        this.fillInFrom(donor);
      }
    });
  }

  submit(form: NgForm): void {
    if (form.invalid || this.sending()) {
      return;
    }
    this.sending.set(true);
    this.failure.set(null);
    const message = { ...this.model };
    this.api.submit(message).subscribe({
      next: () => {
        this.sending.set(false);
        this.sentTo.set(message.email);
        this.sent.set(true);
        this.focusAfterRender(() => this.successTitle()?.nativeElement);
      },
      error: (failure: unknown) => {
        this.sending.set(false);
        const errors = problemOf(failure)?.errors ?? [];
        const unplaced = placeServerErrors(form, errors, MESSAGE_FIELDS);
        const placed = errors.length > 0 && unplaced.length === 0;
        this.failure.set(placed ? null : classifyFailure(failure));
        if (placed) {
          this.focusAfterRender(
            () =>
              this.host.querySelector<HTMLElement>('form .form-control.ng-invalid') ?? undefined,
          );
        }
      },
    });
  }

  reset(): void {
    this.model = emptyMessage();
    const donor = this.auth.donor();
    if (donor !== null) {
      this.fillInFrom(donor);
    }
    this.failure.set(null);
    this.sent.set(false);
    this.focusAfterRender(() => this.nameField()?.nativeElement);
  }

  private fillInFrom(donor: Donor): void {
    if (this.model.fullName.trim() === '' && donor.type === 'PERSON') {
      this.model.fullName = donor.name;
    }
    if (this.model.email.trim() === '') {
      this.model.email = donor.email;
    }
    this.changeDetector.markForCheck();
  }

  private focusAfterRender(target: () => HTMLElement | undefined): void {
    afterNextRender(() => target()?.focus(), { injector: this.injector });
  }
}

type Failure = 'tooMany' | 'generic';

function emptyMessage(): ContactMessageRequest {
  return { fullName: '', email: '', message: '', website: '' };
}

function classifyFailure(failure: unknown): Failure {
  return failure instanceof HttpErrorResponse && failure.status === TOO_MANY_REQUESTS
    ? 'tooMany'
    : 'generic';
}
