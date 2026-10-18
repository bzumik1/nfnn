import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogMode, LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, problem, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { LoginDialog } from './login-dialog';

describe('Given the sign-in dialog', () => {
  let fixture: ComponentFixture<LoginDialog>;
  let http: HttpTestingController;
  let dialog: LoginDialogService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginDialog],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    dialog = TestBed.inject(LoginDialogService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  async function render(mode: LoginDialogMode = 'login'): Promise<void> {
    dialog.open(mode);
    fixture = TestBed.createComponent(LoginDialog);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function element<T extends HTMLElement>(selector: string): T {
    return fixture.nativeElement.querySelector(selector) as T;
  }

  async function click(selector: string): Promise<void> {
    element<HTMLButtonElement>(selector).click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function fillIn(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function submit(selector: string): Promise<void> {
    element<HTMLFormElement>(selector).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  describe('when a donor signs in', () => {
    beforeEach(() => render());

    it('with the right password, then the dialog closes and the donor portal opens', async () => {
      await fillIn('#login-email', 'jana@example.cz');
      await fillIn('#login-password', 'correct horse battery');

      await submit('.login-form');
      const request = http.expectOne('/api/donors/auth/login');
      expect(request.request.body).toEqual({ email: 'jana@example.cz', password: 'correct horse battery' });
      request.flush(authResponse('token-1'));
      await settle();

      expect(TestBed.inject(AuthStore).donor()?.name).toBe('Jana Nováková');
      expect(dialog.isOpen()).toBe(false);
      expect(navigate).toHaveBeenCalledWith('/donor/prehled');
    });

    it('with a wrong password, then the dialog stays and shows the reason from the server', async () => {
      await fillIn('#login-email', 'jana@example.cz');
      await fillIn('#login-password', 'wrong horse battery');

      await submit('.login-form');
      http
        .expectOne('/api/donors/auth/login')
        .flush(problem('auth/invalid-credentials', 'Nesprávný e-mail nebo heslo', 'Zkontrolujte prosím e-mail a heslo.'), {
          status: 401,
          statusText: 'Unauthorized',
        });
      await settle();

      expect(dialog.isOpen()).toBe(true);
      expect(element('.form-error').textContent).toContain('Nesprávný e-mail nebo heslo');
      expect(element<HTMLButtonElement>('.form-submit').disabled).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('with an empty field, then nothing is sent', async () => {
      await fillIn('#login-email', 'jana@example.cz');

      await submit('.login-form');

      http.expectNone('/api/donors/auth/login');
      expect(element('.form-error').textContent).toContain('Vyplňte');
    });
  });

  describe('when a visitor registers', () => {
    beforeEach(async () => {
      await render();
      await click('.tab-switch button:nth-child(2)');
    });

    async function fillInPerson(): Promise<void> {
      await fillIn('#register-name', 'Jana Nováková');
      await fillIn('#register-street', 'Dlouhá 12');
      await fillIn('#register-city', 'Ústí nad Labem');
      await fillIn('#register-postal-code', '400 01');
      await fillIn('#register-email', 'jana@example.cz');
      await fillIn('#register-password', 'correct horse battery');
    }

    it('as a person, then the registration is posted without a company identifier and the portal opens', async () => {
      await fillInPerson();

      await submit('.register-form');
      const request = http.expectOne('/api/donors/auth/register');
      expect(request.request.body).toEqual({
        type: 'PERSON',
        name: 'Jana Nováková',
        companyIdentifier: null,
        address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
        email: 'jana@example.cz',
        password: 'correct horse battery',
        preferredLocale: 'cs',
      });
      request.flush(authResponse('token-1'), { status: 201, statusText: 'Created' });
      await settle();

      expect(dialog.isOpen()).toBe(false);
      expect(navigate).toHaveBeenCalledWith('/donor/prehled');
    });

    it('as a company, then the identification number travels with the registration', async () => {
      await click('.type-switch button:nth-child(2)');
      await fillIn('#register-name', 'Stavby Novák s.r.o.');
      await fillIn('#register-company-identifier', '452 746 49');
      await fillIn('#register-street', 'Průmyslová 5');
      await fillIn('#register-city', 'Teplice');
      await fillIn('#register-postal-code', '415 01');
      await fillIn('#register-email', 'ucetni@stavby.cz');
      await fillIn('#register-password', 'correct horse battery');

      await submit('.register-form');
      const request = http.expectOne('/api/donors/auth/register');
      expect(request.request.body.type).toBe('COMPANY');
      expect(request.request.body.name).toBe('Stavby Novák s.r.o.');
      expect(request.request.body.companyIdentifier).toBe('45274649');
      request.flush(authResponse('token-1', sampleDonor({ type: 'COMPANY' })), { status: 201, statusText: 'Created' });
    });

    it('as a company without the identification number, then nothing is sent', async () => {
      await click('.type-switch button:nth-child(2)');
      await fillInPerson();

      await submit('.register-form');

      http.expectNone('/api/donors/auth/register');
      expect(element('.form-error').textContent).toContain('Vyplňte');
    });

    it('with a password shorter than 12 characters, then nothing is sent', async () => {
      await fillInPerson();
      await fillIn('#register-password', 'short');

      await submit('.register-form');

      http.expectNone('/api/donors/auth/register');
    });

    it('with an email that already has an account, then the dialog explains it', async () => {
      await fillInPerson();

      await submit('.register-form');
      http
        .expectOne('/api/donors/auth/register')
        .flush(
          problem('donors/email-already-registered', 'Účet s tímto e-mailem už existuje', 'Přihlaste se, nebo použijte obnovu hesla.'),
          { status: 409, statusText: 'Conflict' },
        );
      await settle();

      expect(element('.form-error').textContent).toContain('Účet s tímto e-mailem už existuje');
      expect(element('.form-error').textContent).toContain('Přihlaste se');
    });

    it('and the server fails, then the dialog shows a generic error', async () => {
      await fillInPerson();

      await submit('.register-form');
      http.expectOne('/api/donors/auth/register').flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(element('.form-error').textContent).toContain('nepodařilo');
    });
  });

  describe('when a donor asks for a password reset link', () => {
    beforeEach(() => render('reset'));

    async function requestLink(email: string): Promise<void> {
      await fillIn('#reset-email', email);
      await submit('.reset-form');
    }

    it('opened on the reset tab, then the reset form is shown straight away', () => {
      expect(element('.reset-title').textContent).toContain('Obnovení hesla');
      expect(element('#reset-email')).not.toBeNull();
    });

    it('from the sign-in tab, then the link switches to the reset form', async () => {
      await click('.reset-back');
      await click('.foot .link-btn');

      expect(element('.reset-form')).not.toBeNull();
    });

    it('with a valid address, then the trimmed address is sent and the sent panel replaces the form', async () => {
      await requestLink('  jana@example.cz ');

      expect(element<HTMLButtonElement>('.reset-form .form-submit').disabled).toBe(true);
      const request = http.expectOne('/api/donors/auth/password-reset/request');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ email: 'jana@example.cz' });
      request.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(element('.reset-success h3').textContent).toContain('E-mail odeslán!');
      expect(element('.reset-success').textContent).toContain('Pokud účet s touto adresou existuje');
      expect(element('.reset-form')).toBeNull();
    });

    it('with a malformed address, then nothing is sent', async () => {
      await requestLink('jana-at-example');

      http.expectNone('/api/donors/auth/password-reset/request');
      expect(element('.form-error').textContent).toContain('Vyplňte');
    });

    it('too many times, then the dialog asks to wait an hour', async () => {
      await requestLink('jana@example.cz');
      http
        .expectOne('/api/donors/auth/password-reset/request')
        .flush(problem('donors/rate-limited', 'Příliš mnoho požadavků', 'Zkuste to prosím znovu později.'), {
          status: 429,
          statusText: 'Too Many Requests',
        });
      await settle();

      expect(element('.form-error').textContent).toContain(
        'Odeslali jste příliš mnoho žádostí. Zkuste to prosím za hodinu.',
      );
      expect(element('.reset-success')).toBeNull();
      expect(element<HTMLButtonElement>('.reset-form .form-submit').disabled).toBe(false);
    });

    it('and the server refuses the address, then the problem is shown', async () => {
      await requestLink('jana@example.cz');
      http.expectOne('/api/donors/auth/password-reset/request').flush(
        {
          ...problem('validation', 'Neplatný požadavek'),
          errors: [{ field: 'email', message: 'Zadejte platný e-mail.' }],
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      expect(element('.form-error').textContent).toContain('Neplatný požadavek. Zadejte platný e-mail.');
    });

    it('and the server fails, then the dialog shows a generic error', async () => {
      await requestLink('jana@example.cz');
      http.expectOne('/api/donors/auth/password-reset/request').flush(null, { status: 502, statusText: 'Bad Gateway' });
      await settle();

      expect(element('.form-error').textContent).toContain('Spojení se serverem se nepodařilo');
    });
  });
});
