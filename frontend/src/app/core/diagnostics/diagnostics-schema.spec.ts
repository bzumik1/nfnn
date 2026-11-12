import { inject as injectFromSetup } from 'vitest';

import type { ServerAppRoutes } from '../../../testing/server-routes';

import {
  ageBucket,
  DIAGNOSTIC_PAGES,
  diagnosticsFileName,
  pageOf,
  sanitizedDiagnostics,
} from './diagnostics-schema';

const CANARY = 'Zxqv Kanárek 7781';

function completeFile(): Record<string, unknown> {
  return {
    format: 'nfnn-diagnostics',
    version: 1,
    createdAt: '2026-11-06T14:03Z',
    source: 'account-page',
    app: { revision: 'abc1234', bundle: 'main-ABCD1234.js', started: true, codeArrived: true },
    platform: { browser: 'safari', browserMajor: 18, os: 'ios', display: 'standalone' },
    page: '/darce/udaje',
    network: { browserOnline: true, appOffline: false, offlineCause: null },
    support: {
      serviceWorker: true,
      indexedDb: true,
      webLocks: true,
      broadcastChannel: true,
      subtleCrypto: true,
      webAuthn: true,
      webAssembly: true,
      storageManager: true,
      trustedTypes: false,
    },
    storage: { persisted: true, nearlyFull: false },
    serviceWorker: {
      controlled: true,
      registrations: 1,
      active: 1,
      waiting: 0,
      installing: 0,
      caches: 4,
    },
    reloads: { boot: null, 'chunk-load': 120, update: null, unrecoverable: null },
    boot: {
      recovered: true,
      previous: { panelShown: false, codeArrived: false, waitedSeconds: 15, secondsAgo: 30 },
    },
    session: { account: 'donor', kind: 'REMEMBERED', administrationUnlocked: null },
    deviceCopy: { mode: 'stored', donor: 'open', storedAge: 'under-1h', administration: 'none' },
    events: [
      { secondsAgo: 40, kind: 'pdf-render', place: 'global', name: 'TypeError', detail: 'drawing' },
      { secondsAgo: 10, kind: 'copy-sync', place: null, name: null, detail: 'mismatch' },
    ],
  };
}

function leaves(value: unknown, path = ''): [string, unknown][] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}/${key}`));
  }
  return [[path, value]];
}

describe('Given the schema of the diagnostic file', () => {
  it('when a complete file of allowed values is sanitised, then it comes out unchanged', () => {
    expect(sanitizedDiagnostics(completeFile())).toEqual(completeFile());
  });

  it('when a file is sanitised, then it has exactly the keys of the schema in their order', () => {
    expect(Object.keys(sanitizedDiagnostics({}))).toEqual([
      'format',
      'version',
      'createdAt',
      'source',
      'app',
      'platform',
      'page',
      'network',
      'support',
      'storage',
      'serviceWorker',
      'reloads',
      'boot',
      'session',
      'deviceCopy',
      'events',
    ]);
  });

  it('when keys outside the schema are added anywhere, then none of them comes out', () => {
    const file = completeFile();
    file['userAgent'] = CANARY;
    (file['app'] as Record<string, unknown>)['url'] = CANARY;
    (file['session'] as Record<string, unknown>)['email'] = CANARY;
    (file['events'] as Record<string, unknown>[])[0]['message'] = CANARY;

    expect(JSON.stringify(sanitizedDiagnostics(file))).not.toContain(CANARY);
    expect(sanitizedDiagnostics(file)).toEqual(completeFile());
  });

  it('when every string leaf is replaced by a canary, then no canary comes out and every leaf is null, a constant or an empty list', () => {
    const forged = JSON.parse(
      JSON.stringify(completeFile(), (_key, value: unknown) =>
        typeof value === 'string' ? CANARY : value,
      ),
    );

    const sanitised = sanitizedDiagnostics(forged);

    expect(JSON.stringify(sanitised)).not.toContain(CANARY);
    expect(sanitised.format).toBe('nfnn-diagnostics');
    expect(sanitised.events).toEqual([]);
    expect(sanitised.page).toBe('other');
  });

  it.each([
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['a number above its range', Number.parseFloat('1e309')],
    ['a number as text', '12'],
    ['a boolean', true],
  ])('when a count or an age is %s, then it comes out as null', (_label, value) => {
    const file = completeFile();
    (file['serviceWorker'] as Record<string, unknown>)['caches'] = value;
    (file['reloads'] as Record<string, unknown>)['chunk-load'] = value;
    (file['platform'] as Record<string, unknown>)['browserMajor'] = value;

    const sanitised = sanitizedDiagnostics(file);

    expect(sanitised.serviceWorker?.caches).toBeNull();
    expect(sanitised.reloads?.['chunk-load']).toBeNull();
    expect(sanitised.platform?.browserMajor).toBeNull();
  });

  it('when the object carries __proto__ or constructor keys, then they are ignored', () => {
    const forged = JSON.parse(
      `{"__proto__":{"source":"boot-panel"},"constructor":{"x":1},"app":{"__proto__":{"started":true}}}`,
    );

    const sanitised = sanitizedDiagnostics(forged);

    expect(sanitised.source).toBeNull();
    expect(sanitised.app?.started).toBeNull();
  });

  it('when an event carries a detail of another kind, then the detail is dropped', () => {
    const file = completeFile();
    file['events'] = [
      { secondsAgo: 1, kind: 'pdf-render', place: 'global', name: 'Error', detail: 'mismatch' },
      { secondsAgo: 2, kind: 'copy-sync', place: null, name: null, detail: 'drawing' },
      { secondsAgo: 3, kind: 'pdf-load', place: 'global', name: 'Error', detail: 'drawing' },
      { secondsAgo: 4, kind: 'pdf-load', place: 'global', name: 'Error', detail: 'fonts' },
    ];

    expect(sanitizedDiagnostics(file).events.map((event) => event.detail)).toEqual([
      null,
      null,
      null,
      'fonts',
    ]);
  });

  it('when an event has an unknown kind or a future time, then it is left out', () => {
    const file = completeFile();
    file['events'] = [
      { secondsAgo: 1, kind: CANARY, place: 'global', name: 'Error', detail: null },
      { secondsAgo: -5, kind: 'unexpected', place: 'global', name: 'Error', detail: null },
      { secondsAgo: 5, kind: 'unexpected', place: CANARY, name: CANARY, detail: CANARY },
    ];

    expect(sanitizedDiagnostics(file).events).toEqual([
      { secondsAgo: 5, kind: 'unexpected', place: null, name: null, detail: null },
    ]);
  });

  it('when more than fifty events come, then only the fifty latest stay', () => {
    const file = completeFile();
    file['events'] = Array.from({ length: 60 }, (_, index) => ({
      secondsAgo: 60 - index,
      kind: 'unexpected',
      place: 'global',
      name: 'Error',
      detail: null,
    }));

    const events = sanitizedDiagnostics(file).events;

    expect(events).toHaveLength(50);
    expect(events[0].secondsAgo).toBe(50);
  });

  it.each([
    ['a revision with a query', 'abc1234?x=1'],
    ['a bundle with a query', 'main-ABCD1234.js?t=1'],
    ['a bundle of another name', 'polyfills-ABCD1234.js'],
  ])('when the app carries %s, then it comes out as null', (_label, value) => {
    const file = completeFile();
    (file['app'] as Record<string, unknown>)['revision'] = value;
    (file['app'] as Record<string, unknown>)['bundle'] = value;

    expect(sanitizedDiagnostics(file).app).toEqual({
      revision: null,
      bundle: null,
      started: true,
      codeArrived: true,
    });
  });

  it('when the sections of the app are missing, then they come out as null and the file stays valid', () => {
    const sanitised = sanitizedDiagnostics({ source: 'boot-panel' });

    expect(sanitised.session).toBeNull();
    expect(sanitised.deviceCopy).toBeNull();
    expect(sanitised.events).toEqual([]);
  });

  it('when anything but an object is given, then an empty file of the schema comes out', () => {
    for (const given of [null, 'text', 42, [completeFile()]]) {
      expect(sanitizedDiagnostics(given).source).toBeNull();
    }
  });

  it('when every leaf of a sanitised file is listed, then each is a boolean, a whole number, null or a string', () => {
    for (const [path, leaf] of leaves(sanitizedDiagnostics(completeFile()))) {
      const allowed =
        leaf === null ||
        typeof leaf === 'boolean' ||
        typeof leaf === 'string' ||
        Number.isSafeInteger(leaf);
      expect(allowed, path).toBe(true);
    }
  });
});

describe('Given the page address of a visitor', () => {
  it.each([
    ['/', '/'],
    ['/darce/udaje', '/darce/udaje'],
    ['/aktuality/vylet-do-zoo', '/aktuality/:param'],
    ['/sprava/darci/0f8fad5b-d9cb-469f-a165-70867728950e', '/sprava/darci/:param'],
    ['/sprava/darci/abc/rok-2026', '/sprava/darci/:param/:param'],
    ['/obnova-hesla', '/obnova-hesla'],
    ['/DARCE/udaje', 'other'],
    ['/darce/udaje/', 'other'],
    ['/zxqv-kanarek', 'other'],
    ['/aktuality/a/b', 'other'],
    ['', 'other'],
  ])('when it is %s, then the page is %s', (path, page) => {
    expect(pageOf(path)).toBe(page);
  });

  it('when the pages of the file are compared with the routes nginx serves, then they are the same', () => {
    const served: ServerAppRoutes = injectFromSetup('serverAppRoutes');

    expect([...DIAGNOSTIC_PAGES].sort()).toEqual([...served].sort());
  });
});

describe('Given an age in milliseconds', () => {
  it.each([
    [0, 'under-1h'],
    [59 * 60_000, 'under-1h'],
    [60 * 60_000, 'under-1d'],
    [24 * 3_600_000, 'under-7d'],
    [7 * 86_400_000, 'under-30d'],
    [30 * 86_400_000, 'older'],
    [-1, null],
    [Number.NaN, null],
    [null, null],
  ])('when it is %s, then the bucket is %s', (age, bucket) => {
    expect(ageBucket(age)).toBe(bucket);
  });
});

describe('Given the time the file is made', () => {
  it('when it is named, then the name carries only the UTC date and minute', () => {
    expect(diagnosticsFileName(new Date('2026-11-06T14:03:59.999Z'))).toBe(
      'nfnn-diagnostika-2026-11-06-1403.json',
    );
  });
});
