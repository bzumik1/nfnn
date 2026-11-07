import { diagnostics, logOverride } from '../../testing/admin-fixtures';
import { DIAGNOSTICS_URL, LogPageHarness } from '../testing/log-page-harness';
import { AdminServerState } from './admin-server-state';

const GIGABYTE = 1024 ** 3;
const STATE = diagnostics({
  jvm: {
    ...diagnostics().jvm,
    heapUsedBytes: 186 * 1024 ** 2,
    heapMaxBytes: 744 * 1024 ** 2,
    nonHeapUsedBytes: 201 * 1024 ** 2,
    liveThreads: 37,
    peakThreads: 39,
    daemonThreads: 32,
    gcCount: 171,
    gcTimeMillis: 1765,
    availableProcessors: 1,
    systemLoadAverage: 0.25,
  },
  database: {
    reachable: true,
    pingMillis: 0,
    activeConnections: 0,
    idleConnections: 6,
    waitingThreads: 0,
    maxConnections: 20,
  },
  disks: [
    { path: '/logs', mounted: true, freeBytes: 400 * GIGABYTE, totalBytes: 800 * GIGABYTE },
    { path: '/backups', mounted: false, freeBytes: 0, totalBytes: 0 },
  ],
});

describe('Given an administrator on the server state page', () => {
  let page: LogPageHarness;

  beforeEach(async () => {
    page = await LogPageHarness.open('/sprava/logy/stav', AdminServerState);
  });

  afterEach(() => {
    page.http.verify();
  });

  function rows(group: string): string[] {
    return page.texts(`.${group} .ui-list__row`);
  }

  it('when the state loads, then the verdict names each finding and the application, the database and the folders read as rows', async () => {
    page.http.expectOne(DIAGNOSTICS_URL).flush(STATE);
    await page.settle();

    expect(page.text('h1')).toBe('Stav serveru');
    expect(page.text('.verdict .ui-list__title')).toBe('Porucha');
    expect(page.text('.verdict .ui-list__meta')).toBe('k 23. 10. 2026 12:00');
    expect(page.texts('.findings li')).toEqual(['Složka /backups není připojená.']);
    expect(rows('application')).toEqual([
      'Paměť 186,0 MB z 744,0 MB, mimo heap 201,0 MB 25 %',
      'Vlákna nejvíc 39, z toho 32 na pozadí 37',
      'Zatížení na 1 jádře 0,25',
      'Úklid paměti celkem 1765 ms 171×',
      'Java 25.0.1+8',
      'Běží od 23. 10. 2026 8:00',
    ]);
    expect(rows('database')).toEqual([
      'Odpovídá za 0 ms',
      'Spojení volná 6 z 20 0 v práci',
      'Čekající vlákna 0',
    ]);
    expect(rows('disks')).toEqual([
      '/logs 400,0 GB volných z 800,0 GB 50 % volno',
      '/backups není připojená',
    ]);
    expect(page.has('.overrides')).toBe(false);
  });

  it('when a level is raised for a while, then it is listed with its end', async () => {
    page.http.expectOne(DIAGNOSTICS_URL).flush({ ...STATE, logLevelOverrides: [logOverride()] });
    await page.settle();

    expect(rows('overrides')).toEqual(['cz.novanadeje.app do 23. 10. 2026 12:30 DEBUG']);
  });

  it('when the database does not answer and the load counts more cores, then both read so', async () => {
    page.http.expectOne(DIAGNOSTICS_URL).flush({
      ...STATE,
      jvm: { ...STATE.jvm, availableProcessors: 4 },
      database: { ...STATE.database, reachable: false, pingMillis: 5000 },
    });
    await page.settle();

    expect(rows('application')[2]).toBe('Zatížení na 4 jádrech 0,25');
    expect(rows('database')[0]).toBe('Odpovídá pokus trval 5000 ms ne');
  });

  it('when they refresh, then the state is asked again and a failure keeps the last state with an alert', async () => {
    page.http.expectOne(DIAGNOSTICS_URL).flush(STATE);
    await page.settle();

    await page.click('Obnovit stav');
    page.http.expectOne(DIAGNOSTICS_URL).flush(null, { status: 500, statusText: 'Error' });
    await page.settle();

    expect(page.text('[role="alert"]')).toBe('Stav serveru se nepodařilo obnovit.');
    expect(page.text('.verdict .ui-list__title')).toBe('Porucha');
  });

  it('when the first load fails, then the page offers a retry', async () => {
    page.http.expectOne(DIAGNOSTICS_URL).flush(null, { status: 500, statusText: 'Error' });
    await page.settle();

    expect(page.text('[role="alert"]')).toContain('Stav serveru se nepodařilo zjistit.');

    await page.click('Zkusit znovu');
    page.http.expectOne(DIAGNOSTICS_URL).flush(STATE);
    await page.settle();

    expect(page.text('.verdict .ui-list__title')).toBe('Porucha');
  });
});
