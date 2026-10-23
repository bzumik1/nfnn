import { HttpRequest, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore, SESSION_HINT_KEY } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, problem, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
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

  async function configure(
    query: Record<string, string>,
    signedInAs?: Parameters<typeof sampleDonor>[0],
  ) {
    localStorage.clear();
    navigation = new FakeNavigation();
    await TestBed.configureTestingModule({
      imports: [ConnectApp],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ExternalNavigation, useValue: navigation },
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
      expect(element('.lead').textContent).toContain('účtem správce');
      http.expectNone(CLIENT_URL);

      element<HTMLButtonElement>('.form-submit').click();

      expect(dialog.isOpen()).toBe(true);
      expect(dialog.staysOnPage()).toBe(true);
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
      expect(element('.lead').textContent).toContain('„Claude“');
      expect(element('.lead').textContent).toContain('Jana Nováková');
      expect(Array.from(root().querySelectorAll('.scopes li')).map((li) => li.textContent)).toEqual(
        [expect.stringContaining('Čtení:'), expect.stringContaining('Změny:')],
      );
      expect(document.activeElement).toBe(element('h1'));
    });
  });

  describe('when an administrator is signed in', () => {
    beforeEach(async () => {
      await configure(QUERY, { roles: ['DONOR', 'ADMIN'] });
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      await settle();
    });

    it('and allows the connection, then the decision goes to the API and the browser leaves for the application', async () => {
      await clickButton('Povolit');

      const request = http.expectOne({ method: 'POST', url: '/api/donors/oauth/authorize' });
      expect(request.request.body).toEqual({
        clientId: CLIENT_ID,
        redirectUri: REDIRECT,
        responseType: 'code',
        codeChallenge: QUERY.code_challenge,
        codeChallengeMethod: 'S256',
        scope: 'admin:read admin:write',
        resource: 'http://localhost:4200/mcp',
        state: 'xyz',
        approved: true,
      });
      expect(element<HTMLButtonElement>('.form-submit').disabled).toBe(true);
      expect(element('.form-submit').textContent).toContain('Povoluji…');
      request.flush({
        redirectTo: `${REDIRECT}?code=abc&state=xyz&iss=http%3A%2F%2Flocalhost%3A4200`,
      });
      await settle();

      expect(navigation.assigned).toEqual([
        `${REDIRECT}?code=abc&state=xyz&iss=http%3A%2F%2Flocalhost%3A4200`,
      ]);
      expect(element('h1').textContent).toContain('Vracíme vás do aplikace');
    });

    it('and declines, then the API is told and the browser leaves with the error for the application', async () => {
      await clickButton('Odmítnout');

      const request = http.expectOne({ method: 'POST', url: '/api/donors/oauth/authorize' });
      expect(request.request.body).toMatchObject({ approved: false });
      request.flush({ redirectTo: `${REDIRECT}?error=access_denied&state=xyz` });
      await settle();

      expect(navigation.assigned).toEqual([`${REDIRECT}?error=access_denied&state=xyz`]);
    });

    it('and the server refuses the request, then the consent shows the reason and stays', async () => {
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

  describe('when a signed-in donor without the administrator role opens it', () => {
    beforeEach(async () => {
      await configure(QUERY, {});
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      await settle();
    });

    it('then the page explains that only an administrator can connect and offers to decline', async () => {
      expect(element('h1').textContent).toContain('Připojit aplikaci může jen správce');
      expect(element('.lead').textContent).toContain('claude.ai');
      expect(root().textContent).not.toContain('Povolit');

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

    it('then an unknown permission disables Povolit and says why', async () => {
      await configure({ ...QUERY, scope: 'admin:delete' }, { roles: ['DONOR', 'ADMIN'] });
      http.expectOne(CLIENT_URL).flush(CLAUDE);
      await settle();

      expect(element<HTMLButtonElement>('.form-submit').disabled).toBe(true);
      expect(element('[role="alert"]').textContent).toContain('oprávnění, které web nenabízí');
      expect(element<HTMLButtonElement>('.form-secondary').disabled).toBe(false);
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

      expect(element('.lead').textContent).toContain('Běží na tomto počítači');
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
