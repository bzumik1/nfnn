/// <reference types="@angular/localize" />

import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
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
  private readonly injector = inject(Injector);
  private readonly successTitle = viewChild<ElementRef<HTMLElement>>('successTitle');
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('nameField');

  protected readonly sent = signal(false);
  protected readonly sentTo = signal('');
  protected readonly sending = signal(false);
  protected readonly failure = signal<Failure | null>(null);
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
        this.failure.set(classifyFailure(failure));
      },
    });
  }

  reset(): void {
    this.model = emptyMessage();
    this.failure.set(null);
    this.sent.set(false);
    this.focusAfterRender(() => this.nameField()?.nativeElement);
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
