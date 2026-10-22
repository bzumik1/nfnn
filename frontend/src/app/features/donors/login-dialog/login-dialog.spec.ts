import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogMode, LoginDialogService } from '../../../core/auth/login-dialog.service';
import {
  authResponse,
  problem,
  SAMPLE_CHALLENGE,
  secondFactorRequired,
} from '../../../core/auth/testing/donor-fixtures';
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

  describe('when it opens', () => {
    beforeEach(() => render());

    it('then it is a modal dialog with the sign-in tab pressed', () => {
      expect(element<HTMLDialogElement>('dialog').open).toBe(true);
      expect(element('.tab-switch button.is-active').getAttribute('aria-pressed')).toBe('true');
      expect(element('.tab-switch button:not(.is-active)').getAttribute('aria-pressed')).toBe(
        'false',
      );
    });

    it('and the browser closes it on Esc, then the dialog is closed', () => {
      element<HTMLDialogElement>('dialog').close();

      expect(dialog.isOpen()).toBe(false);
    });
  });

  describe('when a donor signs in', () => {
    beforeEach(() => render());

    it('with the right password, then the dialog closes and the donor portal opens', async () => {
      await fillIn('#login-email', 'jana@example.cz');
      await fillIn('#login-password', 'correct horse battery');

      await submit('.login-form');
      const request = http.expectOne('/api/donors/auth/login');
      expect(request.request.body).toEqual({
        email: 'jana@example.cz',
        password: 'correct horse battery',
      });
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
        .flush(
          problem(
            'auth/invalid-credentials',
            'Nesprávný e-mail nebo heslo',
            'Zkontrolujte prosím e-mail a heslo.',
          ),
          {
            status: 401,
            statusText: 'Unauthorized',
          },
        );
      await settle();

      expect(dialog.isOpen()).toBe(true);
      expect(element('.form-error').textContent).toContain('Nesprávný e-mail nebo heslo');
      expect(element<HTMLButtonElement>('.form-submit').disabled).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('too many times from one address, then the dialog asks to try again in a while', async () => {
      await fillIn('#login-email', 'jana@example.cz');
      await fillIn('#login-password', 'correct horse battery');

      await submit('.login-form');
      http
        .expectOne('/api/donors/auth/login')
        .flush(
          problem(
            'donors/rate-limited',
            'Příliš mnoho požadavků',
            'Zkuste to prosím znovu později.',
          ),
          {
            status: 429,
            statusText: 'Too Many Requests',
          },
        );
      await settle();

      expect(dialog.isOpen()).toBe(true);
      expect(element('.form-error').textContent).toContain(
        'Příliš mnoho pokusů z této adresy. Zkuste to prosím za chvíli znovu.',
      );
      expect(element<HTMLButtonElement>('.form-submit').disabled).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    describe('with the second factor on', () => {
      beforeEach(async () => {
        await fillIn('#login-email', 'jana@example.cz');
        await fillIn('#login-password', 'correct horse battery');
        await submit('.login-form');
        http
          .expectOne('/api/donors/auth/login')
          .flush(secondFactorRequired(), { status: 401, statusText: 'Unauthorized' });
        await settle();
      });

      it('then the dialog asks for the code from the app, focuses its field and shows no error', () => {
        expect(element('.login-form')).toBeNull();
        expect(element('.sub').textContent).toContain(
          'Přihlášení dokončíte kódem z ověřovací aplikace',
        );
        expect(element('#login-code').getAttribute('autocomplete')).toBe('one-time-code');
        expect(element('#login-code').getAttribute('inputmode')).toBe('numeric');
        expect(element('#login-code-hint').textContent).toContain('Šest číslic');
        expect(document.activeElement).toBe(element('#login-code'));
        expect(element('.form-error')).toBeNull();
        expect(dialog.isOpen()).toBe(true);
      });

      it('and the right code is sent, then the challenge and the code go together and the portal opens', async () => {
        await fillIn('#login-code', ' 287082 ');

        await submit('.code-form');
        const request = http.expectOne('/api/donors/auth/login/second-factor');
        expect(request.request.body).toEqual({ challenge: SAMPLE_CHALLENGE, code: '287082' });
        request.flush(authResponse('token-1'));
        await settle();

        expect(TestBed.inject(AuthStore).donor()?.name).toBe('Jana Nováková');
        expect(dialog.isOpen()).toBe(false);
        expect(navigate).toHaveBeenCalledWith('/donor/prehled');
      });

      it('and a five-digit code is sent, then nothing goes out and the field says the code has six digits', async () => {
        await fillIn('#login-code', '12345');

        await submit('.code-form');

        http.expectNone('/api/donors/auth/login/second-factor');
        expect(element('#login-code-error').textContent).toContain('Kód má přesně šest číslic.');
      });

      it('and a wrong code is sent, then the code step stays and shows the reason', async () => {
        await fillIn('#login-code', '000000');

        await submit('.code-form');
        http
          .expectOne('/api/donors/auth/login/second-factor')
          .flush(
            problem(
              'auth/invalid-second-factor-code',
              'Nesprávný kód',
              'Zadejte prosím aktuální kód z ověřovací aplikace; každý kód platí jen jednou.',
            ),
            { status: 401, statusText: 'Unauthorized' },
          );
        await settle();

        expect(element('#login-code')).not.toBeNull();
        expect(element('.form-error').textContent).toContain('Nesprávný kód.');
        expect(element<HTMLButtonElement>('.form-submit').disabled).toBe(false);
      });

      it('and the challenge has expired, then the dialog goes back to the password and says why', async () => {
        await fillIn('#login-code', '000000');

        await submit('.code-form');
        http
          .expectOne('/api/donors/auth/login/second-factor')
          .flush(
            problem(
              'auth/invalid-second-factor-challenge',
              'Přihlášení vypršelo',
              'Zadejte prosím znovu e-mail a heslo.',
            ),
            { status: 401, statusText: 'Unauthorized' },
          );
        await settle();

        expect(element('#login-code')).toBeNull();
        expect(element<HTMLInputElement>('#login-email').value).toBe('jana@example.cz');
        expect(element('.form-error').textContent).toContain(
          'Přihlášení vypršelo. Zadejte prosím znovu e-mail a heslo.',
        );
      });

      it('and goes back, then the password form is shown again without an error', async () => {
        await click('.foot .link-btn');

        expect(element('#login-code')).toBeNull();
        expect(element('#login-password')).not.toBeNull();
        expect(element('.form-error')).toBeNull();
        http.expectNone('/api/donors/auth/login/second-factor');
      });
    });

    it('before confirming the e-mail, then the dialog explains it and offers to send the link again', async () => {
      await fillIn('#login-email', ' jana@example.cz ');
      await fillIn('#login-password', 'correct horse battery');

      await submit('.login-form');
      http
        .expectOne('/api/donors/auth/login')
        .flush(
          problem(
            'auth/email-not-verified',
            'E-mail ještě není potvrzený',
            'Otevřete odkaz z e-mailu, který jsme vám poslali při registraci, nebo si nechte poslat nový.',
          ),
          { status: 401, statusText: 'Unauthorized' },
        );
      await settle();

      expect(element('.form-error').textContent).toContain('E-mail ještě není potvrzený');
      expect(element('.form-note .link-btn').textContent).toContain(
        'Poslat ověřovací e-mail znovu',
      );

      await click('.form-note .link-btn');
      const resend = http.expectOne('/api/donors/auth/email-verification/request');
      expect(resend.request.body).toEqual({ email: 'jana@example.cz' });
      resend.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(element('.form-status').getAttribute('role')).toBe('status');
      expect(element('.form-status').textContent).toContain('Ověřovací e-mail jsme poslali znovu.');
      expect(element('.form-note')).toBeNull();
      expect(element('.form-error')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('with a wrong password, then no resend button appears', async () => {
      await fillIn('#login-email', 'jana@example.cz');
      await fillIn('#login-password', 'wrong horse battery');

      await submit('.login-form');
      http
        .expectOne('/api/donors/auth/login')
        .flush(problem('auth/invalid-credentials', 'Nesprávný e-mail nebo heslo'), {
          status: 401,
          statusText: 'Unauthorized',
        });
      await settle();

      expect(element('.form-note')).toBeNull();
    });

    it('who wants to check the password, then the eye button shows it and the field keeps its label', async () => {
      await fillIn('#login-password', 'correct horse battery');

      await click('#login-password + .password-reveal');

      expect(element<HTMLInputElement>('#login-password').type).toBe('text');
      expect(element('label[for="login-password"]').textContent).toContain('Heslo');
    });

    it('with an empty field, then nothing is sent and the empty field says what is missing', async () => {
      await fillIn('#login-email', 'jana@example.cz');

      await submit('.login-form');

      http.expectNone('/api/donors/auth/login');
      expect(element('#login-password-error').textContent).toContain('Vyplňte prosím heslo.');
      expect(element('#login-email-error')).toBeNull();
      expect(element('.form-error')).toBeNull();
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

    it('as a person, then the registration is posted without a company identifier and the dialog asks to check the e-mail', async () => {
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
      request.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(dialog.isOpen()).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
      expect(TestBed.inject(AuthStore).signedIn()).toBe(false);
      expect(element('.reset-success h3').textContent).toContain('Zkontrolujte si e-mail');
      expect(element('.reset-success [role="status"]').textContent).toContain('jana@example.cz');
      expect(element('.register-form')).toBeNull();

      await click('.reset-success .form-submit');

      expect(element('.login-form')).not.toBeNull();
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
      request.flush(null, { status: 202, statusText: 'Accepted' });
    });

    it('as a company without the identification number, then nothing is sent', async () => {
      await click('.type-switch button:nth-child(2)');
      await fillInPerson();

      await submit('.register-form');

      http.expectNone('/api/donors/auth/register');
      expect(element('#register-company-identifier-error').textContent).toContain(
        'Vyplňte prosím IČO.',
      );
    });

    it('as a company with a seven-digit identification number, then the field says it has eight digits', async () => {
      await click('.type-switch button:nth-child(2)');
      await fillInPerson();
      await fillIn('#register-company-identifier', '1234567');

      await submit('.register-form');

      http.expectNone('/api/donors/auth/register');
      expect(element('#register-company-identifier-error').textContent).toContain(
        'IČO má osm číslic.',
      );
    });

    it('with a password shorter than 12 characters, then nothing is sent and the password field says why', async () => {
      await fillInPerson();
      await fillIn('#register-password', 'short');

      await submit('.register-form');

      http.expectNone('/api/donors/auth/register');
      expect(element('#register-password-error').textContent).toContain(
        'Heslo musí mít alespoň 12 znaků.',
      );
      expect(element('#register-password').getAttribute('aria-describedby')).toBe(
        'register-password-hint register-password-error',
      );
    });

    it('with a password the server refuses, then the dialog explains it', async () => {
      await fillInPerson();

      await submit('.register-form');
      http
        .expectOne('/api/donors/auth/register')
        .flush(
          problem(
            'donors/password-too-common',
            'Heslo je příliš běžné',
            'Zvolte prosím méně obvyklé heslo.',
          ),
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();

      expect(element('.form-error').textContent).toContain('Heslo je příliš běžné');
      expect(element('.form-error').textContent).toContain('Zvolte prosím méně obvyklé heslo.');
    });

    it('too many times from one address, then the dialog asks to try again in a while', async () => {
      await fillInPerson();

      await submit('.register-form');
      http
        .expectOne('/api/donors/auth/register')
        .flush(
          problem(
            'donors/rate-limited',
            'Příliš mnoho požadavků',
            'Zkuste to prosím znovu později.',
          ),
          {
            status: 429,
            statusText: 'Too Many Requests',
          },
        );
      await settle();

      expect(dialog.isOpen()).toBe(true);
      expect(element('.form-error').textContent).toContain(
        'Příliš mnoho pokusů z této adresy. Zkuste to prosím za chvíli znovu.',
      );
      expect(element<HTMLButtonElement>('.register-form .form-submit').disabled).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('and the server fails, then the dialog shows a generic error', async () => {
      await fillInPerson();

      await submit('.register-form');
      http
        .expectOne('/api/donors/auth/register')
        .flush(null, { status: 500, statusText: 'Server Error' });
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
      expect(element('.reset-success').textContent).toContain(
        'Pokud účet s touto adresou existuje',
      );
      expect(element('.reset-form')).toBeNull();
    });

    it('with a malformed address, then nothing is sent', async () => {
      await requestLink('jana-at-example');

      http.expectNone('/api/donors/auth/password-reset/request');
      expect(element('#reset-email-error').textContent).toContain(
        'Zadejte e-mail ve tvaru jana@example.cz.',
      );
    });

    it('too many times, then the dialog asks to wait an hour', async () => {
      await requestLink('jana@example.cz');
      http
        .expectOne('/api/donors/auth/password-reset/request')
        .flush(
          problem(
            'donors/rate-limited',
            'Příliš mnoho požadavků',
            'Zkuste to prosím znovu později.',
          ),
          {
            status: 429,
            statusText: 'Too Many Requests',
          },
        );
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

      expect(element('.form-error').textContent).toContain(
        'Neplatný požadavek. Zadejte platný e-mail.',
      );
    });

    it('and the server fails, then the dialog shows a generic error', async () => {
      await requestLink('jana@example.cz');
      http
        .expectOne('/api/donors/auth/password-reset/request')
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      await settle();

      expect(element('.form-error').textContent).toContain('Spojení se serverem se nepodařilo');
    });
  });
});
