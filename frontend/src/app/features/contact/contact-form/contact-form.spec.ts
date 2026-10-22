import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ContactForm } from './contact-form';

describe('Given the contact form', () => {
  let fixture: ComponentFixture<ContactForm>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ContactForm);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function element<T extends HTMLElement>(selector: string): T {
    return fixture.nativeElement.querySelector(selector) as T;
  }

  async function fillIn(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function submit(): Promise<void> {
    element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function fillInValidMessage(): Promise<void> {
    await fillIn('#contact-name', 'Jana Nováková');
    await fillIn('#contact-email', 'jana@example.cz');
    await fillIn('#contact-message', 'Mám dotaz k projektu.');
  }

  it('when it is shown, then a line under the submit button says what the data is used for and links the privacy policy', () => {
    const note = element('.form-privacy');

    expect(element('.form-submit').nextElementSibling).toBe(note);
    expect(note.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Údaje z formuláře použijeme jen k vyřízení vaší zprávy, jak popisují zásady ochrany osobních údajů.',
    );
    const link = note.querySelector('a') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('zásady ochrany osobních údajů');
    expect(link.getAttribute('href')).toBe('/zasady-ochrany-osobnich-udaju');
  });

  it('when submitted with a name, an email and a message, then it posts them with an empty honeypot and shows the thank-you', async () => {
    await fillInValidMessage();

    await submit();

    const request = http.expectOne('/api/contact/messages');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      fullName: 'Jana Nováková',
      email: 'jana@example.cz',
      message: 'Mám dotaz k projektu.',
      website: '',
    });
    request.flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    expect(element('.form-success')).not.toBeNull();
    expect(element('form')).toBeNull();
  });

  it('when submitted with an empty required field, then nothing is sent and that field says what is missing', async () => {
    await fillIn('#contact-name', 'Jana Nováková');
    await fillIn('#contact-email', 'jana@example.cz');

    await submit();

    http.expectNone('/api/contact/messages');
    expect(element('form')).not.toBeNull();
    expect(element('#contact-message-error').textContent).toContain(
      'Napište nám prosím, s čím vám můžeme pomoct.',
    );
    expect(element('#contact-message').getAttribute('aria-invalid')).toBe('true');
    expect(element('#contact-name-error')).toBeNull();
  });

  it('when submitted with a malformed e-mail, then the e-mail field explains the expected form', async () => {
    await fillIn('#contact-name', 'Jana Nováková');
    await fillIn('#contact-email', 'jana@');
    await fillIn('#contact-message', 'Dobrý den');

    await submit();

    http.expectNone('/api/contact/messages');
    expect(element('#contact-email-error').textContent).toContain(
      'Zadejte e-mail ve tvaru jan@example.com.',
    );
  });

  it('when the server refuses with 429, then the form stays and explains the hourly limit', async () => {
    await fillInValidMessage();

    await submit();
    http
      .expectOne('/api/contact/messages')
      .flush(null, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();

    expect(element('form')).not.toBeNull();
    expect(element('.form-error').textContent).toContain('příliš mnoho zpráv');
  });

  it('when the server fails, then the form stays with a generic error and can be sent again', async () => {
    await fillInValidMessage();

    await submit();
    http
      .expectOne('/api/contact/messages')
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(element('.form-error').textContent).toContain('nepodařilo odeslat');
    expect(element<HTMLButtonElement>('.form-submit').disabled).toBe(false);
  });

  it('when a bot fills the hidden website field, then the value travels with the message', async () => {
    await fillInValidMessage();
    await fillIn('#contact-website', 'https://spam.example');

    await submit();

    const request = http.expectOne('/api/contact/messages');
    expect(request.request.body.website).toBe('https://spam.example');
    request.flush(null, { status: 202, statusText: 'Accepted' });
  });
});
