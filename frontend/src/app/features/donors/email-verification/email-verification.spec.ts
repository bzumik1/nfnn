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
  sampleDonor,
  samplePasskey,
} from '../../../core/auth/testing/donor-fixtures';
import { EmailVerification } from './email-verification';

describe('Given the page that confirms the e-mail from the registration link', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let store: AuthStore;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'potvrzeni-emailu', component: EmailVerification }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
  });

  afterEach(() => http.verify());

  async function open(url: string): Promise<void> {
    harness = await RouterTestingHarness.create(url);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
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
    return element('#email-verification-title');
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

  async function submitRequest(): Promise<void> {
    element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    await settle();
  }

  async function answerConfirm(
    body: Record<string, unknown> | null,
    status: number,
    statusText: string,
  ): Promise<void> {
    http
      .expectOne('/api/donors/auth/email-verification/confirm')
      .flush(body, { status, statusText });
    await settle();
  }

  describe('when the link carries a token', () => {
    beforeEach(() => open('/potvrzeni-emailu#token=abc'));

    it('then the token leaves the address bar and is sent at once while the page says it is confirming', () => {
      expect(TestBed.inject(Location).path(true)).toBe('/potvrzeni-emailu');
      const request = http.expectOne('/api/donors/auth/email-verification/confirm');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ token: 'abc' });
      expect(heading().textContent).toContain('Potvrzujeme váš e-mail');
      expect(element('[role="status"]').textContent).toContain('Chvilku strpení');
      request.flush(authResponse('token-1'));
    });

    it('and the server confirms it, then the donor is signed in, the success panel takes focus and leads to the overview', async () => {
      await answerConfirm(authResponse('token-1') as unknown as Record<string, unknown>, 200, 'OK');

      expect(store.signedIn()).toBe(true);
      expect(store.donor()?.email).toBe('jana@example.cz');
      expect(heading().textContent).toContain('E-mail je potvrzený');
      expect(element('[role="status"]').textContent).toContain('jste přihlášeni');
      expect(document.activeElement).toBe(heading());

      await click('.ui-button--primary');

      expect(navigate).toHaveBeenCalledWith('/darce/prehled');
    });

    it('and the link is no longer valid, then the invalid panel asks for the e-mail and sends a new link', async () => {
      await answerConfirm(
        problem(
          'donors/invalid-email-verification-token',
          'Odkaz pro potvrzení e-mailu je neplatný nebo vypršel',
          'Nechte si prosím poslat nový odkaz.',
        ),
        400,
        'Bad Request',
      );

      expect(store.signedIn()).toBe(false);
      expect(heading().textContent).toContain('Odkaz je neplatný nebo vypršel');
      expect(element('.ui-panel__lead').textContent).toContain('platí 24 hodin');
      expect(document.activeElement).toBe(heading());

      await fillIn('#verification-email', ' jana@example.cz ');
      await submitRequest();
      const request = http.expectOne('/api/donors/auth/email-verification/request');
      expect(request.request.body).toEqual({ email: 'jana@example.cz' });
      expect(element<HTMLButtonElement>('.ui-button--primary').disabled).toBe(true);
      expect(element('.ui-button--primary').textContent).toContain('Odesílám…');
      request.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(heading().textContent).toContain('E-mail odeslán');
      expect(element('[role="status"]').textContent).toContain('poslali jsme na ni nový odkaz');
      expect(element('form')).toBeNull();
      expect(element('.ui-status').textContent).toContain(
        'E-mail nedorazil? Podívejte se do nevyžádané pošty.',
      );
      expect(element<HTMLAnchorElement>('a.ui-button--primary').getAttribute('href')).toBe('/');
    });

    it('and the link was already used, then the page says signing in is enough and opens the dialog for the overview', async () => {
      await answerConfirm(
        problem('donors/invalid-email-verification-token', 'Odkaz je neplatný', ''),
        400,
        'Bad Request',
      );

      expect(element('.already-confirmed').textContent).toContain(
        'Už jste e-mail potvrdili? Pak se stačí přihlásit.',
      );
      await click('.already-confirmed + .ui-button');

      const dialog = TestBed.inject(LoginDialogService);
      expect(dialog.isOpen()).toBe(true);
      expect(dialog.initialMode()).toBe('login');
      dialog.signedIn();
      expect(navigate).toHaveBeenCalledWith('/darce/prehled');
    });

    it('and the link is no longer valid and the address is empty, then nothing is sent and the field says what is missing', async () => {
      await answerConfirm(problem('donors/invalid-email-verification-token'), 400, 'Bad Request');

      await submitRequest();

      http.expectNone('/api/donors/auth/email-verification/request');
      expect(element('#verification-email-error').textContent).toContain('Vyplňte prosím e-mail.');
    });

    it('and too many links were asked for from this address, then the form says to wait an hour', async () => {
      await answerConfirm(problem('donors/invalid-email-verification-token'), 400, 'Bad Request');

      await fillIn('#verification-email', 'jana@example.cz');
      await submitRequest();
      http
        .expectOne('/api/donors/auth/email-verification/request')
        .flush(problem('donors/rate-limited', 'Příliš mnoho požadavků'), {
          status: 429,
          statusText: 'Too Many Requests',
        });
      await settle();

      expect(element('.ui-field-error').getAttribute('role')).toBe('alert');
      expect(element('.ui-field-error').textContent).toContain('Zkuste to prosím za hodinu.');
      expect(element<HTMLButtonElement>('.ui-button--primary').disabled).toBe(false);
    });

    it('and the server fails, then the failed panel shows a generic error and retries on request', async () => {
      await answerConfirm(null, 502, 'Bad Gateway');

      expect(heading().textContent).toContain('E-mail se nepodařilo potvrdit');
      expect(element('[role="alert"]').textContent).toContain('Spojení se serverem se nepodařilo.');

      await click('.ui-button--primary');

      expect(heading().textContent).toContain('Potvrzujeme váš e-mail');
      await answerConfirm(authResponse('token-1') as unknown as Record<string, unknown>, 200, 'OK');
      expect(heading().textContent).toContain('E-mail je potvrzený');
    });

    it('and the donor leaves the page before the answer arrives, then the late answer is dropped silently', async () => {
      harness.fixture.destroy();

      http.expectOne('/api/donors/auth/email-verification/confirm').flush(authResponse('token-1'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(store.signedIn()).toBe(true);
    });
  });

  describe('when the link carries a token and the way back to the donate section', () => {
    beforeEach(() => open('/potvrzeni-emailu#token=abc&returnTo=%2F%23prispet'));

    it('then only the token is sent and the address bar keeps neither', () => {
      expect(TestBed.inject(Location).path(true)).toBe('/potvrzeni-emailu');
      const request = http.expectOne('/api/donors/auth/email-verification/confirm');
      expect(request.request.body).toEqual({ token: 'abc' });
      request.flush(authResponse('token-1'));
    });

    it('and the server confirms it, then the page says the QR code now carries the symbol and leads back to the donate section', async () => {
      await answerConfirm(authResponse('token-1') as unknown as Record<string, unknown>, 200, 'OK');

      expect(store.signedIn()).toBe(true);
      expect(element('[role="status"]').textContent).toContain(
        'QR kód pro platbu už ponese váš variabilní symbol',
      );
      expect(element('.ui-button--primary').textContent?.trim()).toBe('Pokračovat k příspěvku');

      await click('.ui-button--primary');

      expect(navigate).toHaveBeenCalledWith('/#prispet');
    });

    it('and the link is no longer valid, then a new link asked for keeps the way back', async () => {
      await answerConfirm(
        problem('donors/invalid-email-verification-token', 'Odkaz je neplatný', ''),
        400,
        'Bad Request',
      );

      await fillIn('#verification-email', 'jana@example.cz');
      await submitRequest();
      const request = http.expectOne('/api/donors/auth/email-verification/request');
      expect(request.request.body).toEqual({ email: 'jana@example.cz', returnTo: '/#prispet' });
      request.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();
    });

    it('and the link was already used, then signing in leads back to the donate section', async () => {
      await answerConfirm(
        problem('donors/invalid-email-verification-token', 'Odkaz je neplatný', ''),
        400,
        'Bad Request',
      );

      await click('.already-confirmed + .ui-button');
      TestBed.inject(LoginDialogService).signedIn();

      expect(navigate).toHaveBeenCalledWith('/#prispet');
    });
  });

  describe('when the link names a way back that is not on the list', () => {
    beforeEach(() => open('/potvrzeni-emailu#token=abc&returnTo=https%3A%2F%2Fevil.example'));

    it('and the server confirms it, then the page leads to the overview as usual', async () => {
      await answerConfirm(authResponse('token-1') as unknown as Record<string, unknown>, 200, 'OK');

      await click('.ui-button--primary');

      expect(navigate).toHaveBeenCalledWith('/darce/prehled');
    });
  });

  describe('when the link has no token', () => {
    beforeEach(() => open('/potvrzeni-emailu'));

    it('then nothing is sent and the page says the link is incomplete and offers a new one', async () => {
      http.expectNone('/api/donors/auth/email-verification/confirm');
      expect(heading().textContent).toContain('Odkaz je neúplný');

      await fillIn('#verification-email', 'jana@example.cz');
      await submitRequest();
      http
        .expectOne('/api/donors/auth/email-verification/request')
        .flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(heading().textContent).toContain('E-mail odeslán');
    });
  });
});

describe('Given the registration link of a donor who chose a passkey instead of a password', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let passkeys: FakePasskeyAuthenticator;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    localStorage.clear();
    passkeys = new FakePasskeyAuthenticator();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'potvrzeni-emailu', component: EmailVerification }]),
        { provide: PasskeyAuthenticator, useValue: passkeys },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create('/potvrzeni-emailu#token=abc');
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    http
      .expectOne('/api/donors/auth/email-verification/confirm')
      .flush(authResponse('token-1', sampleDonor({ hasPassword: false })));
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

  it('when the e-mail is confirmed, then the page asks to create the first passkey right away', () => {
    expect(element('[role="status"]').textContent).toContain('vytvořte přístupový klíč');
    expect(element('.ui-button--primary').textContent).toContain('Vytvořit přístupový klíč');
  });

  it('when the donor creates the passkey, then it is saved without any confirmation and the page leads on', async () => {
    element<HTMLButtonElement>('.ui-button--primary').click();
    await settle();
    const options = http.expectOne('/api/donors/me/passkeys/options');
    expect(options.request.body).toEqual({});
    options.flush(passkeyCreationOptions());
    const added = await vi.waitFor(() =>
      http.expectOne({ method: 'POST', url: '/api/donors/me/passkeys' }),
    );
    expect(added.request.body.challenge).toBe(SAMPLE_CHALLENGE);
    expect(added.request.body.credential).toEqual(SAMPLE_REGISTRATION);
    added.flush(samplePasskey());
    await settle();

    expect(element('[role="status"]').textContent).toContain('Přístupový klíč je uložený');
    element<HTMLButtonElement>('.ui-button--primary').click();
    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });

  it('when the device does not create the key, then the page says it can be done later and still leads on', async () => {
    passkeys.failure = 'cancelled';
    element<HTMLButtonElement>('.ui-button--primary').click();
    await settle();
    http.expectOne('/api/donors/me/passkeys/options').flush(passkeyCreationOptions());
    await vi.waitFor(() => expect(element('.ui-field-error')).not.toBeNull());

    expect(element('.ui-field-error').textContent).toContain(
      'jde to i později v části Údaje a zabezpečení',
    );
    element<HTMLButtonElement>('.link-action').click();
    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });
});

describe('Given the registration link from the donate section of a donor who chose a passkey', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'potvrzeni-emailu', component: EmailVerification }]),
        { provide: PasskeyAuthenticator, useValue: new FakePasskeyAuthenticator() },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(
      '/potvrzeni-emailu#token=abc&returnTo=%2F%23prispet',
    );
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    http
      .expectOne('/api/donors/auth/email-verification/confirm')
      .flush(authResponse('token-1', sampleDonor({ hasPassword: false })));
    harness.detectChanges();
    await harness.fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('when the donor skips the key, then the page leads back to the donate section', () => {
    const later = harness.routeNativeElement!.querySelector('.link-action') as HTMLButtonElement;
    expect(later.textContent?.trim()).toBe('Pokračovat k příspěvku bez klíče');

    later.click();

    expect(navigate).toHaveBeenCalledWith('/#prispet');
  });
});
