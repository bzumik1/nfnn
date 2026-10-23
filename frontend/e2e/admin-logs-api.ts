import { Page } from '@playwright/test';
import { administrator, session } from './donor-session';

export const LOGS = '/api/admin/operations/logs';
export const LOGGERS = '/api/admin/operations/loggers';
export const DIAGNOSTICS = '/api/admin/operations/diagnostics';

const TAIL = Array.from(
  { length: 40 },
  (_, index) => `2026-10-23T10:00:${String(index).padStart(2, '0')} INFO line ${index}`,
).join('\n');

export function logsApi(): Record<string, unknown> {
  return {
    files: {
      available: true,
      files: [
        {
          name: 'backend.log',
          sizeBytes: 52000,
          changedAt: '2026-10-23T10:00:39Z',
          compressed: false,
        },
        {
          name: 'backend.log.2026-10-22.0.gz',
          sizeBytes: 3_400_000,
          changedAt: '2026-10-22T23:59:59Z',
          compressed: true,
        },
        {
          name: 'backup.log',
          sizeBytes: 900,
          changedAt: '2026-10-23T01:00:03Z',
          compressed: false,
        },
      ],
    },
    loggers: {
      loggers: [
        { logger: 'ROOT', configuredLevel: 'INFO', effectiveLevel: 'INFO', override: null },
        {
          logger: 'cz.novanadeje.app',
          configuredLevel: 'INFO',
          effectiveLevel: 'INFO',
          override: null,
        },
        {
          logger: 'org.hibernate.SQL',
          configuredLevel: null,
          effectiveLevel: 'INFO',
          override: null,
        },
      ],
    },
    diagnostics: {
      now: '2026-10-23T10:00:00Z',
      jvm: {
        javaVersion: '25.0.1+8',
        startedAt: '2026-10-23T06:00:00Z',
        heapUsedBytes: 180_000_000,
        heapMaxBytes: 805_306_368,
        nonHeapUsedBytes: 120_000_000,
        liveThreads: 42,
        peakThreads: 48,
        daemonThreads: 30,
        gcCount: 120,
        gcTimeMillis: 950,
        availableProcessors: 4,
        systemLoadAverage: 0.4,
      },
      database: {
        reachable: true,
        pingMillis: 2,
        activeConnections: 0,
        idleConnections: 10,
        waitingThreads: 0,
        maxConnections: 10,
      },
      disks: [
        { path: '/logs', mounted: true, freeBytes: 12_000_000_000, totalBytes: 250_000_000_000 },
        { path: '/backups', mounted: true, freeBytes: 12_000_000_000, totalBytes: 250_000_000_000 },
        { path: '/restore', mounted: true, freeBytes: 12_000_000_000, totalBytes: 250_000_000_000 },
      ],
      logLevelOverrides: [],
    },
  };
}

export async function routeLogsApi(page: Page): Promise<void> {
  const api = logsApi();
  await page.route(
    (url) => url.pathname === LOGS,
    (route) => route.fulfill({ json: api['files'] }),
  );
  await page.route(
    (url) => url.pathname === `${LOGS}/backend.log`,
    (route) => {
      const from = new URL(route.request().url()).searchParams.get('from');
      return route.fulfill({
        json: {
          name: 'backend.log',
          sizeBytes: 52000,
          from: from === null ? 32000 : Number(from),
          to: from === null ? 52000 : Number(from) + 20000,
          hasOlder: from !== '0',
          hasNewer: from !== null,
          text: `${TAIL}\n`,
        },
      });
    },
  );
  await page.route(
    (url) => url.pathname === `${LOGS}/backend.log/search`,
    (route) =>
      route.fulfill({
        json: {
          name: 'backend.log',
          sizeBytes: 52000,
          matches: [
            { offset: 51000, line: '2026-10-23T10:00:38 WARN Fio refused the request (409)' },
            { offset: 40000, line: '2026-10-23T09:00:00 WARN Fio refused the request (409)' },
          ],
          moreOlder: false,
          scannedFrom: 0,
        },
      }),
  );
  await page.route(
    (url) => url.pathname === LOGGERS,
    (route) => route.fulfill({ json: api['loggers'] }),
  );
  await page.route(
    (url) => url.pathname === DIAGNOSTICS,
    (route) => route.fulfill({ json: api['diagnostics'] }),
  );
  await page.route(
    (url) => url.pathname === `${DIAGNOSTICS}/threads`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: '"main" #1 state=RUNNABLE\n    at java.base/java.lang.Thread.run(Thread.java:1583)\n',
      }),
  );
}

export async function rememberedAdministrator(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}
