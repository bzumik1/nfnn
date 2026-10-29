import { HttpRequest, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore, SESSION_HINT_KEY } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { PasskeyAuthenticator } from '../../../core/auth/passkey-authenticator';
import {
  authResponse,
  FakePasskeyAuthenticator,
  passkeySignInOptions,
  problem,
  SAMPLE_ASSERTION,
  SAMPLE_CHALLENGE,
  sampleDonor,
  samplePasskey,
} from '../../../core/auth/testing/donor-fixtures';
import { ExternalNavigation } from '../../../core/navigation/external-navigation';
import { ConnectApp } from './connect-app';

const CLIENT_ID = 'https://claude.ai/.well-known/oauth-client';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const QUERY = {
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  code_challenge_method: 'S256',
  scope: 'admin:read admin:write',
  resource: 'http://localhost:4200/mcp',
  state: 'xyz',
};
const CLIENT_URL = (request: HttpRequest<unknown>) =>
  request.url === '/api/donors/oauth/client' &&
  request.params.get('clientId') === CLIENT_ID &&
  request.params.get('redirectUri') === REDIRECT;
const CLAUDE = { host: 'claude.ai', name: 'Claude', loopback: false };
const ADMIN_WITH_CODE = {
  roles: ['DONOR', 'ADMIN'],
  secondFactor: { enabled: true, neededForAdministration: true },
};

class FakeNavigation {
  readonly assigned: string[] = [];

  assign(url: string): void {
    this.assigned.push(url);
  }
}

describe('Given an application sent the browser to the connection page', () => {
  let fixture: ComponentFixture<ConnectApp>;
  let http: HttpTestingController;
  let store: AuthStore;
  let dialog: LoginDialogService;
  let navigation: FakeNavigation;
  let passkeys: FakePasskeyAuthenticator;

  async function configure(
    query: Record<string, string>,
    signedInAs?: Parameters<typeof sampleDonor>[0],
    passkeysSupported = false,
  ) {
    localStorage.clear();
    navigation = new FakeNavigation();
    passkeys = new FakePasskeyAuthenticator();
    passkeys.available = passkeysSupported;
    await TestBed.configureTestingModule({
      imports: [ConnectApp],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ExternalNavigation, useValue: navigation },
        { provide: PasskeyAuthenticator, useValue: passkeys },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
    dialog = TestBed.inject(LoginDialogService);
    if (signedInAs) {
      store.login('jana@example.cz', 'correct horse battery').subscribe();
      http
        .expectOne('/api/donors/auth/login')
        .flush(authResponse('token-1', sampleDonor(signedInAs)));
    } else {
      await store.restore();
    }
    fixture = TestBed.createComponent(ConnectApp);
    await settle();
  }

  afterEach(() => http.verify());

  const root = () => fixture.nativeElement as HTMLElement;

  function element<T extends HTMLElement>(selector: string): T {
    return root().querySelector(selector) as T;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function typeCode(code: string): Promise<void> {
    const field = element<HTMLInputElement>('#connect-app-code');
    field.value = code;
    field.dispatchEvent(new Event('input'));
    await settle();
  }

  async function clickButton(text: string): Promise<void> {
    const button = Array.from(root().querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(text),
    );
    expect(button, `button "${text}"`).toBeDefined();
    button?.click();
    await settle();
  }

  describe('when nobody is signed in', () => {
    beforeEach(() => configure(QUERY));

    it('then the page asks for an administrator sign-in and opens the dialog without leaving the page', () => {
      expect(element('h1').textContent).toContain('Aplikace žádá o přístup ke správě');
      expect(element('.ui-panel__lead').textContent).toContain('účtem správce');
      http.expectNone(CLIENT_URL);

      element<HTMLButtonElement>('.ui-button--primary').click();

      expect(dialog.isOpen()).toBe(true);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      dialog.signedIn();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('and an administrator signs in, then the consent names the application and its permissions', async () => {
      store.login('jana@example.cz', 'correct horse battery').subscribe();
      http
        .expectOne('/api/donors/auth/login')
        .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
      await settle();
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      await settle();

      expect(element('h1').textContent).toContain('Povolit přístup ke správě aplikaci claude.ai?');
      expect(element('.client-host').textContent).toBe('claude.ai');
      expect(element('.ui-panel__lead').textContent).toContain('„Claude“');
      expect(element('.ui-panel__lead').textContent).toContain('Jana Nováková');
      const bullets = (selector: string) =>
        Array.from(root().querySelectorAll(selector)).map((li) => li.textContent?.trim());
      expect(bullets('.scopes li')).toContain('vidět dárce, jejich dary a platby z banky');
      expect(bullets('.scopes li')).toContain('vidět stav záloh a provozní záznamy webu');
      const writeOption = element<HTMLInputElement>('#connect-app-write');
      expect(writeOption.checked).toBe(false);
      expect(element('label[for="connect-app-write"]').textContent?.trim()).toBe('Povolit i změny');
      expect(bullets('.write-scopes li')).toContain('nastavit a odeslat měsíční report');
      expect(writeOption.getAttribute('aria-describedby')).toBe(
        'connect-app-write-scopes connect-app-write-hint',
      );
      expect(element('.scope-hint').textContent).toContain('jen čtení');
      expect(element('.never').textContent).toContain('Nikdy nebude smět');
      expect(element('.never').textContent).toContain('nic mazat');
      expect(root().textContent).toContain('v části Údaje a zabezpečení → Připojené aplikace');
      expect(document.activeElement).toBe(element('h1'));
    });
  });

  describe('when an administrator with the code from the app is signed in', () => {
    beforeEach(async () => {
      await configure(QUERY, ADMIN_WITH_CODE);
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      await settle();
    });

    it('then the consent asks for a fresh code even though the session was opened with one', () => {
      expect(element('label[for="connect-app-code"]').textContent).toContain('Kód z aplikace');
      expect(element('.confirm-note').textContent?.trim()).toBe(
        'Povolení potvrďte kódem z ověřovací aplikace.',
      );
      expect(element('#connect-app-code-hint').textContent).toContain(
        'Počkejte, až aplikace ukáže nový kód',
      );
      expect(root().textContent).not.toContain('Povolit přístupovým klíčem');
    });

    it('and allows without the code, then the field asks for it and nothing is sent', async () => {
      await clickButton('Povolit');

      expect(element('#connect-app-code').getAttribute('aria-invalid')).toBe('true');
      expect(root().textContent).toContain('Opište prosím kód z aplikace.');
      expect(document.activeElement).toBe(element('#connect-app-code'));
      http.expectNone('/api/donors/oauth/authorize');
    });

    it('and allows the connection, then the decision goes to the API and the browser leaves for the application', async () => {
      await typeCode(' 123456 ');
      await clickButton('Povolit');

      const request = http.expectOne({ method: 'POST', url: '/api/donors/oauth/authorize' });
      expect(request.request.body).toEqual({
        clientId: CLIENT_ID,
        redirectUri: REDIRECT,
        responseType: 'code',
        codeChallenge: QUERY.code_challenge,
        codeChallengeMethod: 'S256',
        scope: 'admin:read',
        resource: 'http://localhost:4200/mcp',
        state: 'xyz',
        approved: true,
        secondFactorCode: '123456',
      });
      expect(element<HTMLButtonElement>('.ui-button--primary').disabled).toBe(true);
      expect(element('.ui-button--primary').textContent).toContain('Povoluji…');
      request.flush({
        redirectTo: `${REDIRECT}?code=abc&state=xyz&iss=http%3A%2F%2Flocalhost%3A4200`,
      });
      await settle();

      expect(navigation.assigned).toEqual([
        `${REDIRECT}?code=abc&state=xyz&iss=http%3A%2F%2Flocalhost%3A4200`,
      ]);
      expect(element('h1').textContent).toContain('Vracíme vás do aplikace');
    });

    it('and ticks the changes before allowing, then both permissions go to the API', async () => {
      element<HTMLInputElement>('#connect-app-write').click();
      await settle();
      expect(element<HTMLInputElement>('#connect-app-write').checked).toBe(true);

      await typeCode('123456');
      await clickButton('Povolit');

      const request = http.expectOne({ method: 'POST', url: '/api/donors/oauth/authorize' });
      expect(request.request.body).toMatchObject({
        scope: 'admin:read admin:write',
        approved: true,
      });
      request.flush({ redirectTo: `${REDIRECT}?code=abc&state=xyz` });
      await settle();
    });

    it('and declines, then the API is told and the browser leaves with the error for the application', async () => {
      await clickButton('Odmítnout');

      const request = http.expectOne({ method: 'POST', url: '/api/donors/oauth/authorize' });
      expect(request.request.body).toMatchObject({ approved: false });
      request.flush({ redirectTo: `${REDIRECT}?error=access_denied&state=xyz` });
      await settle();

      expect(navigation.assigned).toEqual([`${REDIRECT}?error=access_denied&state=xyz`]);
    });

    it('and the code is refused, then the consent stays with the reason and the code selected for a new one', async () => {
      await typeCode('123456');
      await clickButton('Povolit');
      http
        .expectOne({ method: 'POST', url: '/api/donors/oauth/authorize' })
        .flush(
          problem(
            'donors/second-factor-code-rejected',
            'Nesprávný kód',
            'Zadejte prosím aktuální kód z ověřovací aplikace; každý kód platí jen jednou.',
          ),
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();

      expect(element('h1').textContent).toContain('Povolit přístup ke správě aplikaci');
      expect(element('[role="alert"]').textContent).toContain('Nesprávný kód');
      const field = element<HTMLInputElement>('#connect-app-code');
      expect(field.value).toBe('123456');
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, 6]);
      expect(root().textContent).not.toContain('Opište');
      expect(navigation.assigned).toEqual([]);
    });

    it('and the server refuses the request, then the page shows the reason', async () => {
      await typeCode('123456');
      await clickButton('Povolit');
      http
        .expectOne({ method: 'POST', url: '/api/donors/oauth/authorize' })
        .flush(
          problem(
            'donors/invalid-authorization-request',
            'Neplatná žádost o připojení',
            'Žádost aplikace neodpovídá tomu, co web umožňuje.',
          ),
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();

      expect(element('h1').textContent).toContain('Aplikaci se nepodařilo připojit');
      expect(element('[role="alert"]').textContent).toContain('Neplatná žádost o připojení');
      expect(navigation.assigned).toEqual([]);
    });
  });

  describe('when an administrator who uses a passkey as the second factor is signed in', () => {
    beforeEach(async () => {
      await configure(QUERY, { roles: ['DONOR', 'ADMIN'] }, true);
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      await settle();
    });

    it('and allows with the passkey, then the passkey answer goes with the decision', async () => {
      expect(element('#connect-app-code')).toBeNull();

      await clickButton('Povolit přístupovým klíčem');
      http
        .expectOne({ method: 'POST', url: '/api/donors/auth/passkey/options' })
        .flush(passkeySignInOptions());
      await settle();

      const request = http.expectOne({ method: 'POST', url: '/api/donors/oauth/authorize' });
      expect(request.request.body).toMatchObject({
        approved: true,
        passkey: { challenge: SAMPLE_CHALLENGE, credential: SAMPLE_ASSERTION },
      });
      expect(request.request.body.secondFactorCode).toBeUndefined();
      request.flush({ redirectTo: `${REDIRECT}?code=abc&state=xyz` });
      await settle();

      expect(navigation.assigned).toEqual([`${REDIRECT}?code=abc&state=xyz`]);
    });

    it('and the device does not confirm, then the consent stays and says so', async () => {
      passkeys.failure = 'cancelled';

      await clickButton('Povolit přístupovým klíčem');
      http
        .expectOne({ method: 'POST', url: '/api/donors/auth/passkey/options' })
        .flush(passkeySignInOptions());
      await settle();

      http.expectNone('/api/donors/oauth/authorize');
      expect(element('[role="alert"]').textContent).toContain('Zařízení připojení nepotvrdilo');
      expect(element<HTMLButtonElement>('.ui-button--primary').disabled).toBe(false);
    });
  });

  describe('when a signed-in donor without the administrator role opens it', () => {
    beforeEach(async () => {
      await configure(QUERY, {});
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      await settle();
    });

    it('then the page offers to sign in with another account and continues to the consent', async () => {
      await clickButton('Přihlásit se jiným účtem');
      http
        .expectOne('/api/donors/auth/logout')
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(store.signedIn()).toBe(false);
      expect(dialog.isOpen()).toBe(true);
      expect(element('h1').textContent).toContain('Aplikace žádá o přístup ke správě');

      store.login('jana@example.cz', 'correct horse battery').subscribe();
      http
        .expectOne('/api/donors/auth/login')
        .flush(authResponse('token-2', sampleDonor(ADMIN_WITH_CODE)));
      await settle();
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      await settle();

      expect(element('h1').textContent).toContain('Povolit přístup ke správě aplikaci claude.ai?');
    });

    it('then the page explains that only an administrator can connect and offers to decline', async () => {
      expect(element('h1').textContent).toContain('Připojit aplikaci může jen správce');
      expect(element('.ui-panel__lead').textContent).toContain('claude.ai');
      expect(root().textContent).not.toContain('Povolit');
      expect(element('.ui-button--primary').textContent).toContain('Přihlásit se jiným účtem');

      await clickButton('Odmítnout');
      const request = http.expectOne({ method: 'POST', url: '/api/donors/oauth/authorize' });
      expect(request.request.body).toMatchObject({ approved: false });
      request.flush({ redirectTo: `${REDIRECT}?error=access_denied&state=xyz` });
      await settle();

      expect(navigation.assigned).toEqual([`${REDIRECT}?error=access_denied&state=xyz`]);
    });
  });

  describe('when the application is unknown or asks for a permission the site does not offer', () => {
    it('then an unknown application is reported with the reason from the server and a retry', async () => {
      await configure(QUERY, { roles: ['DONOR', 'ADMIN'] });
      http
        .expectOne(CLIENT_URL)
        .flush(
          problem(
            'donors/invalid-client',
            'Aplikaci nelze ověřit',
            'Dokument se nepodařilo načíst.',
          ),
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();

      expect(element('h1').textContent).toContain('Aplikaci se nepodařilo připojit');
      expect(element('[role="alert"]').textContent).toContain('Aplikaci nelze ověřit');

      await clickButton('Zkusit znovu');
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      await settle();

      expect(element('h1').textContent).toContain('Povolit přístup ke správě aplikaci');
    });

    it('then an administrator with the code and a browser with passkeys but no passkey of their own confirms with the code', async () => {
      await configure(QUERY, ADMIN_WITH_CODE, true);
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      http.expectOne('/api/donors/me/passkeys').flush({ items: [] });
      await settle();

      expect(element('#connect-app-code')).not.toBeNull();
      const labels = Array.from(root().querySelectorAll('form button')).map((button) =>
        button.textContent?.trim(),
      );
      expect(labels).toEqual(['Povolit přístupovým klíčem', 'Povolit', 'Odmítnout']);
    });

    it('then an administrator with the code and a passkey is offered the passkey first and the code on request', async () => {
      await configure(QUERY, ADMIN_WITH_CODE, true);
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      http.expectOne('/api/donors/me/passkeys').flush({ items: [samplePasskey()] });
      await settle();

      expect(element('#connect-app-code')).toBeNull();
      expect(element('.confirm-note').textContent?.trim()).toBe(
        'Povolení potvrďte svým přístupovým klíčem, i když jste se jím už přihlásili.',
      );
      const labels = Array.from(root().querySelectorAll('form button')).map((button) =>
        button.textContent?.trim(),
      );
      expect(labels).toEqual(['Zadat kód z aplikace', 'Povolit přístupovým klíčem', 'Odmítnout']);

      await clickButton('Zadat kód z aplikace');
      expect(document.activeElement).toBe(element('#connect-app-code'));
      await typeCode('654321');
      element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
      await settle();
      const request = http.expectOne({ method: 'POST', url: '/api/donors/oauth/authorize' });
      expect(request.request.body.secondFactorCode).toBe('654321');
    });

    it('then an administrator with the code and a passkey allows with the passkey by the main button', async () => {
      await configure(QUERY, ADMIN_WITH_CODE, true);
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      http.expectOne('/api/donors/me/passkeys').flush({ items: [samplePasskey()] });
      await settle();

      element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
      await settle();
      http
        .expectOne({ method: 'POST', url: '/api/donors/auth/passkey/options' })
        .flush(passkeySignInOptions());
      await settle();

      const request = http.expectOne({ method: 'POST', url: '/api/donors/oauth/authorize' });
      expect(request.request.body.passkey).toEqual({
        challenge: SAMPLE_CHALLENGE,
        credential: SAMPLE_ASSERTION,
      });
    });

    it('then an application asking for reading only gets no choice of changes', async () => {
      await configure({ ...QUERY, scope: 'admin:read' }, { roles: ['DONOR', 'ADMIN'] });
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      await settle();

      expect(element('#connect-app-write')).toBeNull();
      expect(element('.scope-hint')).toBeNull();
      expect(root().querySelectorAll('.scopes li')).toHaveLength(5);
      expect(element('.write-scopes')).toBeNull();
    });

    it('then an unknown permission disables Povolit and says why', async () => {
      await configure({ ...QUERY, scope: 'admin:delete' }, { roles: ['DONOR', 'ADMIN'] });
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      await settle();

      expect(element<HTMLButtonElement>('.ui-button--primary').disabled).toBe(true);
      expect(element('[role="alert"]').textContent).toContain('oprávnění, které web nenabízí');
      expect(
        element<HTMLButtonElement>('.ui-button--block:not(.ui-button--primary)').disabled,
      ).toBe(false);
    });

    it('then an application on this computer is named as such', async () => {
      await configure(
        {
          ...QUERY,
          client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
          redirect_uri: 'http://localhost:3118/callback',
        },
        { roles: ['DONOR', 'ADMIN'] },
      );
      http
        .expectOne((request) => request.url === '/api/donors/oauth/client')
        .flush({ host: 'claude.ai', name: 'Claude Code', loopback: true });
      await settle();

      expect(element('.ui-panel__lead').textContent).toContain('Běží na tomto počítači');
    });
  });

  describe('when the address lacks the application or its redirect', () => {
    it('then the page says the request is incomplete and asks nothing of the server', async () => {
      await configure({ client_id: CLIENT_ID });

      expect(element('h1').textContent).toContain('Žádost o připojení je neúplná');
      http.expectNone((request) => request.url.startsWith('/api/donors/oauth'));
      expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    });
  });
});
