import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DiagnosticEvents } from '../diagnostics/diagnostic-events';
import { AuthStore, SESSION_HINT_KEY } from './auth-store';
import { PasskeyAuthenticator } from './passkey-authenticator';
import { APP_JAR, BROWSER_JAR, SESSION_JAR, SessionJar, SessionKind } from './session-jar';
import { TAB_LOCKS } from './session-tabs';
import { FakeTabLocks } from './testing/fake-session-tabs';
import { authResponse, FakePasskeyAuthenticator, sampleDonor } from './testing/donor-fixtures';

describe('Given the kinds of session in the auth store', () => {
  let store: AuthStore;
  let http: HttpTestingController;
  let locks: FakeTabLocks;

  function setUp(jar: SessionJar): void {
    localStorage.clear();
    sessionStorage.clear();
    locks = new FakeTabLocks();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PasskeyAuthenticator, useValue: new FakePasskeyAuthenticator() },
        { provide: SESSION_JAR, useValue: jar },
        { provide: TAB_LOCKS, useValue: locks },
      ],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  }

  function answered(session: SessionKind) {
    return { ...authResponse('token-1'), session };
  }

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  describe('when the page is the installed app', () => {
    beforeEach(() => setUp(APP_JAR));

    it('then a sign-in asks for the app session whatever was chosen and keeps the app hint apart from the browser', () => {
      store.login('jana@example.cz', 'correct horse battery', 'PUBLIC').subscribe();
      const request = http.expectOne('/api/donors/auth/login');

      expect(request.request.body.session).toBe('APP');
      request.flush(answered('APP'));
      expect(store.session()).toBe('APP');
      expect(localStorage.getItem(APP_JAR.hintKey)).toBe('1');
      expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    });

    it('then a refresh and a sign-out name the app session and take the app lock', async () => {
      localStorage.setItem(APP_JAR.hintKey, '1');

      const restored = store.restore();
      const refresh = await vi.waitFor(() => http.expectOne('/api/donors/auth/refresh'));
      expect(refresh.request.headers.get('Nfnn-Session')).toBe('APP');
      expect(locks.requested).toEqual([APP_JAR.lockName]);
      refresh.flush(answered('APP'));
      await restored;

      store.logout().subscribe();
      const logout = await vi.waitFor(() => http.expectOne('/api/donors/auth/logout'));
      expect(logout.request.headers.get('Nfnn-Session')).toBe('APP');
      logout.flush(null);
      expect(localStorage.getItem(APP_JAR.hintKey)).toBeNull();
    });
  });

  describe('when the page is a browser tab', () => {
    beforeEach(() => setUp(BROWSER_JAR));

    it('then a refresh sends no session header and takes the browser lock', async () => {
      localStorage.setItem(SESSION_HINT_KEY, '1');

      const restored = store.restore();
      await vi.waitFor(() => expect(locks.requested).toContain(BROWSER_JAR.lockName));
      const request = await vi.waitFor(() => http.expectOne('/api/donors/auth/refresh'));

      expect(request.request.headers.has('Nfnn-Session')).toBe(false);
      request.flush(answered('BROWSER'));
      await restored;
      expect(store.session()).toBe('BROWSER');
    });

    it('then a sign-in on a public computer keeps its hint only for the tab and says nothing is to be stored', () => {
      store.login('jana@example.cz', 'correct horse battery', 'PUBLIC').subscribe();
      http.expectOne('/api/donors/auth/login').flush(answered('PUBLIC'));

      expect(store.storesNothing()).toBe(true);
      expect(sessionStorage.getItem(SESSION_HINT_KEY)).toBe('1');
      expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    });

    it('then a public computer restores its session in the same tab from the tab hint', async () => {
      sessionStorage.setItem(SESSION_HINT_KEY, '1');

      const restored = store.restore();
      const request = await vi.waitFor(() => http.expectOne('/api/donors/auth/refresh'));
      request.flush(answered('PUBLIC'));
      await restored;

      expect(store.signedIn()).toBe(true);
    });

    it('then signing out forgets both hints', () => {
      store.login('jana@example.cz', 'correct horse battery', 'PUBLIC').subscribe();
      http.expectOne('/api/donors/auth/login').flush(answered('PUBLIC'));

      store.logout().subscribe();
      return vi
        .waitFor(() => http.expectOne('/api/donors/auth/logout'))
        .then((request) => {
          request.flush(null);
          expect(sessionStorage.getItem(SESSION_HINT_KEY)).toBeNull();
          expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
          expect(store.session()).toBeNull();
        });
    });
  });

  describe('when the page holds diagnostic events of a donor', () => {
    let events: DiagnosticEvents;

    beforeEach(() => {
      setUp(BROWSER_JAR);
      events = TestBed.inject(DiagnosticEvents);
      store.login('jana@example.cz', 'correct horse battery', 'BROWSER').subscribe();
      http.expectOne('/api/donors/auth/login').flush(answered('BROWSER'));
      events.record({ kind: 'copy-sync', place: null, name: null, detail: 'stored' });
    });

    it('then signing out forgets them, so the next file of this page carries none of them', async () => {
      store.logout().subscribe();
      (await vi.waitFor(() => http.expectOne('/api/donors/auth/logout'))).flush(null);

      expect(events.listed()).toEqual([]);
    });

    it('then another account signing in forgets them', () => {
      store.login('petr@example.cz', 'correct horse battery', 'BROWSER').subscribe();
      http.expectOne('/api/donors/auth/login').flush({
        ...authResponse('token-2', sampleDonor({ id: 'donor-2', email: 'petr@example.cz' })),
        session: 'BROWSER',
      });

      expect(events.listed()).toEqual([]);
    });

    it('then a page that starts without a session keeps what it recorded before it knew', async () => {
      TestBed.resetTestingModule();
      setUp(BROWSER_JAR);
      events = TestBed.inject(DiagnosticEvents);
      events.record({ kind: 'chunk-load', place: 'navigation', name: 'Error', detail: null });
      localStorage.setItem(SESSION_HINT_KEY, '1');

      const restored = store.restore();
      (await vi.waitFor(() => http.expectOne('/api/donors/auth/refresh'))).flush(
        { status: 401 },
        { status: 401, statusText: 'Unauthorized' },
      );
      await restored;

      expect(events.listed()).toHaveLength(1);
    });

    it('then the same account renewing its session keeps them', () => {
      store.login('jana@example.cz', 'correct horse battery', 'BROWSER').subscribe();
      http.expectOne('/api/donors/auth/login').flush(answered('BROWSER'));

      expect(events.listed()).toHaveLength(1);
    });
  });
});
