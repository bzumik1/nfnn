import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { importTs } from './ts-import.mjs';

const { DIAGNOSTIC_PAGES, sanitizedDiagnostics } = await importTs(
  '../src/app/core/diagnostics/diagnostics-schema.ts',
);
const { detectPlatform } = await importTs('../src/app/core/errors/client-platform.ts');
const { leaks, textDump } = await importTs('../src/app/core/device/store/testing/raw-scan.ts');

const SOURCE = readFileSync(new URL('../public/boot-guard.js', import.meta.url), 'utf8');
const BOOT_REPORT = readFileSync(
  new URL('../src/app/core/updates/boot-report.ts', import.meta.url),
  'utf8',
);
const TIMEOUT_MS = 15_000;
const START = Date.UTC(2026, 10, 5, 9, 0, 0);

class MemoryStorage {
  items = new Map();
  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }
  setItem(key, value) {
    this.items.set(key, String(value));
  }
  removeItem(key) {
    this.items.delete(key);
  }
}

const ORIGIN = 'https://nfnn.cz';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

function loadGuard({
  storage = new MemoryStorage(),
  online = true,
  now = START,
  path = '/',
  userAgent = IPHONE_SAFARI,
  maxTouchPoints = 5,
  html = '<app-root></app-root><script src="main-ABCD1234.js" type="module"></script>',
  workers = null,
  cacheNames = ['ngsw:/:db:control', 'ngsw:/:1:assets:app:cache'],
  estimate = { usage: 10 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 },
  share = null,
  objectUrlRefused = false,
} = {}) {
  const address = new URL(path, ORIGIN);
  const dom = new JSDOM(`<!doctype html><html lang="cs"><body>${html}</body></html>`, {
    url: address.href,
  });
  const timers = [];
  const calls = {
    reloads: 0,
    unregistered: 0,
    cachesDeleted: [],
    indexedDb: 0,
    saved: [],
    shared: [],
  };
  const registrations = workers ?? [
    { unregister: () => Promise.resolve(++calls.unregistered > 0) },
  ];
  const clock = { now };
  const window = {
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
    get sessionStorage() {
      if (storage === 'refused') {
        throw new Error('SecurityError');
      }
      return storage;
    },
    location: {
      reload: () => calls.reloads++,
      href: address.href,
      origin: address.origin,
      pathname: address.pathname,
    },
    caches: {
      keys: () => Promise.resolve(cacheNames),
      delete: (name) => {
        calls.cachesDeleted.push(name);
        return Promise.resolve(true);
      },
    },
    get indexedDB() {
      calls.indexedDb++;
      return {};
    },
    MutationObserver: dom.window.MutationObserver,
    File,
  };
  const navigator = {
    onLine: online,
    userAgent,
    maxTouchPoints,
    ...(share === null
      ? {}
      : {
          canShare: ({ files }) => files.every((file) => file instanceof File),
          share: (data) => {
            calls.shared.push(data);
            return share();
          },
        }),
    storage: {
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.resolve(estimate),
    },
    serviceWorker: {
      controller: {},
      getRegistrations: () => Promise.resolve(registrations),
    },
  };
  function DateAtClock(value) {
    return new Date(value);
  }
  DateAtClock.now = () => clock.now;
  const savingUrl = {
    createObjectURL: (blob) => {
      if (objectUrlRefused) {
        throw new Error('refused');
      }
      calls.saved.push({ blob });
      return `blob:${ORIGIN}/${calls.saved.length}`;
    },
    revokeObjectURL: (url) => {
      calls.saved.find((_, index) => url.endsWith(`/${index + 1}`)).revoked = true;
    },
  };
  function UrlInPage(input, base) {
    return new URL(input, base);
  }
  Object.assign(UrlInPage, savingUrl);
  dom.window.HTMLAnchorElement.prototype.click = function () {
    calls.saved.at(-1).name = this.download;
    calls.saved.at(-1).connected = this.isConnected;
  };
  runInNewContext(SOURCE, {
    window,
    document: dom.window.document,
    navigator,
    Promise,
    String,
    Number,
    Date: DateAtClock,
    URL: UrlInPage,
    Blob,
  });
  return {
    dom,
    storage,
    calls,
    timers,
    clock,
    fire() {
      for (const timer of timers.splice(0)) {
        timer.callback();
      }
    },
    start() {
      dom.window.document.documentElement.setAttribute('data-nfnn-started', '');
    },
    codeArrived() {
      dom.window.document.documentElement.setAttribute('data-nfnn-loading', '');
    },
    panel() {
      return dom.window.document.getElementById('nfnn-boot-panel');
    },
    pressDownload() {
      dom.window.document.querySelector('.nfnn-boot-diagnostics').click();
    },
    async savedFile() {
      const button = dom.window.document.querySelector('.nfnn-boot-diagnostics');
      button.click();
      const saved = calls.saved.at(-1);
      return { ...saved, text: await saved.blob.text() };
    },
  };
}

const settle = () => new Promise((done) => setImmediate(done));

describe('Given the boot watchdog and the app that marks its start', () => {
  for (const [watchdog, app] of [
    ['STARTED', 'STARTED_ATTRIBUTE'],
    ['CODE_ARRIVED', 'CODE_ARRIVED_ATTRIBUTE'],
  ]) {
    it(`when the attribute ${watchdog} is read, then the app sets the same one as ${app}`, () => {
      const watched = SOURCE.match(new RegExp(`var ${watchdog} = '([^']+)'`))?.[1];
      const set = BOOT_REPORT.match(new RegExp(`export const ${app} = '([^']+)'`))?.[1];
      assert.ok(watched);
      assert.equal(set, watched);
    });
  }
});

describe('Given the boot watchdog loaded before the app', () => {
  it('when it loads, then it waits fifteen seconds and does nothing before that', () => {
    const guard = loadGuard();

    assert.deepEqual(
      guard.timers.map((timer) => timer.delay),
      [TIMEOUT_MS],
    );
    assert.equal(guard.calls.reloads, 0);
    assert.equal(guard.panel(), null);
  });

  it('when the app started within the fifteen seconds, then nothing happens and nothing is stored', () => {
    const guard = loadGuard();
    guard.start();

    guard.fire();

    assert.equal(guard.calls.reloads, 0);
    assert.equal(guard.panel(), null);
    assert.deepEqual([...guard.storage.items.keys()], []);
  });

  it('when the app has not started after fifteen seconds, then the page reloads once and the next start is told to report it', () => {
    const guard = loadGuard();

    guard.fire();

    assert.equal(guard.calls.reloads, 1);
    assert.equal(guard.storage.getItem('nfnn.boot.recovered'), '1');
    assert.equal(guard.storage.getItem('nfnn.reload.boot'), String(START));
    assert.equal(guard.panel(), null);
  });

  it('when the reloaded page is stuck again within a minute, then it shows the panel instead of reloading again', () => {
    const storage = new MemoryStorage();
    storage.setItem('nfnn.reload.boot', String(START));
    const guard = loadGuard({ storage, now: START + 30_000 });

    guard.fire();

    assert.equal(guard.calls.reloads, 0);
    const panel = guard.panel();
    assert.notEqual(panel, null);
    assert.equal(panel.getAttribute('role'), 'alert');
    assert.equal(panel.querySelector('h1').textContent, 'Web se nenačetl');
    assert.equal(panel.querySelector('button').textContent, 'Vyčistit a načíst znovu');
  });

  it('when a minute has passed since the last automatic reload, then it may reload once more', () => {
    const storage = new MemoryStorage();
    storage.setItem('nfnn.reload.boot', String(START));
    const guard = loadGuard({ storage, now: START + 60_000 });

    guard.fire();

    assert.equal(guard.calls.reloads, 1);
  });

  it('when the browser is offline, then it shows the panel without reloading', () => {
    const guard = loadGuard({ online: false });

    guard.fire();

    assert.equal(guard.calls.reloads, 0);
    assert.notEqual(guard.panel(), null);
  });

  it('when the session storage is refused, then it never reloads by itself and shows the panel', () => {
    const guard = loadGuard({ storage: 'refused' });

    guard.fire();

    assert.equal(guard.calls.reloads, 0);
    assert.notEqual(guard.panel(), null);
  });

  it('when the code of the app arrived but its start still waits on the network, then it waits fifteen seconds more instead of reloading', () => {
    const guard = loadGuard();
    guard.codeArrived();

    guard.fire();

    assert.equal(guard.calls.reloads, 0);
    assert.equal(guard.panel(), null);
    assert.deepEqual(
      guard.timers.map((timer) => timer.delay),
      [TIMEOUT_MS],
    );
  });

  it('when the code of the app arrived and the start still has not ended after a minute, then it shows the panel without reloading', () => {
    const guard = loadGuard();
    guard.codeArrived();

    for (let round = 0; round < 4; round++) {
      guard.fire();
    }

    assert.equal(guard.calls.reloads, 0);
    assert.notEqual(guard.panel(), null);
    assert.equal(guard.storage.getItem('nfnn.boot.recovered'), '1');
  });

  it('when the panel is shown, then it scrolls when its text does not fit and its help line links the e-mail', () => {
    const guard = loadGuard({ online: false });
    guard.fire();

    const panel = guard.panel();
    assert.equal(panel.style.getPropertyValue('overflow-y'), 'auto');
    assert.equal(
      panel.querySelector('a').getAttribute('href'),
      'mailto:info@nfnn.cz?subject=Diagnostick%C3%BD%20soubor',
    );
  });

  it('when the panel button is pressed offline, then the page only reloads and keeps what the browser cached for offline use', async () => {
    const guard = loadGuard({ online: false });
    guard.fire();

    guard.panel().querySelector('button').click();
    await settle();

    assert.equal(guard.calls.unregistered, 0);
    assert.deepEqual(guard.calls.cachesDeleted, []);
    assert.equal(guard.calls.reloads, 1);
  });

  it('when the panel button is pressed, then the service workers and caches are cleared, IndexedDB is left alone and the page reloads', async () => {
    const storage = new MemoryStorage();
    storage.setItem('nfnn.reload.boot', String(START - 30_000));
    const guard = loadGuard({ storage });
    guard.fire();
    const button = guard.panel().querySelector('button');

    button.click();
    await settle();

    assert.equal(button.disabled, true);
    assert.equal(guard.calls.unregistered, 1);
    assert.deepEqual(guard.calls.cachesDeleted, ['ngsw:/:db:control', 'ngsw:/:1:assets:app:cache']);
    assert.equal(guard.calls.indexedDb, 0);
    assert.equal(guard.calls.reloads, 1);
  });

  it('when the app starts after the panel was shown, then the panel goes away', async () => {
    const guard = loadGuard({ online: false });
    guard.fire();

    guard.start();
    await settle();

    assert.equal(guard.panel(), null);
  });
});

describe('Given the boot watchdog showing its panel', () => {
  async function shownPanel(options) {
    const guard = loadGuard({ online: false, ...options });
    guard.fire();
    await settle();
    return guard;
  }

  it('when the panel shows, then it offers the diagnostic file and says it holds no personal data', async () => {
    const guard = await shownPanel();

    const download = guard.panel().querySelector('.nfnn-boot-diagnostics');
    assert.equal(download.textContent, 'Stáhnout diagnostický soubor');
    assert.equal(download.type, 'button');
    assert.match(guard.panel().textContent, /žádné vaše údaje ani hesla, a sám se nikam neodesílá/);
  });

  it('when the file is downloaded, then it is the file of the schema with the closed state of this start', async () => {
    const storage = new MemoryStorage();
    storage.setItem('nfnn.reload.boot', String(START - 30_000));
    storage.setItem(
      'nfnn.boot.last',
      JSON.stringify({
        panelShown: false,
        codeArrived: false,
        waitedSeconds: 15,
        at: START - 30_000,
      }),
    );
    const guard = await shownPanel({ storage, path: '/darce/potvrzeni' });

    const saved = await guard.savedFile();
    const file = JSON.parse(saved.text);

    assert.deepEqual(sanitizedDiagnostics(file), file);
    assert.match(saved.name, /^nfnn-diagnostika-2026-11-05-0900\.json$/);
    assert.equal(saved.blob.type, 'application/json');
    assert.equal(saved.connected, true);
    await settle();
    assert.equal(saved.revoked, undefined);
    guard.fire();
    assert.equal(guard.calls.saved.at(-1).revoked, true);
    assert.deepEqual(file, {
      format: 'nfnn-diagnostics',
      version: 1,
      createdAt: '2026-11-05T09:00Z',
      source: 'boot-panel',
      app: { revision: 'unknown', bundle: 'main-ABCD1234.js', started: false, codeArrived: false },
      platform: { browser: 'safari', browserMajor: 18, os: 'ios', display: 'browser' },
      page: '/darce',
      network: { browserOnline: false, appOffline: null, offlineCause: null },
      support: {
        serviceWorker: true,
        indexedDb: true,
        webLocks: false,
        broadcastChannel: false,
        subtleCrypto: false,
        webAuthn: false,
        webAssembly: true,
        storageManager: true,
        trustedTypes: false,
      },
      storage: { persisted: true, nearlyFull: false },
      serviceWorker: {
        controlled: true,
        registrations: 1,
        active: 0,
        waiting: 0,
        installing: 0,
        caches: 2,
      },
      reloads: { boot: 30, 'chunk-load': null, update: null, unrecoverable: null },
      boot: {
        recovered: true,
        previous: { panelShown: false, codeArrived: false, waitedSeconds: 15, secondsAgo: 30 },
      },
      session: null,
      deviceCopy: null,
      events: [],
    });
  });

  it('when the panel shows, then this start is kept for the next file of the tab, with closed values only', async () => {
    const guard = await shownPanel();

    assert.deepEqual(JSON.parse(guard.storage.getItem('nfnn.boot.last')), {
      panelShown: true,
      codeArrived: false,
      waitedSeconds: 15,
      at: START,
    });
  });

  it('when the watchdog reloads the page, then the start it gave up on is kept too', () => {
    const guard = loadGuard();

    guard.fire();

    assert.deepEqual(JSON.parse(guard.storage.getItem('nfnn.boot.last')), {
      panelShown: false,
      codeArrived: false,
      waitedSeconds: 15,
      at: START,
    });
  });

  it('when canaries sit in the address, the user agent, the storage, the title, a cookie, the caches, the service workers and the scripts, then none reaches the file', async () => {
    const canaries = {
      path: 'kanarek-cesta-7781',
      query: 'kanarek-dotaz-7781',
      fragment: 'kanarek-fragment-7781',
      agent: 'Kanarek-UA-7781',
      session: 'kanarek-session-7781',
      title: 'Kanárek titulek 7781',
      cookie: 'kanarek-susenka-7781',
      cache: 'kanarek-cache-7781',
      scope: 'kanarek-scope-7781',
      script: 'kanarek-skript-7781',
    };
    const storage = new MemoryStorage();
    storage.setItem('nfnn.kanarek', canaries.session);
    storage.setItem('nfnn.reload.update', canaries.session);
    storage.setItem(
      'nfnn.boot.last',
      JSON.stringify({ panelShown: canaries.session, at: canaries.session, x: canaries.session }),
    );
    const guard = await shownPanel({
      storage,
      path: `/overit/${canaries.path}?token=${canaries.query}#${canaries.fragment}`,
      userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 ${canaries.agent}`,
      html: `<title>${canaries.title}</title><script src="main-ABCD1234.js?t=${canaries.script}"></script><script src="chrome-extension://${canaries.script}/main-ABCD1234.js"></script>`,
      cacheNames: [canaries.cache],
      workers: [{ scope: canaries.scope, active: { scriptURL: canaries.script } }],
    });
    guard.dom.window.document.cookie = `nfnn.kanarek=${canaries.cookie}`;

    const saved = await guard.savedFile();
    const file = JSON.parse(saved.text);

    assert.equal(file.app.bundle, null);
    assert.equal(file.page, '/overit');
    const dump = textDump(saved.text);
    for (const [where, canary] of Object.entries(canaries)) {
      assert.equal(leaks(dump, canary), false, where);
    }
  });

  for (const [label, userAgent, touches] of [
    ['Safari on an iPhone', IPHONE_SAFARI, 5],
    [
      'Safari on an iPad that says Macintosh',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      5,
    ],
    [
      'Safari on a Mac',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      0,
    ],
    [
      'the Home Screen app on an iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      5,
    ],
    [
      'Chrome on an iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
      5,
    ],
    [
      'Samsung Internet',
      'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      5,
    ],
    [
      'Edge on Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70',
      0,
    ],
    [
      'Opera on Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
      0,
    ],
    [
      'Firefox on Linux',
      'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
      0,
    ],
    ['an unknown agent', 'Zxqv Kanárek 7781/2099', 0],
    ['a major beyond the range', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/1000', 0],
  ]) {
    it(`when the browser is ${label}, then the panel's file names it as the app's error reports do`, async () => {
      const guard = await shownPanel({ userAgent, maxTouchPoints: touches });

      const file = JSON.parse((await guard.savedFile()).text);

      assert.deepEqual(
        file.platform,
        detectPlatform({ userAgent, maxTouchPoints: touches }, false),
      );
    });
  }

  it('when the storage of the browser is almost full, then the file says only that', async () => {
    const guard = await shownPanel({ estimate: { usage: 1_000_000_000, quota: 1_030_000_000 } });

    const saved = await guard.savedFile();

    assert.deepEqual(JSON.parse(saved.text).storage, { persisted: true, nearlyFull: true });
    assert.doesNotMatch(saved.text, /1000000000|1030000000/);
  });

  it('when the panel button clears the site after the file was gathered, then the file still names what was there', async () => {
    const storage = new MemoryStorage();
    storage.setItem('nfnn.reload.boot', String(START - 30_000));
    const guard = await shownPanel({ online: true, storage });
    guard.panel().querySelector('button').click();
    await settle();

    const file = JSON.parse((await guard.savedFile()).text);

    assert.equal(file.serviceWorker.registrations, 1);
    assert.equal(file.serviceWorker.caches, 2);
  });

  it('when the file is saved, then a status line on the panel names it and says to attach it to an e-mail', async () => {
    const guard = await shownPanel();

    const saved = await guard.savedFile();

    assert.equal(
      guard.panel().querySelector('[role="status"]').textContent,
      `Soubor ${saved.name} je ve stažených souborech. Přiložte ho prosím k e‑mailu na info@nfnn.cz.`,
    );
    assert.equal(guard.panel().querySelector('p[role="alert"]'), null);
  });

  it('when the browser refuses to make the file, then an alert says what to do instead and the button keeps its name', async () => {
    const guard = await shownPanel({ objectUrlRefused: true });

    guard.pressDownload();

    const download = guard.panel().querySelector('.nfnn-boot-diagnostics');
    assert.equal(download.textContent, 'Stáhnout diagnostický soubor');
    assert.equal(
      guard.panel().querySelector('p[role="alert"]').textContent,
      'Soubor se nepodařilo připravit. Napište nám prosím i bez něj, v jakém prohlížeči a na které stránce potíže máte.',
    );
    assert.equal(guard.panel().querySelector('[role="status"]').textContent, '');
  });

  it('when the device is an iPhone that shares files, then the press opens the share sheet with the JSON file and saves nothing', async () => {
    const guard = await shownPanel({ share: () => Promise.resolve() });

    guard.pressDownload();
    await settle();

    assert.equal(guard.calls.saved.length, 0);
    assert.equal(guard.calls.shared.length, 1);
    const [shared] = guard.calls.shared[0].files;
    assert.match(shared.name, /^nfnn-diagnostika-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    assert.equal(shared.type, 'application/json');
    const file = JSON.parse(await shared.text());
    assert.deepEqual(sanitizedDiagnostics(file), file);
  });

  it('when the iPhone closes the share sheet, then nothing is saved; when sharing fails, then the file is saved instead', async () => {
    const closed = await shownPanel({
      share: () => Promise.reject(new DOMException('closed', 'AbortError')),
    });
    closed.pressDownload();
    await settle();
    assert.equal(closed.calls.saved.length, 0);

    const failing = await shownPanel({
      share: () => Promise.reject(new DOMException('no', 'NotAllowedError')),
    });
    failing.pressDownload();
    await settle();
    assert.equal(failing.calls.saved.length, 1);
  });

  for (const [label, attempt, reload] of [
    [
      'a start from the future',
      { panelShown: false, codeArrived: false, waitedSeconds: 15, at: START + 60_000 },
      String(START + 60_000),
    ],
    [
      'a fractional wait',
      { panelShown: false, codeArrived: false, waitedSeconds: 1.5, at: START - 1_000 },
      'abc',
    ],
    [
      'an oversized wait',
      { panelShown: false, codeArrived: false, waitedSeconds: 601, at: START - 1_000 },
      '-5',
    ],
    [
      'a wait that is not a number',
      { panelShown: false, codeArrived: false, waitedSeconds: 'NaN', at: START - 1_000 },
      'NaN',
    ],
    [
      'a start older than a day',
      { panelShown: false, codeArrived: false, waitedSeconds: 15, at: START - 86_401_000 },
      String(START - 86_401_000),
    ],
  ]) {
    it(`when the tab keeps ${label}, then the file names no previous start and no reload`, async () => {
      const storage = new MemoryStorage();
      storage.setItem('nfnn.boot.last', JSON.stringify(attempt));
      storage.setItem('nfnn.reload.update', reload);
      const guard = await shownPanel({ storage });

      const file = JSON.parse((await guard.savedFile()).text);

      assert.equal(file.boot.previous, null);
      assert.equal(file.reloads.update, null);
    });
  }

  it('when the first path segments the watchdog knows are compared with the routes of the app, then each is a route of its own', () => {
    const block = SOURCE.match(/var PAGES = \[([^\]]*)\]/)?.[1];
    assert.ok(block);
    const segments = [...block.matchAll(/'([^']+)'/g)].map((found) => found[1]);
    const firstSegments = new Set(
      DIAGNOSTIC_PAGES.filter((page) => page !== '/').map((page) => page.split('/')[1]),
    );

    assert.deepEqual([...segments].sort(), [...firstSegments].sort());
    for (const segment of segments) {
      assert.ok(DIAGNOSTIC_PAGES.includes(`/${segment}`), segment);
    }
  });

  it('when the watchdog key the app reads is compared, then it is the same in both', () => {
    const watched = SOURCE.match(/var LAST_ATTEMPT_KEY = '([^']+)'/)?.[1];
    const read = BOOT_REPORT.match(/export const BOOT_LAST_ATTEMPT_KEY = '([^']+)'/)?.[1];
    assert.ok(watched);
    assert.equal(read, watched);
  });
});
