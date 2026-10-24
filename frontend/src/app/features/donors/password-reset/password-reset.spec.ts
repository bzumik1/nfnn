import { Location } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { PasskeyAuthenticator } from '../../../core/auth/passkey-authenticator';
import {
  authResponse,
  FakePasskeyAuthenticator,
  passkeyCreationOptions,
  problem,
  SAMPLE_CHALLENGE,
  SAMPLE_REGISTRATION,
  samplePasskey,
} from '../../../core/auth/testing/donor-fixtures';
import { PasswordReset } from './password-reset';

describe('Given the page that sets a new password from the e-mail link', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let dialog: LoginDialogService;
  let store: AuthStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'obnova-hesla', component: PasswordReset }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    dialog = TestBed.inject(LoginDialogService);
    store = TestBed.inject(AuthStore);
  });

  afterEach(() => http.verify());

  async function open(url: string): Promise<void> {
    harness = await RouterTestingHarness.create(url);
    await settle();
  }

  async function settle(): Promise<void> {
    harness.detectChanges();
    await harness.fixture.whenStable();
  }

  function element<T extends HTMLElement>(selector: string): T {
    return harness.routeNativeElement!.querySelector(selector) as T;
  }

  function heading(): HTMLElement {
    return element('#password-reset-title');
  }

  async function fillIn(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function click(selector: string): Promise<void> {
    element<HTMLButtonElement>(selector).click();
    await settle();
  }

  async function submitPasswords(password: string): Promise<void> {
    await fillIn('#reset-password', password);
    element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    await settle();
  }

  async function answerConfirm(
    body: Record<string, unknown> | null,
    status: number,
    statusText: string,
  ): Promise<void> {
    http.expectOne('/api/donors/auth/password-reset/confirm').flush(body, { status, statusText });
    await settle();
  }

  describe('when the link carries a token', () => {
    beforeEach(() => open('/obnova-hesla#token=abc'));

    it('then the token leaves the address bar and the form asks for the new password', () => {
      expect(TestBed.inject(Location).path(true)).toBe('/obnova-hesla');
      expect(heading().textContent).toContain('Nastavte si nové heslo');
      expect(element('#reset-password').getAttribute('aria-describedby')).toBe(
        'reset-password-hint',
      );
      expect(element('#reset-password-hint').textContent).toContain('Alespoň 12 znaků');
    });

    it('and the donor enters the new password, then the token and the password are sent', async () => {
      await submitPasswords('correct horse battery');

      const request = http.expectOne('/api/donors/auth/password-reset/confirm');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ token: 'abc', password: 'correct horse battery' });
      await settle();
      expect(element<HTMLButtonElement>('.ui-button--primary').disabled).toBe(true);
      expect(element('.ui-button--primary').textContent).toContain('Ukládám…');
      request.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('then the password is asked for once, with a button that shows what was typed', () => {
      expect(harness.routeNativeElement!.querySelectorAll('input[type="password"]')).toHaveLength(
        1,
      );
      expect(element('#reset-password + .password-reveal')).not.toBeNull();
    });

    it('and the password is too short, then nothing is sent and the password field says why', async () => {
      await submitPasswords('short');

      http.expectNone('/api/donors/auth/password-reset/confirm');
      expect(element('#reset-password-error').textContent).toContain(
        'Heslo musí mít alespoň 12 znaků.',
      );
    });

    it('and the password is saved, then the success panel takes focus and offers the sign-in dialog that leads to the overview', async () => {
      const logout = vi.spyOn(store, 'logout');

      await submitPasswords('correct horse battery');
      await answerConfirm(null, 204, 'No Content');

      expect(heading().textContent).toContain('Heslo je změněno');
      expect(element('.ui-panel__lead').textContent).toContain('Přihlaste se prosím novým heslem.');
      expect(document.activeElement).toBe(heading());
      expect(logout).not.toHaveBeenCalled();

      await click('.ui-button--primary');

      expect(dialog.isOpen()).toBe(true);
      expect(dialog.initialMode()).toBe('login');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      dialog.signedIn();
      expect(navigate).toHaveBeenCalledWith('/darce/prehled');
    });

    it('and the link is no longer valid, then the invalid panel offers a new link', async () => {
      await submitPasswords('correct horse battery');
      await answerConfirm(
        problem(
          'donors/invalid-password-reset-token',
          'Odkaz pro obnovu hesla je neplatný nebo vypršel',
          'Požádejte prosím o nový odkaz.',
        ),
        400,
        'Bad Request',
      );

      expect(heading().textContent).toContain('Odkaz je neplatný nebo vypršel');
      expect(element('.ui-panel__lead').textContent).toContain(
        'Odkaz lze použít jen jednou a platí hodinu.',
      );
      expect(document.activeElement).toBe(heading());

      await click('.ui-button--primary');

      expect(dialog.isOpen()).toBe(true);
      expect(dialog.initialMode()).toBe('reset');
    });

    it('and the password is too common, then the problem is shown and the form stays', async () => {
      await submitPasswords('password12345');
      await answerConfirm(
        problem('donors/password-too-common', 'Heslo je příliš běžné', 'Zvolte prosím jiné heslo.'),
        400,
        'Bad Request',
      );

      expect(element('.ui-field-error').textContent).toContain(
        'Heslo je příliš běžné. Zvolte prosím jiné heslo.',
      );
      expect(heading().textContent).toContain('Nastavte si nové heslo');
      expect(element<HTMLButtonElement>('.ui-button--primary').disabled).toBe(false);
    });

    it('and the server fails, then a generic error is shown', async () => {
      await submitPasswords('correct horse battery');
      await answerConfirm(null, 502, 'Bad Gateway');

      expect(element('.ui-field-error').textContent).toContain(
        'Heslo se nepodařilo uložit. Zkuste to prosím znovu.',
      );
    });

    it('and the donor leaves the page before the answer arrives, then the late answer is dropped silently', async () => {
      await submitPasswords('correct horse battery');
      harness.fixture.destroy();

      http
        .expectOne('/api/donors/auth/password-reset/confirm')
        .flush(null, { status: 204, statusText: 'No Content' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(dialog.isOpen()).toBe(false);
    });
  });

  describe('when the browser still holds a session and the password is saved', () => {
    beforeEach(async () => {
      store.login('jana@example.cz', 'correct horse battery').subscribe();
      http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
      await open('/obnova-hesla#token=abc');
    });

    it('then the session is forgotten before the success panel shows', async () => {
      const logout = vi.spyOn(store, 'logout');

      await submitPasswords('correct horse battery');
      await answerConfirm(null, 204, 'No Content');
      http
        .expectOne('/api/donors/auth/logout')
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      await settle();

      expect(logout).toHaveBeenCalledOnce();
      expect(store.signedIn()).toBe(false);
      expect(heading().textContent).toContain('Heslo je změněno');
    });
  });

  describe('when the link has no token', () => {
    beforeEach(() => open('/obnova-hesla'));

    it('then the missing-link panel offers to ask for a new link in the dialog', async () => {
      expect(heading().textContent).toContain('Odkaz je neúplný');
      expect(element('form')).toBeNull();

      await click('.ui-button--primary');

      expect(dialog.isOpen()).toBe(true);
      expect(dialog.initialMode()).toBe('reset');
    });
  });
});

describe('Given the reset link opened in a browser with passkeys', () => {
  const OPTIONS_URL = '/api/donors/auth/password-reset/passkey/options';
  const RECOVERY_URL = '/api/donors/auth/password-reset/passkey';
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let passkeys: FakePasskeyAuthenticator;
  let dialog: LoginDialogService;

  beforeEach(async () => {
    localStorage.clear();
    passkeys = new FakePasskeyAuthenticator();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'obnova-hesla', component: PasswordReset }]),
        { provide: PasskeyAuthenticator, useValue: passkeys },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    dialog = TestBed.inject(LoginDialogService);
    harness = await RouterTestingHarness.create('/obnova-hesla#token=abc');
    await settle();
  });

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    harness.detectChanges();
    await harness.fixture.whenStable();
  }

  function element<T extends HTMLElement>(selector: string): T {
    return harness.routeNativeElement!.querySelector(selector) as T;
  }

  async function fillIn(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function choosePasskey(): Promise<void> {
    element<HTMLButtonElement>('.method-switch button:nth-child(2)').click();
    await settle();
  }

  async function submit(): Promise<void> {
    element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    await settle();
  }

  it('when it opens, then it offers a new password or a new passkey with the password chosen', () => {
    expect(element('#password-reset-title').textContent).toContain('Obnovte si přístup');
    expect(element('.method-switch button:nth-child(1)').getAttribute('aria-checked')).toBe('true');
    expect(element('#reset-password')).not.toBeNull();
  });

  it('when a new passkey is created, then the link and the device register it and the page asks to sign in with it', async () => {
    await choosePasskey();
    await fillIn('#reset-passkey-name', 'Nový telefon');
    await submit();

    const options = http.expectOne(OPTIONS_URL);
    expect(options.request.body).toEqual({ token: 'abc' });
    options.flush(passkeyCreationOptions());
    const recovery = await vi.waitFor(() => http.expectOne(RECOVERY_URL));
    expect(recovery.request.body).toEqual({
      token: 'abc',
      challenge: SAMPLE_CHALLENGE,
      name: 'Nový telefon',
      credential: SAMPLE_REGISTRATION,
    });
    recovery.flush(samplePasskey({ name: 'Nový telefon' }), {
      status: 201,
      statusText: 'Created',
    });
    await settle();

    expect(element('#password-reset-title').textContent).toContain('Přístupový klíč je uložený');
    element<HTMLButtonElement>('.ui-button--primary').click();
    expect(dialog.isOpen()).toBe(true);
  });

  it('when the account has the code from the app on, then the page asks for it and sends it along', async () => {
    await choosePasskey();
    await fillIn('#reset-passkey-name', 'Nový telefon');
    await submit();
    http
      .expectOne(OPTIONS_URL)
      .flush(problem('donors/second-factor-code-required', 'Zadejte kód z aplikace'), {
        status: 400,
        statusText: 'Bad Request',
      });
    await settle();

    expect(element('.ui-field-error')).toBeNull();
    expect(element('#reset-passkey-code-hint').textContent).toContain(
      'zapnuté dvoufaktorové ověření',
    );
    expect(document.activeElement).toBe(element('#reset-passkey-code'));
    await fillIn('#reset-passkey-code', '287082');
    await submit();

    const options = http.expectOne(OPTIONS_URL);
    expect(options.request.body).toEqual({ token: 'abc', code: '287082' });
    options.flush(passkeyCreationOptions());
    (await vi.waitFor(() => http.expectOne(RECOVERY_URL))).flush(samplePasskey(), {
      status: 201,
      statusText: 'Created',
    });
    await settle();
  });

  it('when an administrator opens the link, then the reason from the server is shown and no key is created', async () => {
    await choosePasskey();
    await fillIn('#reset-passkey-name', 'Nový telefon');
    await submit();
    http
      .expectOne(OPTIONS_URL)
      .flush(
        problem(
          'donors/administrator-recovery-refused',
          'Účet správce se takto neobnovuje',
          'Požádejte jiného správce.',
        ),
        { status: 403, statusText: 'Forbidden' },
      );
    await settle();

    expect(element('.ui-field-error').textContent).toContain('Účet správce se takto neobnovuje');
    expect(passkeys.created).toHaveLength(0);
  });
});
