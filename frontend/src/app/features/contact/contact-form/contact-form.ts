import { Component, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';

interface ContactFormModel {
  name: string;
  email: string;
  message: string;
}

@Component({
  selector: 'app-contact-form',
  imports: [FormsModule],
  templateUrl: './contact-form.html',
  styleUrl: './contact-form.scss',
})
export class ContactForm {
  protected readonly sent = signal(false);
  protected model: ContactFormModel = { name: '', email: '', message: '' };

  submit(form: NgForm): void {
    if (form.invalid) {
      return;
    }
    this.sent.set(true);
  }

  reset(): void {
    this.model = { name: '', email: '', message: '' };
    this.sent.set(false);
  }
}
