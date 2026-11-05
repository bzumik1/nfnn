import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';

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

function loadGuard({ storage = new MemoryStorage(), online = true, now = START } = {}) {
  const dom = new JSDOM('<!doctype html><html lang="cs"><body><app-root></app-root></body></html>');
  const timers = [];
  const calls = { reloads: 0, unregistered: 0, cachesDeleted: [], indexedDb: 0 };
  const clock = { now };
  const window = {
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
    get sessionStorage() {
      if (storage === 'refused') {
        throw new Error('SecurityError');
      }
      return storage;
    },
    location: { reload: () => calls.reloads++ },
    caches: {
      keys: () => Promise.resolve(['ngsw:/:db:control', 'ngsw:/:1:assets:app:cache']),
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
  };
  const navigator = {
    onLine: online,
    serviceWorker: {
      getRegistrations: () =>
        Promise.resolve([{ unregister: () => Promise.resolve(++calls.unregistered > 0) }]),
    },
  };
  const DateAtClock = { now: () => clock.now };
  runInNewContext(SOURCE, {
    window,
    document: dom.window.document,
    navigator,
    Promise,
    String,
    Number,
    Date: DateAtClock,
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
    assert.equal(panel.querySelector('a').getAttribute('href'), 'mailto:info@nfnn.cz');
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
