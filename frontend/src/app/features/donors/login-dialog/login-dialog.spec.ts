import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { SecondFactorRecovery } from '../../../core/auth/donor';
import {
  LoginDialogMode,
  LoginDialogOptions,
  LoginDialogService,
} from '../../../core/auth/login-dialog.service';
import { PasskeyAuthenticator } from '../../../core/auth/passkey-authenticator';
import {
  authResponse,
  FakePasskeyAuthenticator,
  passkeySignInOptions,
  problem,
  SAMPLE_CHALLENGE,
  secondFactorRequired,
} from '../../../core/auth/testing/donor-fixtures';
import { DialogHistory } from '../../../shared/ui/dialog/dialog-history';
import { checkerboard } from '../../../shared/ui/qr-code/testing/qr-matrices';
import { FakeDialogHistory } from '../../../shared/ui/dialog/testing/fake-dialog-history';
import { LoginDialog } from './login-dialog';

describe('Given the sign-in dialog', () => {
  let fixture: ComponentFixture<LoginDialog>;
  let http: HttpTestingController;
  let dialog: LoginDialogService;
  let navigate: ReturnType<typeof vi.spyOn>;
  let passkeys: FakePasskeyAuthenticator;
  let history: FakeDialogHistory;

  beforeEach(async () => {
    localStorage.clear();
    passkeys = new FakePasskeyAuthenticator();
    history = new FakeDialogHistory();
    await TestBed.configureTestingModule({
      imports: [LoginDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PasskeyAuthenticator, useValue: passkeys },
        { provide: DialogHistory, useValue: history },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    dialog = TestBed.inject(LoginDialogService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  async function render(
    mode: LoginDialogMode = 'login',
    options: LoginDialogOptions = {},
  ): Promise<void> {
    dialog.open(mode, options);
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

    it('then the tabs are named as places and differ from the buttons that send', () => {
      expect(
        [...fixture.nativeElement.querySelectorAll('.tab-switch button')].map((tab) =>
          (tab as HTMLElement).textContent?.trim(),
        ),
      ).toEqual(['Přihlášení', 'Registrace']);
      expect(element('.login-form button[type="submit"]').textContent?.trim()).toBe('Přihlásit se');
    });

    it('then the forgotten password link stands right under the password field', () => {
      const field = element('#login-password').closest('app-form-field') as HTMLElement;

      expect(field.nextElementSibling?.querySelector('.forgot-link')?.textContent?.trim()).toBe(
        'Zapomněli jste heslo?',
      );
    });

    it('and the browser closes it on Esc, then the dialog is closed', () => {
      element<HTMLDialogElement>('dialog').close();

      expect(dialog.isOpen()).toBe(false);
    });
  });

  it('when it opens on the registration with an address, then that address is filled in', async () => {
    await render('register', { email: 'spravce@nfnn.cz' });

    expect(element<HTMLInputElement>('#register-email').value).toBe('spravce@nfnn.cz');
  });

  describe('when a donor signs in', () => {
    beforeEach(() => render());

    it('with the right password, then the dialog closes and the page stays', async () => {
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
      expect(navigate).not.toHaveBeenCalled();
    });

    it('with the right password in a dialog opened for a protected page, then the dialog closes and that page opens', async () => {
      dialog.close();
      await render('login', { returnTo: '/sprava/platby' });
      await fillIn('#login-email', 'jana@example.cz');
      await fillIn('#login-password', 'correct horse battery');

      await submit('.login-form');
      http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
      await settle();

      expect(TestBed.inject(AuthStore).signedIn()).toBe(true);
      expect(dialog.isOpen()).toBe(false);
      expect(navigate).toHaveBeenCalledWith('/sprava/platby');
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
      expect(element('.ui-field-error').textContent).toContain('Nesprávný e-mail nebo heslo');
      expect(element<HTMLButtonElement>('.ui-button--primary').disabled).toBe(false);
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
      expect(element('.ui-field-error').textContent).toContain(
        'Příliš mnoho pokusů z této adresy. Zkuste to prosím za chvíli znovu.',
      );
      expect(element<HTMLButtonElement>('.ui-button--primary').disabled).toBe(false);
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
        expect(element('.step-lead').textContent).toContain(
          'Přihlášení dokončíte kódem z ověřovací aplikace',
        );
        expect(element('#login-code').getAttribute('autocomplete')).toBe('one-time-code');
        expect(element('#login-code').getAttribute('inputmode')).toBe('numeric');
        expect(element('#login-code-hint').textContent).toContain('Šest číslic');
        expect(document.activeElement).toBe(element('#login-code'));
        expect(element('.ui-field-error')).toBeNull();
        expect(dialog.isOpen()).toBe(true);
      });

      it('then the step has a visible title, the way back on top and no tabs', () => {
        expect(element('.step-title').textContent).toContain('Ověření kódem z aplikace');
        expect(element('.code-back').textContent).toContain('Zpět na heslo');
        expect(element('.code-back').compareDocumentPosition(element('.step-title'))).toBe(
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
        expect(element('.tab-switch')).toBeNull();
        expect(element('.foot')).toBeNull();
      });

      it('and the right code is sent, then the challenge and the code go together and the page stays', async () => {
        await fillIn('#login-code', ' 287082 ');

        await submit('.code-form');
        const request = http.expectOne('/api/donors/auth/login/second-factor');
        expect(request.request.body).toEqual({ challenge: SAMPLE_CHALLENGE, code: '287082' });
        request.flush(authResponse('token-1'));
        await settle();

        expect(TestBed.inject(AuthStore).donor()?.name).toBe('Jana Nováková');
        expect(dialog.isOpen()).toBe(false);
        expect(navigate).not.toHaveBeenCalled();
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
        expect(element('.ui-field-error').textContent).toContain('Nesprávný kód.');
        expect(element<HTMLButtonElement>('.ui-button--primary').disabled).toBe(false);
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
        expect(element('.ui-field-error').textContent).toContain(
          'Přihlášení vypršelo. Zadejte prosím znovu e-mail a heslo.',
        );
      });

      it('then the code step has a history entry of its own', () => {
        expect(history.steps).toEqual([0, 1]);
      });

      it('and the browser goes back, then the password form returns with the focus and the dialog stays', async () => {
        history.listener?.stepBack();
        await settle();

        expect(element('#login-code')).toBeNull();
        expect(element('#login-password')).not.toBeNull();
        expect(document.activeElement).toBe(element('#login-email'));
        expect(history.steps.at(-1)).toBe(0);
        expect(dialog.isOpen()).toBe(true);
      });

      it('and goes back, then the password form is shown again without an error and with the focus', async () => {
        await click('.code-back');

        expect(element('#login-code')).toBeNull();
        expect(element('#login-password')).not.toBeNull();
        expect(element('.ui-field-error')).toBeNull();
        expect(element('.tab-switch')).not.toBeNull();
        expect(document.activeElement).toBe(element('#login-email'));
        http.expectNone('/api/donors/auth/login/second-factor');
      });

      describe('and asks to recover access by payment', () => {
        const instructions: SecondFactorRecovery = {
          message: 'OBNOVA K7MP4RXA',
          startedAt: '2026-10-17T10:00:00Z',
          expiresAt: '2026-10-31T10:00:00Z',
          resumed: false,
          accountNumber: '5544332217/2010',
          iban: 'CZ2620100000005544332217',
          amountMinor: 100,
          currency: 'CZK',
          usableFrom: '2026-10-27',
          spayd: 'SPD*1.0*ACC:CZ2620100000005544332217*AM:1.00*CC:CZK*MSG:OBNOVA K7MP4RXA',
          qrCode: checkerboard(25),
        };

        async function askForRecovery(): Promise<ReturnType<HttpTestingController['expectOne']>> {
          await click('.recovery-start');
          return http.expectOne('/api/donors/auth/login/second-factor/recovery');
        }

        it('then the challenge goes out and the dialog names the account, 1 Kč and the message to copy, from when and until when', async () => {
          const request = await askForRecovery();
          expect(request.request.body).toEqual({ challenge: SAMPLE_CHALLENGE });
          request.flush(instructions);
          await settle();

          const recovery = element('.recovery');
          expect(element('.code-form')).toBeNull();
          expect(recovery.textContent).toContain('5544332217/2010');
          expect(recovery.textContent).toContain('1\u00a0Kč');
          expect(recovery.textContent).toContain('OBNOVA K7MP4RXA');
          expect(recovery.textContent).toContain('Platbu pošlete nejdříve 27. 10. 2026');
          expect(recovery.textContent).toContain('Zpráva pro příjemce platí do 31. 10. 2026 11:00');
          expect(
            [...recovery.querySelectorAll('app-copy-button button')].map((button) =>
              button.textContent?.replace(/\s+/g, ' ').trim(),
            ),
          ).toEqual(['Kopírovat číslo účtu', 'Kopírovat zprávu pro příjemce']);
          expect(document.activeElement).toBe(element('.recovery-title'));
        });

        it('then the earliest day comes before the payment details and a note says a new request shows the same details', async () => {
          (await askForRecovery()).flush(instructions);
          await settle();

          const callout = element('.recovery .ui-callout');
          expect(callout.textContent).toContain('nejdříve');
          expect(callout.compareDocumentPosition(element('.recovery-details'))).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
          );
          expect(element('.recovery-keep').textContent).toContain(
            'Když obnovu zahájíte znovu, než zpráva přestane platit, ukážeme vám stejné údaje.',
          );
          expect(element('.recovery-resumed')).toBeNull();
          expect(element('.tab-switch')).toBeNull();
          expect(
            element('.recovery-back').compareDocumentPosition(element('.recovery-title')),
          ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        });

        it('then a payment QR code with the same payment stands after the details', async () => {
          (await askForRecovery()).flush(instructions);
          await settle();

          const qr = element('.recovery-qr svg[role="img"]');
          expect(qr.getAttribute('aria-label')).toBe(
            'QR platba 1 Kč se zprávou pro obnovu přístupu',
          );
          expect(element('.recovery-details').compareDocumentPosition(qr)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
          );
        });

        it('again while the earlier recovery is open, then the dialog says when it started and asks to pay with that message', async () => {
          (await askForRecovery()).flush({ ...instructions, resumed: true });
          await settle();

          expect(element('.recovery-resumed').textContent?.replace(/\s+/g, ' ').trim()).toBe(
            'Tuto obnovu už jste zahájili 17. 10. 2026 12:00. Pošlete platbu s tímto kódem.',
          );
          expect(
            element('.recovery-resumed').compareDocumentPosition(element('.recovery-details')),
          ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
          expect(element('.recovery').textContent).toContain('OBNOVA K7MP4RXA');
        });

        it('from an account usable today, then no later date is named', async () => {
          (await askForRecovery()).flush({ ...instructions, usableFrom: null });
          await settle();

          expect(element('.recovery').textContent).not.toContain('nejdříve');
        });

        it('without a verified bank account, then the code step stays and says why', async () => {
          (await askForRecovery()).flush(
            {
              ...problem(
                'donors/second-factor-recovery-unavailable',
                'Obnova platbou není možná',
                'Platbou 1 Kč lze ověření vypnout jen z účtu, ze kterého jste nám už přispěli.',
              ),
              status: 409,
            },
            { status: 409, statusText: 'Conflict' },
          );
          await settle();

          expect(element('.recovery')).toBeNull();
          expect(element('#login-code')).not.toBeNull();
          expect(element('[role="alert"]').textContent).toContain('Obnova platbou není možná.');
        });

        it('after the sign-in expired, then the dialog goes back to the password and says why', async () => {
          (await askForRecovery()).flush(
            problem(
              'auth/invalid-second-factor-challenge',
              'Přihlášení vypršelo',
              'Zadejte prosím znovu e-mail a heslo.',
            ),
            { status: 401, statusText: 'Unauthorized' },
          );
          await settle();

          expect(element('#login-code')).toBeNull();
          expect(element('#login-password')).not.toBeNull();
          expect(element('.ui-field-error').textContent).toContain('Přihlášení vypršelo.');
        });

        it('too many times from one address, then the dialog asks to try again in a while', async () => {
          (await askForRecovery()).flush(problem('rate-limited', 'Příliš mnoho pokusů'), {
            status: 429,
            statusText: 'Too Many Requests',
          });
          await settle();

          expect(element('[role="alert"]').textContent).toContain(
            'Příliš mnoho pokusů z této adresy.',
          );
        });

        it('and the browser goes back, then the code step returns with the focus and its entry stays', async () => {
          (await askForRecovery()).flush(instructions);
          await settle();
          expect(history.steps.at(-1)).toBe(2);

          history.listener?.stepBack();
          await settle();

          expect(element('.recovery')).toBeNull();
          expect(document.activeElement).toBe(element('#login-code'));
          expect(history.steps.at(-1)).toBe(1);
        });

        it('and goes back to the code, then the code field returns with the focus', async () => {
          (await askForRecovery()).flush(instructions);
          await settle();

          await click('.recovery-back');
          await settle();

          expect(element('.recovery')).toBeNull();
          expect(document.activeElement).toBe(element('#login-code'));
        });
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

      expect(element('.ui-field-error').textContent).toContain('E-mail ještě není potvrzený');
      expect(element('.form-note .link-btn').textContent).toContain(
        'Poslat ověřovací e-mail znovu',
      );

      await click('.form-note .link-btn');
      const resend = http.expectOne('/api/donors/auth/email-verification/request');
      expect(resend.request.body).toEqual({ email: 'jana@example.cz' });
      resend.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(element('.form-status').closest('[role="status"]')).not.toBeNull();
      expect(element('.form-status').textContent).toContain('Ověřovací e-mail jsme poslali znovu.');
      expect(element('.form-note')).toBeNull();
      expect(element('.ui-field-error')).toBeNull();
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
      expect(element('.ui-field-error')).toBeNull();
    });
  });

  describe('when a donor signs in with a passkey', () => {
    beforeEach(() => render());

    async function choosePasskey(): Promise<void> {
      await click('.passkey-btn');
      http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
      await vi.waitFor(() => expect(passkeys.requested).toHaveLength(1));
      await settle();
    }

    it('then the device answers the challenge, the dialog closes and the page stays', async () => {
      expect(element('.passkey-btn').textContent).toContain('Přihlásit se přístupovým klíčem');

      await choosePasskey();
      http.expectOne('/api/donors/auth/passkey').flush(authResponse('token-1'));
      await settle();

      expect(TestBed.inject(AuthStore).signedIn()).toBe(true);
      expect(dialog.isOpen()).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('and dismisses the prompt of the device, then the dialog says so and the password form stays usable', async () => {
      passkeys.failure = 'cancelled';

      await choosePasskey();
      await vi.waitFor(() => expect(element('.passkey-error')).not.toBeNull());
      await settle();

      expect(element('.passkey-error').getAttribute('role')).toBe('alert');
      expect(element('.passkey-error').textContent).toContain(
        'Přihlášení přístupovým klíčem neproběhlo',
      );
      expect(element('.passkey-btn').nextElementSibling).toBe(element('.passkey-error'));
      expect(element('.login-form .ui-field-error')).toBeNull();
      expect(element<HTMLButtonElement>('.ui-button--primary').disabled).toBe(false);
      expect(element<HTMLButtonElement>('.passkey-btn').disabled).toBe(false);
      expect(dialog.isOpen()).toBe(true);
    });

    it('and the server does not know the passkey, then the reason from the server is shown', async () => {
      await choosePasskey();
      http
        .expectOne('/api/donors/auth/passkey')
        .flush(
          problem(
            'auth/invalid-passkey',
            'Přístupový klíč neznáme',
            'Přihlaste se prosím e-mailem a heslem, nebo to zkuste znovu.',
          ),
          { status: 401, statusText: 'Unauthorized' },
        );
      await settle();

      expect(element('.passkey-error').textContent).toContain('Přístupový klíč neznáme.');
      expect(TestBed.inject(AuthStore).signedIn()).toBe(false);
    });

    it('after leaving the empty e-mail field, then no e-mail error appears, because a passkey needs no address', async () => {
      passkeys.failure = 'cancelled';
      element('#login-email').dispatchEvent(new Event('blur'));
      await settle();
      expect(element('#login-email-error')).not.toBeNull();

      await choosePasskey();
      await vi.waitFor(() => expect(element('.passkey-error')).not.toBeNull());
      await settle();

      expect(element('#login-email-error')).toBeNull();
    });

    it('in a browser without passkeys, then no passkey button is offered', async () => {
      dialog.close();
      passkeys.available = false;
      await render();

      expect(element('.passkey-btn')).toBeNull();
    });
  });

  describe('when a visitor opened it from the donate section', () => {
    async function register(): Promise<void> {
      await fillIn('#register-name', 'Jana Nováková');
      await fillIn('#register-street', 'Dlouhá 12');
      await fillIn('#register-city', 'Ústí nad Labem');
      await fillIn('#register-postal-code', '400 01');
      await fillIn('#register-email', 'jana@example.cz');
      await fillIn('#register-password', 'correct horse battery');
      await submit('.register-form');
    }

    it('then the registration asks the e-mail link to lead back to the donate section, and so does a new link', async () => {
      await render('register', { confirmationReturnTo: '/#prispet' });

      await register();
      const request = http.expectOne('/api/donors/auth/register');
      expect(request.request.body).toEqual(expect.objectContaining({ returnTo: '/#prispet' }));
      request.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();
      await click('.registration-resend');

      expect(http.expectOne('/api/donors/auth/email-verification/request').request.body).toEqual({
        email: 'jana@example.cz',
        returnTo: '/#prispet',
      });
    });

    it('but signs in before confirming the e-mail, then the link sent again also leads back there', async () => {
      await render('login', { confirmationReturnTo: '/#prispet' });
      await fillIn('#login-email', 'jana@example.cz');
      await fillIn('#login-password', 'correct horse battery');
      await submit('.login-form');
      http
        .expectOne('/api/donors/auth/login')
        .flush(problem('auth/email-not-verified', 'E-mail ještě není potvrzený'), {
          status: 401,
          statusText: 'Unauthorized',
        });
      await settle();

      await click('.form-note .link-btn');

      expect(http.expectOne('/api/donors/auth/email-verification/request').request.body).toEqual({
        email: 'jana@example.cz',
        returnTo: '/#prispet',
      });
    });

    it('after switching from the sign-in tab, then the registration still leads back there', async () => {
      await render('login', { confirmationReturnTo: '/#prispet' });
      await click('.tab-switch button:nth-child(2)');

      await register();

      expect(http.expectOne('/api/donors/auth/register').request.body).toEqual(
        expect.objectContaining({ returnTo: '/#prispet' }),
      );
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
      expect(element('.tab-switch')).toBeNull();
      expect(document.activeElement).toBe(element('.reset-success h3'));

      await click('.reset-success .ui-button--primary');

      expect(element('.login-form')).not.toBeNull();
      expect(document.activeElement).toBe(element('#login-email'));
    });

    describe('and the registration went out', () => {
      beforeEach(async () => {
        await fillInPerson();
        await submit('.register-form');
        http
          .expectOne('/api/donors/auth/register')
          .flush(null, { status: 202, statusText: 'Accepted' });
        await settle();
      });

      it('then the link can be sent again and the dialog says so', async () => {
        await click('.registration-resend');
        const request = http.expectOne('/api/donors/auth/email-verification/request');
        expect(request.request.body).toEqual({ email: 'jana@example.cz' });
        request.flush(null, { status: 202, statusText: 'Accepted' });
        await settle();

        expect(
          element('.reset-success [role="status"]:not(:empty) .form-status').textContent,
        ).toContain('Odkaz jsme poslali znovu');
      });

      it('then a mistyped address can be corrected in the form that keeps everything filled in', async () => {
        await click('.registration-edit');

        expect(element<HTMLInputElement>('#register-name').value).toBe('Jana Nováková');
        expect(element<HTMLInputElement>('#register-email').value).toBe('jana@example.cz');
        expect(document.activeElement).toBe(element('#register-email'));
      });

      it('then the advice no longer sends the visitor to sign in first', () => {
        expect(element('.reset-hint').textContent).toContain(
          'Podívejte se do nevyžádané pošty nebo si ho nechte poslat znovu.',
        );
      });
    });

    it('then the form explains why it asks for the address, names its sections and asks for the postal code before the city', () => {
      expect(element('.register-lead').textContent).toContain(
        'Jméno a adresu uvedeme na potvrzení o daru.',
      );
      expect(element('#register-type-label').textContent).toContain('Registruji se jako');
      expect(element('.type-switch').getAttribute('aria-labelledby')).toBe('register-type-label');
      expect(
        element('#register-postal-code').compareDocumentPosition(element('#register-city')),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('then a passkey is explained before the visitor picks how to sign in', () => {
      expect(element('#register-method-hint').textContent).toContain(
        'Když si nejste jistí, zvolte heslo.',
      );
      expect(
        element('.type-switch[aria-labelledby="register-method-label"]').getAttribute(
          'aria-describedby',
        ),
      ).toBe('register-method-hint');
    });

    it('when the privacy policy link is followed, then the dialog closes and the policy takes its place in history', async () => {
      const link = element<HTMLAnchorElement>('.consent a');

      link.click();
      await settle();

      expect(dialog.isOpen()).toBe(false);
      expect(history.released).toBe(1);
      expect(history.closed).toBe(0);
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({}),
        expect.objectContaining({ replaceUrl: true }),
      );
    });

    it('then the consent stands before the button, which says it creates the account', () => {
      const send = element('.register-form button[type="submit"]');

      expect(send.textContent?.trim()).toBe('Vytvořit účet');
      expect(element('.consent').compareDocumentPosition(send)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it('then the e-mail typed on the sign-in tab is already filled in, and back again', async () => {
      await click('.tab-switch button:nth-child(1)');
      await fillIn('#login-email', 'jana@example.cz');

      await click('.tab-switch button:nth-child(2)');
      expect(element<HTMLInputElement>('#register-email').value).toBe('jana@example.cz');
      expect(document.activeElement).toBe(element('#register-name'));

      await fillIn('#register-email', 'jana.novakova@example.cz');
      await click('.tab-switch button:nth-child(1)');
      expect(element<HTMLInputElement>('#login-email').value).toBe('jana.novakova@example.cz');
      expect(document.activeElement).toBe(element('#login-email'));
    });

    it('as a company with an identification number whose checksum fails, then nothing is sent and the field says so', async () => {
      await click('.type-switch button:nth-child(2)');
      await fillInPerson();
      await fillIn('#register-company-identifier', '12345678');

      await submit('.register-form');

      http.expectNone('/api/donors/auth/register');
      expect(element('#register-company-identifier-error').textContent).toContain(
        'Toto IČO neexistuje, zkontrolujte prosím číslice.',
      );
    });

    it('and the server refuses a field, then the message stands at that field, which takes the focus', async () => {
      await fillInPerson();

      await submit('.register-form');
      http.expectOne('/api/donors/auth/register').flush(
        {
          ...problem('validation', 'Neplatný požadavek', 'Zkontrolujte prosím zadané údaje.'),
          errors: [{ field: 'address.postalCode', message: 'PSČ neexistuje.' }],
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      expect(element('#register-postal-code-error').textContent).toContain('PSČ neexistuje.');
      expect(document.activeElement).toBe(element('#register-postal-code'));
      expect(element('.register-form > .ui-field-error').textContent).toContain(
        'Neplatný požadavek. Zkontrolujte prosím zadané údaje.',
      );
      expect(element('.register-form > .ui-field-error').textContent).not.toContain(
        'PSČ neexistuje.',
      );
    });

    describe('and closes the dialog half way', () => {
      beforeEach(async () => {
        await click('.type-switch button:nth-child(2)');
        await fillIn('#register-name', 'Stavby Novák s.r.o.');
        await fillIn('#register-email', 'ucetni@stavby.example.cz');
        await fillIn('#register-password', 'correct horse battery');
        fixture.destroy();
        dialog.close();
      });

      it('then the next dialog brings back what was filled in, except the password', async () => {
        await render('register');

        expect(element('.type-switch button.is-active').textContent).toContain('Firma');
        expect(element<HTMLInputElement>('#register-name').value).toBe('Stavby Novák s.r.o.');
        expect(element<HTMLInputElement>('#register-email').value).toBe('ucetni@stavby.example.cz');
        expect(element<HTMLInputElement>('#register-password').value).toBe('');
      });
    });

    it('with a passkey instead of a password, then no password is asked for and none is sent', async () => {
      await fillInPerson();
      await click('.type-switch[aria-labelledby="register-method-label"] button:nth-child(2)');
      expect(element('#register-password')).toBeNull();
      expect(element('.passkey-later').textContent).toContain('hned po potvrzení e-mailu');

      await submit('.register-form');
      const request = http.expectOne('/api/donors/auth/register');
      expect(request.request.body.password).toBeNull();
      request.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(element('.reset-success h3').textContent).toContain('Zkontrolujte si e-mail');
    });

    it('in a browser without passkeys, then only the password is offered', async () => {
      passkeys.available = false;
      fixture = TestBed.createComponent(LoginDialog);
      await settle();
      await click('.tab-switch button:nth-child(2)');

      expect(element('#register-method-label')).toBeNull();
      expect(element('#register-password')).not.toBeNull();
    });

    it('as a company, then the identification number travels with the registration', async () => {
      await click('.type-switch button:nth-child(2)');
      await fillIn('#register-name', 'Stavby Novák s.r.o.');
      await fillIn('#register-company-identifier', '452 746 49');
      http
        .expectOne('/api/donors/company-lookup?companyIdentifier=45274649')
        .flush(null, { status: 204, statusText: 'No Content' });
      await fillIn('#register-street', 'Průmyslová 5');
      await fillIn('#register-city', 'Teplice');
      await fillIn('#register-postal-code', '415 01');
      await fillIn('#register-email', 'ucetni@stavby.example.cz');
      await fillIn('#register-password', 'correct horse battery');

      await submit('.register-form');
      const request = http.expectOne('/api/donors/auth/register');
      expect(request.request.body.type).toBe('COMPANY');
      expect(request.request.body.name).toBe('Stavby Novák s.r.o.');
      expect(request.request.body.companyIdentifier).toBe('45274649');
      request.flush(null, { status: 202, statusText: 'Accepted' });
    });

    describe('as a company and types an identification number', () => {
      const LOOKUP = '/api/donors/company-lookup?companyIdentifier=45274649';
      const CEZ = {
        companyIdentifier: '45274649',
        name: 'ČEZ, a. s.',
        address: { street: 'Duhová 1444/2', city: 'Praha 4', postalCode: '140 00' },
      };

      beforeEach(() => click('.type-switch button:nth-child(2)'));

      function value(selector: string): string {
        return element<HTMLInputElement>(selector).value;
      }

      function status(): string {
        return (
          fixture.nativeElement.querySelector('.company-lookup-status')?.textContent?.trim() ?? ''
        );
      }

      it('then the identification number is the first field', () => {
        const fields = [...fixture.nativeElement.querySelectorAll('.register-form input')].map(
          (input) => (input as HTMLInputElement).id,
        );

        expect(fields[0]).toBe('register-company-identifier');
      });

      it('that the register knows, then the name and seat are filled in and a status line asks to check them', async () => {
        await fillIn('#register-company-identifier', '452 746 49');
        http.expectOne(LOOKUP).flush(CEZ);
        await settle();

        expect(value('#register-name')).toBe('ČEZ, a. s.');
        expect(value('#register-street')).toBe('Duhová 1444/2');
        expect(value('#register-postal-code')).toBe('140 00');
        expect(value('#register-city')).toBe('Praha 4');
        expect(element('.company-lookup-status').closest('[role="status"]')).not.toBeNull();
        expect(status()).toBe(
          'Údaje jsme doplnili z obchodního rejstříku (ARES). Zkontrolujte je.',
        );
      });

      it('after typing the name and street, then only the empty fields are filled in', async () => {
        await fillIn('#register-name', 'ČEZ');
        await fillIn('#register-street', 'Duhová 2');
        await fillIn('#register-company-identifier', '45274649');
        http.expectOne(LOOKUP).flush(CEZ);
        await settle();

        expect(value('#register-name')).toBe('ČEZ');
        expect(value('#register-street')).toBe('Duhová 2');
        expect(value('#register-city')).toBe('Praha 4');
        expect(value('#register-postal-code')).toBe('140 00');
        expect(status()).toContain('ARES');
      });

      it('after filling in every field, then nothing changes and nothing is said', async () => {
        await fillIn('#register-name', 'ČEZ');
        await fillIn('#register-street', 'Duhová 2');
        await fillIn('#register-city', 'Praha');
        await fillIn('#register-postal-code', '140 53');
        await fillIn('#register-company-identifier', '45274649');
        http.expectOne(LOOKUP).flush(CEZ);
        await settle();

        expect(value('#register-city')).toBe('Praha');
        expect(status()).toBe('');
      });

      it('that the register knows without a seat, then only the name is filled in', async () => {
        await fillIn('#register-company-identifier', '45274649');
        http.expectOne(LOOKUP).flush({ ...CEZ, address: null });
        await settle();

        expect(value('#register-name')).toBe('ČEZ, a. s.');
        expect(value('#register-street')).toBe('');
        expect(status()).toContain('ARES');
      });

      it('and then corrects it to another company, then the filled-in fields follow and the typed ones stay', async () => {
        await fillIn('#register-street', 'Duhová 2');
        await fillIn('#register-company-identifier', '45274649');
        http.expectOne(LOOKUP).flush(CEZ);
        await settle();

        await fillIn('#register-company-identifier', '00006947');
        http.expectOne('/api/donors/company-lookup?companyIdentifier=00006947').flush({
          companyIdentifier: '00006947',
          name: 'Ministerstvo financí',
          address: { street: 'Letenská 525/15', city: 'Praha 1', postalCode: '118 00' },
        });
        await settle();

        expect(value('#register-name')).toBe('Ministerstvo financí');
        expect(value('#register-street')).toBe('Duhová 2');
        expect(value('#register-city')).toBe('Praha 1');
        expect(value('#register-postal-code')).toBe('118 00');
      });

      for (const [outcome, status, body] of [
        ['has nothing about', 204, null],
        ['fails on', 500, null],
        [
          'refuses too many lookups of',
          429,
          problem('donors/rate-limited', 'Příliš mnoho požadavků'),
        ],
      ] as const) {
        it(`that the server ${outcome}, then the fields stay empty and nothing is said`, async () => {
          await fillIn('#register-company-identifier', '45274649');
          http.expectOne(LOOKUP).flush(body, { status, statusText: 'Answer' });
          await settle();

          expect(value('#register-name')).toBe('');
          expect(value('#register-street')).toBe('');
          expect(fixture.nativeElement.querySelector('[role="alert"]:not(:empty)')).toBeNull();
          expect(element('.register-form > .ui-field-error')).toBeNull();
          expect(fixture.nativeElement.textContent).not.toContain('ARES');
        });
      }

      it('that cannot be reached, then the fields stay as typed and nothing is said', async () => {
        await fillIn('#register-name', 'ČEZ');
        await fillIn('#register-company-identifier', '45274649');
        http.expectOne(LOOKUP).error(new ProgressEvent('error'));
        await settle();

        expect(value('#register-name')).toBe('ČEZ');
        expect(fixture.nativeElement.querySelector('[role="alert"]:not(:empty)')).toBeNull();
        expect(status()).toBe('');
      });

      it('with a wrong check digit or seven digits, then the register is not asked', async () => {
        await fillIn('#register-company-identifier', '45274648');
        await fillIn('#register-company-identifier', '4527464');

        http.expectNone((request) => request.url.startsWith('/api/donors/company-lookup'));
      });

      it('and sends the registration before the register answers, then the registration goes out and the late answer is dropped', async () => {
        await fillIn('#register-company-identifier', '45274649');
        const lookup = http.expectOne(LOOKUP);
        await fillIn('#register-name', 'Stavby Novák s.r.o.');
        await fillIn('#register-street', 'Průmyslová 5');
        await fillIn('#register-city', 'Teplice');
        await fillIn('#register-postal-code', '415 01');
        await fillIn('#register-email', 'ucetni@stavby.cz');
        await fillIn('#register-password', 'correct horse battery');

        await submit('.register-form');

        expect(lookup.cancelled).toBe(true);
        const registration = http.expectOne('/api/donors/auth/register');
        expect(registration.request.body.name).toBe('Stavby Novák s.r.o.');
        registration.flush(null, { status: 202, statusText: 'Accepted' });
      });

      it('and switches to a person, then the pending lookup is dropped and nothing is said', async () => {
        await fillIn('#register-company-identifier', '45274649');
        const lookup = http.expectOne(LOOKUP);

        await click('.type-switch button:nth-child(1)');

        expect(lookup.cancelled).toBe(true);
        expect(fixture.nativeElement.textContent).not.toContain('ARES');
      });
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

      expect(element('.ui-field-error').textContent).toContain('Heslo je příliš běžné');
      expect(element('.ui-field-error').textContent).toContain('Zvolte prosím méně obvyklé heslo.');
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
      expect(element('.ui-field-error').textContent).toContain(
        'Příliš mnoho pokusů z této adresy. Zkuste to prosím za chvíli znovu.',
      );
      expect(element<HTMLButtonElement>('.register-form .ui-button--primary').disabled).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('and the server fails, then the dialog shows a generic error', async () => {
      await fillInPerson();

      await submit('.register-form');
      http
        .expectOne('/api/donors/auth/register')
        .flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(element('.ui-field-error').textContent).toContain('nepodařilo');
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

    it('from the sign-in tab, then the link switches to the reset form with the e-mail already filled in and focused', async () => {
      await click('.reset-back');
      await fillIn('#login-email', 'jana@example.cz');
      await click('.forgot-link');

      expect(element('.reset-form')).not.toBeNull();
      expect(element<HTMLInputElement>('#reset-email').value).toBe('jana@example.cz');
      expect(document.activeElement).toBe(element('#reset-email'));
    });

    it('and goes back to sign in, then the e-mail field of the sign-in takes the focus', async () => {
      await click('.reset-back');

      expect(document.activeElement).toBe(element('#login-email'));
    });

    it('with a valid address, then the trimmed address is sent and the sent panel replaces the form', async () => {
      await requestLink('  jana@example.cz ');

      expect(element<HTMLButtonElement>('.reset-form .ui-button--primary').disabled).toBe(true);
      const request = http.expectOne('/api/donors/auth/password-reset/request');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ email: 'jana@example.cz' });
      request.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(element('.reset-success h3').textContent).toContain('Zkontrolujte si e-mail');
      expect(element('.reset-success').textContent).toContain(
        'Pokud k adrese jana@example.cz existuje účet',
      );
      expect(element('.reset-success').textContent).toContain('Platí hodinu.');
      expect(element('.reset-form')).toBeNull();
      expect(document.activeElement).toBe(element('.reset-success h3'));
    });

    it('and asks for it again, then another link goes out and the dialog says so', async () => {
      await requestLink('jana@example.cz');
      http
        .expectOne('/api/donors/auth/password-reset/request')
        .flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      await click('.reset-resend');
      const again = http.expectOne('/api/donors/auth/password-reset/request');
      expect(again.request.body).toEqual({ email: 'jana@example.cz' });
      again.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(element('.reset-success [role="status"] .form-status').textContent).toContain(
        'poslali jsme odkaz znovu',
      );
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

      expect(element('.ui-field-error').textContent).toContain(
        'Odeslali jste příliš mnoho žádostí. Zkuste to prosím za hodinu.',
      );
      expect(element('.reset-success')).toBeNull();
      expect(element<HTMLButtonElement>('.reset-form .ui-button--primary').disabled).toBe(false);
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

      expect(element('.ui-field-error').textContent).toContain(
        'Neplatný požadavek. Zadejte platný e-mail.',
      );
    });

    it('and the server fails, then the dialog shows a generic error', async () => {
      await requestLink('jana@example.cz');
      http
        .expectOne('/api/donors/auth/password-reset/request')
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      await settle();

      expect(element('.ui-field-error').textContent).toContain('Spojení se serverem se nepodařilo');
    });
  });
});
