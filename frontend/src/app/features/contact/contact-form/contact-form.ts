/// <reference types="@angular/localize" />

import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ContactApi, ContactMessageRequest } from '../contact-api';

const TOO_MANY_REQUESTS = 429;

@Component({
  selector: 'app-contact-form',
  imports: [FormsModule],
  templateUrl: './contact-form.html',
  styleUrl: './contact-form.scss',
})
export class ContactForm {
  private readonly api = inject(ContactApi);

  protected readonly sent = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal('');
  protected model: ContactMessageRequest = emptyMessage();

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
