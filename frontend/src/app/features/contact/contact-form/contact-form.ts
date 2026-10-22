/// <reference types="@angular/localize" />

import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { ContactApi, ContactMessageRequest } from '../contact-api';

const TOO_MANY_REQUESTS = 429;

@Component({
  selector: 'app-contact-form',
  imports: [FormsModule, RouterLink, FormField, FormControlDirective, FocusFirstInvalid],
  templateUrl: './contact-form.html',
  styleUrl: './contact-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactForm {
  private readonly api = inject(ContactApi);

  protected readonly sent = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal('');
  protected model: ContactMessageRequest = emptyMessage();

  protected readonly nameMessages = {
    required: $localize`:@@home.contact.form.name.required:Napište nám prosím své jméno.`,
  };
  protected readonly emailMessages = {
    required: $localize`:@@home.contact.form.email.required:Napište nám prosím e-mail, ať vám můžeme odpovědět.`,
    email: $localize`:@@home.contact.form.email.invalid:Zadejte e-mail ve tvaru jan@example.com.`,
  };
  protected readonly messageMessages = {
    required: $localize`:@@home.contact.form.message.required:Napište nám prosím, s čím vám můžeme pomoct.`,
  };

  submit(form: NgForm): void {
    if (form.invalid || this.sending()) {
      return;
    }
    this.sending.set(true);
    this.error.set('');
    this.api.submit({ ...this.model }).subscribe({
      next: () => {
        this.sending.set(false);
        this.sent.set(true);
      },
      error: (failure: unknown) => {
        this.sending.set(false);
        this.error.set(describeFailure(failure));
      },
    });
  }

  reset(): void {
    this.model = emptyMessage();
    this.error.set('');
    this.sent.set(false);
  }
}

function emptyMessage(): ContactMessageRequest {
  return { fullName: '', email: '', message: '', website: '' };
}

function describeFailure(failure: unknown): string {
  if (failure instanceof HttpErrorResponse && failure.status === TOO_MANY_REQUESTS) {
    return $localize`:@@home.contact.form.error.tooMany:Odeslali jste příliš mnoho zpráv. Zkuste to prosím za hodinu.`;
  }
  return $localize`:@@home.contact.form.error.generic:Zprávu se nepodařilo odeslat. Zkuste to prosím znovu, nebo nám napište e-mail.`;
}
