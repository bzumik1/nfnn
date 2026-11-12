import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AdministrationAccess } from '../auth/administration-access';
import { AuthStore } from '../auth/auth-store';
import { PasskeyAuthenticator } from '../auth/passkey-authenticator';
import {
  authResponse,
  FakePasskeyAuthenticator,
  sampleDonor,
} from '../auth/testing/donor-fixtures';
import { Connectivity } from '../connectivity/connectivity';
import { leaks, textDump } from '../device/store/testing/raw-scan';
import { ErrorReporter } from '../errors/error-reporter';
import {
  BOOT_LAST_ATTEMPT_KEY,
  CODE_ARRIVED_ATTRIBUTE,
  STARTED_ATTRIBUTE,
} from '../updates/boot-report';
import { DEVICE_COPY_DIAGNOSTICS, DeviceCopyDiagnostics } from './device-copy-diagnostics';
import { Diagnostics, DIAGNOSTICS_NAVIGATOR } from './diagnostics';
import { DiagnosticsFile, sanitizedDiagnostics } from './diagnostics-schema';

const CHROME_WITH_CANARY =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Kanarek-UA-7781';

const CANARIES = {
  path: 'kanarek-cesta-7781',
  query: 'kanarek-dotaz-7781',
  fragment: 'kanarek-fragment-7781',
  title: 'Kanárek titulek 7781',
  cookie: 'kanarek-susenka-7781',
  local: 'kanarek-local-7781',
  session: 'kanarek-session-7781',
  name: 'Zlatohlávek Kanárkový',
  email: 'kanarek.7781@example.cz',
  error: 'Kanárek chyba 7781',
  httpUrl: 'kanarek-url-7781',
  httpBody: 'kanarek-telo-7781',
  agent: 'Kanarek-UA-7781',
  cache: 'kanarek-cache-7781',
  scope: 'kanarek-scope-7781',
  script: 'kanarek-skript-7781',
  copy: 'kanarek-kopie-7781',
  referrer: 'kanarek-referrer-7781',
};

class FakeConnectivity {
  readonly offline = signal(false);
  readonly cause = signal<'network' | 'server' | null>(null);
  browserSaysOffline(): boolean {
    return false;
  }
}

function fileText(file: DiagnosticsFile): string {
  return JSON.stringify(file);
}

describe('Given the diagnostic file of this browser', () => {
  let http: HttpTestingController;
  let deviceCopy: ReturnType<typeof vi.fn<() => Promise<DeviceCopyDiagnostics | null>>>;
  let diagnostics: Diagnostics;
  let connectivity: FakeConnectivity;
  let access: { unlocked: ReturnType<typeof signal<boolean>> };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T14:03:20Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    );
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(CHROME_WITH_CANARY);
    sessionStorage.clear();
    localStorage.clear();
    connectivity = new FakeConnectivity();
    access = { unlocked: signal(false) };
    deviceCopy = vi.fn(() =>
      Promise.resolve({
        mode: 'stored',
        donorCopy: 'open',
        storedAge: 'under-1d',
        administrationCopy: 'none',
      } as DeviceCopyDiagnostics),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PasskeyAuthenticator, useValue: new FakePasskeyAuthenticator() },
        { provide: Connectivity, useValue: connectivity },
        {
          provide: AdministrationAccess,
          useValue: { ...access, signedIn: () => undefined, ended: () => undefined },
        },
        { provide: DEVICE_COPY_DIAGNOSTICS, useValue: deviceCopy },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    diagnostics = TestBed.inject(Diagnostics);
    document.documentElement.setAttribute(STARTED_ATTRIBUTE, '');
    document.documentElement.setAttribute(CODE_ARRIVED_ATTRIBUTE, '');
    history.replaceState(null, '', '/darce/udaje');
  });

  afterEach(() => {
    http.verify();
    document.documentElement.removeAttribute(STARTED_ATTRIBUTE);
    document.documentElement.removeAttribute(CODE_ARRIVED_ATTRIBUTE);
    history.replaceState(null, '', '/');
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function signIn(session: 'BROWSER' | 'PUBLIC', roles: string[] = ['DONOR']): void {
    TestBed.inject(AuthStore).login(CANARIES.email, 'heslo', session).subscribe();
    http.expectOne('/api/donors/auth/login').flush({
      ...authResponse(
        'token-kanarek',
        sampleDonor({ name: CANARIES.name, email: CANARIES.email, roles }),
      ),
      session,
    });
  }

  it('when it is made on a page of a signed-in donor, then it carries the closed state of the app and nothing else', async () => {
    signIn('BROWSER');
    TestBed.inject(ErrorReporter).report('pdf-render', 'global', new TypeError('x'), 'drawing');
    sessionStorage.setItem('nfnn.reload.chunk-load', String(Date.now() - 125_000));

    const file = await diagnostics.file('account-page');

    expect(file).toEqual(sanitizedDiagnostics(file));
    expect(file).toMatchObject({
      format: 'nfnn-diagnostics',
      version: 1,
      createdAt: '2026-11-06T14:03Z',
      source: 'account-page',
      app: { revision: 'dev', bundle: null, started: true, codeArrived: true },
      platform: { browser: 'chrome', browserMajor: 131, os: 'macos', display: 'browser' },
      page: '/darce/udaje',
      network: { browserOnline: true, appOffline: false, offlineCause: null },
      reloads: { boot: null, 'chunk-load': 125, update: null, unrecoverable: null },
      boot: { recovered: false, previous: null },
      session: { account: 'donor', kind: 'BROWSER', administrationUnlocked: null },
      deviceCopy: {
        mode: 'stored',
        donor: 'open',
        storedAge: 'under-1d',
        administration: 'none',
      },
      events: [
        {
          secondsAgo: 0,
          kind: 'pdf-render',
          place: 'global',
          name: 'TypeError',
          detail: 'drawing',
        },
      ],
    });
  });

  it('when canaries sit in every place a page keeps data, then none of them reaches the file, plain, URL-encoded, in base64 or hex', async () => {
    history.replaceState(
      null,
      '',
      `/darce/udaje/${CANARIES.path}?token=${CANARIES.query}#${CANARIES.fragment}`,
    );
    document.title = CANARIES.title;
    document.cookie = `nfnn.kanarek=${CANARIES.cookie}`;
    localStorage.setItem('nfnn.kanarek', CANARIES.local);
    sessionStorage.setItem('nfnn.kanarek', CANARIES.session);
    sessionStorage.setItem('nfnn.reload.update', CANARIES.session);
    sessionStorage.setItem(
      BOOT_LAST_ATTEMPT_KEY,
      JSON.stringify({
        panelShown: CANARIES.session,
        at: CANARIES.session,
        message: CANARIES.session,
      }),
    );
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(CANARIES.referrer);
    signIn('BROWSER', ['DONOR', 'ADMIN']);
    const reporter = TestBed.inject(ErrorReporter);
    reporter.report('unexpected', 'global', new Error(CANARIES.error));
    reporter.report(
      'unexpected',
      'navigation',
      new HttpErrorResponse({ url: CANARIES.httpUrl, error: CANARIES.httpBody, status: 500 }),
    );
    deviceCopy.mockResolvedValue({
      mode: 'stored',
      donorCopy: 'open',
      storedAge: 'under-1h',
      administrationCopy: 'open',
      email: CANARIES.copy,
    } as unknown as DeviceCopyDiagnostics);
    vi.stubGlobal('caches', { keys: () => Promise.resolve([CANARIES.cache]) });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: { scriptURL: CANARIES.script },
        getRegistrations: () =>
          Promise.resolve([
            { scope: CANARIES.scope, active: { scriptURL: CANARIES.script }, waiting: null },
          ]),
      },
    });

    const dump = textDump(fileText(await diagnostics.file('account-page')));

    for (const [where, canary] of Object.entries(CANARIES)) {
      expect(leaks(dump, canary), where).toBe(false);
    }
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it('when the page is a receipt verification link or an app connection, then the proof and the connection parameters stay out', async () => {
    for (const address of [
      `/overit#${CANARIES.fragment}`,
      `/pripojeni?client_id=${CANARIES.query}&redirect_uri=https://${CANARIES.path}.example&state=${CANARIES.session}`,
    ]) {
      history.replaceState(null, '', address);

      const file = await diagnostics.file('account-page');
      const dump = textDump(fileText(file));

      for (const canary of [CANARIES.fragment, CANARIES.query, CANARIES.path, CANARIES.session]) {
        expect(leaks(dump, canary), address).toBe(false);
      }
      expect(['/overit', '/pripojeni']).toContain(file.page);
    }
  });

  it('when it is made, then the client hints of the browser are never read', async () => {
    const hints = vi.fn(() => ({ platform: 'x' }));
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, get: hints });

    await diagnostics.file('account-page');

    expect(hints).not.toHaveBeenCalled();
    delete (navigator as { userAgentData?: unknown }).userAgentData;
  });

  describe("when the donor signed in on someone else's computer", () => {
    beforeEach(() => signIn('PUBLIC', ['DONOR', 'ADMIN']));

    it('then the file names no role and nothing of the administration', async () => {
      access.unlocked.set(true);
      deviceCopy.mockResolvedValue({
        mode: 'memory',
        donorCopy: 'open',
        storedAge: 'under-1h',
        administrationCopy: 'open',
      });

      const file = await diagnostics.file('account-page');

      expect(file.session).toEqual({
        account: 'signed-in',
        kind: 'PUBLIC',
        administrationUnlocked: null,
      });
      expect(file.deviceCopy?.administration).toBeNull();
    });

    it('then making the file writes nothing to Web Storage, a cookie or IndexedDB', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
      const cookie = vi.spyOn(document, 'cookie', 'set');
      const open = vi.fn();
      vi.stubGlobal('indexedDB', { open });

      await diagnostics.file('account-page');

      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
      expect(cookie).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    });
  });

  it('when an administrator has the administration unlocked, then the file says so', async () => {
    signIn('BROWSER', ['DONOR', 'ADMIN']);
    access.unlocked.set(true);

    const file = await diagnostics.file('account-page');

    expect(file.session).toEqual({
      account: 'administrator',
      kind: 'BROWSER',
      administrationUnlocked: true,
    });
  });

  it('when nobody is signed in and the vault never loaded, then the session says none and the copy is unknown', async () => {
    deviceCopy.mockResolvedValue(null);
    TestBed.inject(AuthStore);

    const file = await diagnostics.file('receipt-pdf');

    expect(file.session?.account).toBe('unknown');
    expect(file.deviceCopy).toBeNull();
  });

  it('when the watchdog kept a failed start of this tab, then the file carries it with its age', async () => {
    sessionStorage.setItem(
      BOOT_LAST_ATTEMPT_KEY,
      JSON.stringify({
        panelShown: true,
        codeArrived: false,
        waitedSeconds: 15,
        at: Date.now() - 40_000,
      }),
    );

    const file = await diagnostics.file('account-page');

    expect(file.boot?.previous).toEqual({
      panelShown: true,
      codeArrived: false,
      waitedSeconds: 15,
      secondsAgo: 40,
    });
  });

  it.each([
    ['too long', `{"panelShown":true,"x":"${'a'.repeat(600)}"}`],
    ['not JSON', '{panelShown'],
    [
      'from the future',
      JSON.stringify({
        panelShown: true,
        codeArrived: false,
        waitedSeconds: 15,
        at: Date.now() + 60_000,
      }),
    ],
  ])('when the kept start is %s, then the file has no previous start', async (_label, stored) => {
    sessionStorage.setItem(BOOT_LAST_ATTEMPT_KEY, stored);

    expect((await diagnostics.file('account-page')).boot?.previous).toBeNull();
  });

  it('when the storage of the browser is almost full and kept, then the file says only that', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: () => Promise.resolve(true),
        estimate: () => Promise.resolve({ usage: 980 * 1024 * 1024, quota: 1024 * 1024 * 1024 }),
      },
    });

    const file = await diagnostics.file('account-page');

    expect(file.storage).toEqual({ persisted: true, nearlyFull: true });
    expect(fileText(file)).not.toMatch(/1073741824|1027604480|980/);
    delete (navigator as { storage?: unknown }).storage;
  });

  it('when a browser API never answers, then the file is still made within a few seconds', async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: () => new Promise(() => undefined),
        estimate: () => new Promise(() => undefined),
      },
    });

    const made = diagnostics.file('account-page');
    await vi.advanceTimersByTimeAsync(3_000);

    expect((await made).storage).toEqual({ persisted: null, nearlyFull: null });
    delete (navigator as { storage?: unknown }).storage;
  });

  it('when it is prepared and saved, then a JSON file named by the minute is saved through a revoked blob address', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:nfnn/1');
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
    vi.useRealTimers();

    const prepared = await diagnostics.prepare('account-page');
    diagnostics.save(prepared);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(prepared.fileName).toMatch(/^nfnn-diagnostika-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe(prepared.fileName);
    expect(clicks[0].isConnected).toBe(false);
    const blob = created.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toMatchObject({ format: 'nfnn-diagnostics' });
    expect(revoked).toHaveBeenCalledWith('blob:nfnn/1');
  });
});

describe('Given the diagnostic file on an iPhone, an iPad or a computer', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
  const file = {
    blob: new Blob(['{}'], { type: 'application/json' }),
    fileName: 'nfnn-diagnostika-2026-11-06-1403.json',
  };
  let shared: ShareData[];
  let shareAnswer: () => Promise<void>;

  function delivery(userAgent: string, maxTouchPoints: number, canShare = true): Diagnostics {
    shared = [];
    shareAnswer = () => Promise.resolve();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: DIAGNOSTICS_NAVIGATOR,
          useValue: {
            userAgent,
            maxTouchPoints,
            canShare: () => canShare,
            share: (data: ShareData) => {
              shared.push(data);
              return shareAnswer();
            },
          },
        },
      ],
    });
    return TestBed.inject(Diagnostics);
  }

  it.each([
    ['an iPhone that can share files', IPHONE, 0, true, true],
    ['an iPad that says Macintosh', MAC, 5, true, true],
    ['a Mac', MAC, 0, true, false],
    ['an iPhone that cannot share files', IPHONE, 0, false, false],
  ])(
    'when it is %s, then a second tap that shares the file is %s',
    (_label, agent, touches, canShare, needed) => {
      expect(delivery(agent, touches, canShare).needsSecondTap(file)).toBe(needed);
    },
  );

  it('when it is shared, then the share sheet gets the JSON file under its name', async () => {
    const outcome = await delivery(IPHONE, 0).share(file);

    expect(outcome).toBe('shared');
    expect(shared).toHaveLength(1);
    const sharedFile = shared[0].files![0];
    expect(sharedFile.name).toBe(file.fileName);
    expect(sharedFile.type).toBe('application/json');
    expect(shared[0].text).toBeUndefined();
    expect(shared[0].url).toBeUndefined();
  });

  it.each([
    ['the visitor closes the share sheet', 'AbortError', 'dismissed'],
    ['the share fails', 'NotAllowedError', 'failed'],
  ])('when %s, then the outcome says so', async (_label, name, outcome) => {
    const diagnostics = delivery(IPHONE, 0);
    shareAnswer = () => Promise.reject(new DOMException('no', name));

    expect(await diagnostics.share(file)).toBe(outcome);
  });
});
