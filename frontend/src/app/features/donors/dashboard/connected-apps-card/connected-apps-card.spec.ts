import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { authResponse, problem, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import { ConnectedAppsCard } from './connected-apps-card';

const CONNECTIONS_URL = '/api/donors/me/connections';
const CLAUDE_CONNECTION = {
  id: '0192f0f1-0000-7000-8000-000000000011',
  client: 'claude.ai',
  scopes: ['admin:read', 'admin:write'],
  grantedAt: '2026-10-23T06:00:00Z',
  lastUsedAt: '2026-10-23T09:30:00Z',
  expiresAt: '2026-11-06T09:30:00Z',
};

describe("Given an administrator's connected applications card", () => {
  let fixture: ComponentFixture<ConnectedAppsCard>;
  let http: HttpTestingController;
  let sessionEnded: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConnectedAppsCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(
      authResponse(
        'token-1',
        sampleDonor({
          roles: ['DONOR', 'ADMIN'],
          secondFactor: { enabled: true, neededForAdministration: false },
        }),
      ),
    );
    fixture = TestBed.createComponent(ConnectedAppsCard);
    sessionEnded = 0;
    fixture.componentInstance.sessionEnded.subscribe(() => sessionEnded++);
    await settle();
  });

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

  it('when the list is loading, then the card says so under its own heading', () => {
    expect(element('h2').textContent).toContain('Připojené aplikace');
    expect(element('.connections-empty').textContent).toContain('Načítáme připojené aplikace');
    http.expectOne(CONNECTIONS_URL).flush({ items: [] });
  });

  it('when no application is connected, then the card says so and how a connection starts', async () => {
    http.expectOne(CONNECTIONS_URL).flush({ items: [] });
    await settle();

    expect(element('.connections-empty').textContent).toContain('Žádná aplikace není připojená');
    expect(element('.connection')).toBeNull();
  });

  it('when Claude is connected, then the list names the host, the dates and the permissions', async () => {
    http.expectOne(CONNECTIONS_URL).flush({ items: [CLAUDE_CONNECTION] });
    await settle();

    expect(element('.connection-client').textContent).toBe('claude.ai');
    expect(element('.connection-dates').textContent?.replace(/\s+/g, ' ')).toContain(
      'připojeno 23. 10. 2026 · naposledy použito 23. 10. 2026',
    );
    expect(root().querySelectorAll('.connection-scopes li')).toHaveLength(2);
    expect(element('.connection-scopes').textContent).toContain('Čtení:');
    expect(element('.connection-scopes').textContent).toContain('Změny:');
  });

  it('when the administrator disconnects Claude, then the API is told, the row disappears and the status says so', async () => {
    http.expectOne(CONNECTIONS_URL).flush({ items: [CLAUDE_CONNECTION] });
    await settle();

    element<HTMLButtonElement>('.connection-disconnect').click();
    await settle();
    expect(element('.connection-disconnect').textContent).toContain('Odpojujeme…');
    http
      .expectOne({ method: 'DELETE', url: `${CONNECTIONS_URL}/${CLAUDE_CONNECTION.id}` })
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(element('.connection')).toBeNull();
    expect(element('.connections-empty').textContent).toContain('Žádná aplikace není připojená');
    expect(element('.connections-status').textContent).toContain('Aplikace claude.ai je odpojená');
  });

  it('when the list cannot be loaded, then the card shows the reason and offers to load again', async () => {
    http.expectOne(CONNECTIONS_URL).flush(problem('x', 'Server neodpovídá'), {
      status: 500,
      statusText: 'Server Error',
    });
    await settle();

    expect(element('[role="alert"]').textContent).toContain('Server neodpovídá');

    element<HTMLButtonElement>('.connections-retry').click();
    await settle();
    http.expectOne(CONNECTIONS_URL).flush({ items: [] });
    await settle();

    expect(element('[role="alert"]')).toBeNull();
    expect(element('.connections-empty')).not.toBeNull();
  });

  it('when the session has ended, then the details page is told to send the donor to sign in', async () => {
    http.expectOne(CONNECTIONS_URL).flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), {
      status: 401,
      statusText: 'Unauthorized',
    });
    await settle();

    expect(sessionEnded).toBe(1);
  });
});
