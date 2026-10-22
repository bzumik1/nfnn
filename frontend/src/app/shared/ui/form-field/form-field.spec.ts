import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { FocusFirstInvalid } from './focus-first-invalid';
import { FormControlDirective } from './form-control';
import { FormField } from './form-field';

@Component({
  imports: [FormsModule, FormField, FormControlDirective, FocusFirstInvalid],
  template: `
    <form #form="ngForm" appFocusFirstInvalid (ngSubmit)="submits = submits + 1" novalidate>
      <app-form-field label="Jméno" [messages]="{ required: 'Vyplňte prosím jméno.' }">
        <input appFormControl id="name" name="name" [(ngModel)]="name" required />
      </app-form-field>
      <app-form-field label="E-mail" hint="Pošleme na něj potvrzení." [messages]="emailMessages">
        <input
          appFormControl
          id="email"
          name="email"
          type="email"
          [(ngModel)]="email"
          required
          email
        />
      </app-form-field>
      <button type="submit">Odeslat</button>
    </form>
  `,
})
class TwoFieldForm {
  name = '';
  email = '';
  submits = 0;
  readonly emailMessages = {
    required: 'Vyplňte prosím e-mail.',
    email: 'Zadejte e-mail ve tvaru jan@example.cz.',
  };
}

describe('Given a form built from form fields', () => {
  let fixture: ComponentFixture<TwoFieldForm>;

  const host = () => fixture.nativeElement as HTMLElement;
  const input = (id: string) => host().querySelector<HTMLInputElement>(`#${id}`)!;
  const errorOf = (id: string) => host().querySelector(`#${id}-error`);

  async function type(id: string, value: string): Promise<void> {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function leave(id: string): Promise<void> {
    input(id).dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  async function submit(): Promise<void> {
    host().querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TwoFieldForm] }).compileComponents();
    fixture = TestBed.createComponent(TwoFieldForm);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  it('when it renders, then each label names its input and the hint describes it', () => {
    const label = host().querySelector<HTMLLabelElement>('label[for="email"]');

    expect(label?.textContent?.trim()).toBe('E-mail');
    expect(input('email').getAttribute('aria-describedby')).toBe('email-hint');
    expect(host().querySelector('#email-hint')?.textContent?.trim()).toBe(
      'Pošleme na něj potvrzení.',
    );
  });

  it('when nothing was touched yet, then no field shows an error', () => {
    expect(errorOf('name')).toBeNull();
    expect(input('name').getAttribute('aria-invalid')).toBeNull();
  });

  it('when the visitor leaves an invalid field, then its own message appears next to it', async () => {
    await type('email', 'jan@');
    await leave('email');

    expect(errorOf('email')?.textContent?.trim()).toBe('Zadejte e-mail ve tvaru jan@example.cz.');
    expect(input('email').getAttribute('aria-invalid')).toBe('true');
    expect(input('email').getAttribute('aria-describedby')).toBe('email-hint email-error');
    expect(errorOf('name')).toBeNull();
  });

  it('when the visitor fixes the field, then the message goes away', async () => {
    await type('email', 'jan@');
    await leave('email');

    await type('email', 'jan@example.cz');

    expect(errorOf('email')).toBeNull();
    expect(input('email').getAttribute('aria-invalid')).toBeNull();
  });

  it('when the form is sent with empty fields, then every field says what is missing and the first one takes the focus', async () => {
    await submit();

    expect(errorOf('name')?.textContent?.trim()).toBe('Vyplňte prosím jméno.');
    expect(errorOf('email')?.textContent?.trim()).toBe('Vyplňte prosím e-mail.');
    expect(document.activeElement).toBe(input('name'));
  });

  it('when only a later field is wrong, then that field takes the focus', async () => {
    await type('name', 'Jan');
    await type('email', 'jan');

    await submit();

    expect(errorOf('name')).toBeNull();
    expect(document.activeElement).toBe(input('email'));
  });
});
