import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
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

  describe('when a message is sent', () => {
    beforeEach(async () => {
      document.body.appendChild(fixture.nativeElement);
      await fillInValidMessage();
      await submit();
      http.expectOne('/api/contact/messages').flush(null, { status: 202, statusText: 'Accepted' });
      fixture.detectChanges();
      await fixture.whenStable();
    });

    afterEach(() => fixture.nativeElement.remove());

    it('then the status region that was there before announces the thanks and where the reply goes', () => {
      const status = element('[role="status"]');

      expect(status.textContent?.replace(/\s+/g, ' ')).toContain(
        'Zpráva odeslána! Děkujeme za zprávu. Odpovíme vám e-mailem na jana@example.cz.',
      );
    });

    it('then the focus moves to the thank-you heading', () => {
      expect(document.activeElement).toBe(element('.form-success-title'));
    });

    it('and they choose to send another one, then an empty form returns with the focus in the name field', async () => {
      element<HTMLButtonElement>('.form-success-again').click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(element<HTMLInputElement>('#contact-name').value).toBe('');
      expect(document.activeElement).toBe(element('#contact-name'));
      expect(element('[role="status"]').textContent?.trim()).toBe('');
    });
  });

  it('when it is shown, then the name and e-mail fields carry no example values that could look filled in', () => {
    expect(element('#contact-name').hasAttribute('placeholder')).toBe(false);
    expect(element('#contact-email').hasAttribute('placeholder')).toBe(false);
  });

  it('when the message is on its way, then the button says the foundation is sending it', async () => {
    await fillInValidMessage();

    await submit();

    expect(element('.form-submit').textContent?.trim()).toBe('Odesíláme…');
    http.expectOne('/api/contact/messages').flush(null, { status: 202, statusText: 'Accepted' });
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

  it('when it is shown, then the e-mail field says the reply goes to that address', () => {
    expect(element('#contact-email-hint').textContent?.trim()).toBe(
      'Odpovíme vám na zadaný e-mail.',
    );
    expect(element('#contact-email').getAttribute('aria-describedby')).toContain(
      'contact-email-hint',
    );
  });

  it('when submitted with an e-mail without a dot in its domain, then nothing is sent and the e-mail field explains the expected form', async () => {
    await fillIn('#contact-name', 'Jana Nováková');
    await fillIn('#contact-email', 'jana@example');
    await fillIn('#contact-message', 'Dobrý den');

    await submit();

    http.expectNone('/api/contact/messages');
    expect(element('#contact-email-error').textContent).toContain(
      'Zadejte e-mail ve tvaru jan@example.com.',
    );
  });

  describe('when the server refuses the e-mail of a message', () => {
    beforeEach(async () => {
      document.body.appendChild(fixture.nativeElement);
      await fillInValidMessage();
      await submit();
      http.expectOne('/api/contact/messages').flush(
        {
          type: 'https://nfnn.cz/problems/validation',
          title: 'Neplatný požadavek',
          status: 400,
          errors: [{ field: 'email', message: 'musí odpovídat tvaru e-mailové adresy' }],
        },
        { status: 400, statusText: 'Bad Request' },
      );
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('then the e-mail field says what is wrong instead of a general failure', () => {
      expect(element('#contact-email-error').textContent).toContain(
        'Zadejte e-mail ve tvaru jan@example.com.',
      );
      expect(element('#contact-email').getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(element('#contact-email'));
      expect(element('.form-error')).toBeNull();
      expect(element<HTMLButtonElement>('.form-submit').disabled).toBe(false);
    });

    afterEach(() => fixture.nativeElement.remove());

    it('and the address is corrected, then the message goes out again', async () => {
      await fillIn('#contact-email', 'jana@example.cz');

      expect(element('#contact-email-error')).toBeNull();
      await submit();
      http.expectOne('/api/contact/messages').flush(null, { status: 202, statusText: 'Accepted' });
    });
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
    expect(element('.form-error a')?.getAttribute('href')).toBe('mailto:info@nfnn.cz');
  });

  it('when the server fails, then the form stays with a generic error and can be sent again', async () => {
    await fillInValidMessage();

    await submit();
    http
      .expectOne('/api/contact/messages')
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(element('.form-error').textContent).toContain('nepodařilo odeslat');
    expect(element('.form-error a')?.getAttribute('href')).toBe('mailto:info@nfnn.cz');
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

describe('Given the contact form seen by a signed-in donor', () => {
  let fixture: ComponentFixture<ContactForm>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ContactForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function signIn(type: 'PERSON' | 'COMPANY' = 'PERSON'): void {
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(
        authResponse(
          'token-1',
          sampleDonor(
            type === 'PERSON'
              ? {}
              : { type, name: 'Zahrady Beneš s.r.o.', email: 'ucetni@zahrady.cz' },
          ),
        ),
      );
  }

  async function show(): Promise<void> {
    fixture = TestBed.createComponent(ContactForm);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function value(selector: string): string {
    return (fixture.nativeElement.querySelector(selector) as HTMLInputElement).value;
  }

  it('when the form is shown, then their name and e-mail are already filled in and can be changed', async () => {
    signIn();
    await show();

    expect(value('#contact-name')).toBe('Jana Nováková');
    expect(value('#contact-email')).toBe('jana@example.cz');
    const name = fixture.nativeElement.querySelector('#contact-name') as HTMLInputElement;
    expect(name.readOnly).toBe(false);
    expect(value('#contact-message')).toBe('');
  });

  it('when the donor is a company, then only the e-mail is filled in, because the name asks for a person', async () => {
    signIn('COMPANY');
    await show();

    expect(value('#contact-name')).toBe('');
    expect(value('#contact-email')).toBe('ucetni@zahrady.cz');
  });

  it('when the session arrives after the form is shown, then the empty fields are filled in and a typed one stays', async () => {
    await show();
    const name = fixture.nativeElement.querySelector('#contact-name') as HTMLInputElement;
    name.value = 'Jana N.';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    signIn();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(value('#contact-name')).toBe('Jana N.');
    expect(value('#contact-email')).toBe('jana@example.cz');
  });

  it('when a message was sent and they write another, then their name and e-mail are filled in again', async () => {
    signIn();
    await show();
    const message = fixture.nativeElement.querySelector('#contact-message') as HTMLTextAreaElement;
    message.value = 'Dobrý den';
    message.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    http.expectOne('/api/contact/messages').flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    await fixture.whenStable();

    (fixture.nativeElement.querySelector('.form-success-again') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(value('#contact-name')).toBe('Jana Nováková');
    expect(value('#contact-email')).toBe('jana@example.cz');
    expect(value('#contact-message')).toBe('');
  });
});

describe('Given the contact section around the form', () => {
  let fixture: ComponentFixture<ContactForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ContactForm);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function text(element: Element | null): string {
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('when it is shown, then the e-mail stays beside the heading alone and the seat is never called Adresa', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(Array.from(root.querySelectorAll('.contact-info .info-label')).map(text)).toEqual([
      'E-mail',
    ]);
    expect(text(root)).not.toContain('Adresa');
  });

  it('when it is shown, then the details for accountants follow the form, each fact once', () => {
    const root = fixture.nativeElement as HTMLElement;
    const details = root.querySelector('app-accounting-details')!;

    expect(
      root.querySelector('.contact-form-wrap')!.compareDocumentPosition(details) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(text(root).split('27278794')).toHaveLength(2);
    expect(text(root).split('Jiráskova 436')).toHaveLength(2);
  });
});
