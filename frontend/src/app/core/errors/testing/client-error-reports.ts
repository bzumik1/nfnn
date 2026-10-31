import { TestBed } from '@angular/core/testing';

import { Connectivity } from '../../navigation/connectivity';
import { ErrorKind, ErrorName } from '../error-vocabulary';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

export interface SentClientErrors {
  bodies(): unknown[];
}

export function recordClientErrors(): SentClientErrors {
  const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', fetchSpy);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI);
  TestBed.configureTestingModule({
    providers: [{ provide: Connectivity, useValue: { isOffline: () => false } }],
  });
  return {
    bodies: () =>
      fetchSpy.mock.calls.map((call) => {
        const init = (call as unknown[])[1] as RequestInit;
        return JSON.parse(init.body as string) as unknown;
      }),
  };
}

export function closedReport(kind: ErrorKind, name: ErrorName): unknown {
  return {
    kind,
    place: 'global',
    name,
    appVersion: 'dev',
    browser: 'safari',
    browserMajor: 18,
    os: 'ios',
    display: 'browser',
    count: 1,
  };
}
