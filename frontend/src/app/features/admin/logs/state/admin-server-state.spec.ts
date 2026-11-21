import {
  diagnostics,
  logOverride,
  newerReleaseView,
  releaseHistoryView,
  releaseRun,
  releaseView,
} from '../../testing/admin-fixtures';
import { DIAGNOSTICS_URL, LogPageHarness } from '../testing/log-page-harness';
import { AdminServerState } from './admin-server-state';
import { accessibleText } from '../../../../shared/ui/busy-label/testing/accessible-text';
import { labelFaces } from '../../../../shared/ui/busy-label/testing/label-faces';
import {
  alertsHoldingAButton,
  loadFailureAlerts,
  pressLoadFailureRetry,
} from '../../../../shared/ui/load-failure/testing/load-failure-retry';

const RELEASE_URL = '/api/admin/operations/release';
const HISTORY_URL = '/api/admin/operations/release/history';
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
    page.http.match(RELEASE_URL).forEach((pending) => pending.flush(releaseView()));
    page.http.verify();
  });

  async function loaded(release: object | null): Promise<void> {
    page.http.expectOne(DIAGNOSTICS_URL).flush(STATE);
    const pending = page.http.expectOne(RELEASE_URL);
    if (release === null) {
      pending.flush(null, { status: 500, statusText: 'Error' });
    } else {
      pending.flush(release);
    }
    await page.settle();
  }

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

  it('when the state loads, then the verdict, the application, the database, the folders and the raised levels are cards with their heading inside, the verdict with its refresh', async () => {
    page.http.expectOne(DIAGNOSTICS_URL).flush({ ...STATE, logLevelOverrides: [logOverride()] });
    page.http.expectOne(RELEASE_URL).flush(releaseView());
    await page.settle();

    expect(accessibleText(page.cardTitled('Porucha').querySelector('button'))).toBe('Obnovit stav');
    for (const heading of ['Aplikace', 'Databáze', 'Složky', 'Dočasné úrovně']) {
      expect(page.cardTitled(heading).querySelector('.ui-list .ui-list__row')).not.toBeNull();
    }
  });

  it('when the state loads, then the Java version reads under its title and the findings are a plain list that keeps its role, in the verdict secondary text', async () => {
    page.http.expectOne(DIAGNOSTICS_URL).flush(STATE);
    await page.settle();

    const javaRow = page.cardTitled('Aplikace').querySelectorAll('.ui-list__row')[4];
    expect(javaRow.querySelector('.ui-list__meta')?.textContent?.trim()).toBe('25.0.1+8');
    expect(javaRow.querySelector('.ui-list__value')).toBeNull();
    expect(page.has('.verdict ul.findings[role="list"]')).toBe(true);
    expect(page.has('.verdict ul.findings.ui-list')).toBe(false);
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
    const refreshing = page.button('Obnovujeme…');
    expect(refreshing.disabled).toBe(true);
    expect(labelFaces(refreshing)).toEqual(['Obnovit stav', 'Obnovujeme…']);
    page.http.expectOne(DIAGNOSTICS_URL).flush(null, { status: 500, statusText: 'Error' });
    await page.settle();

    expect(page.text('[role="alert"]')).toBe('Stav serveru se nepodařilo obnovit.');
    expect(page.text('.verdict .ui-list__title')).toBe('Porucha');
  });

  it('when the first load fails, then the page offers a retry', async () => {
    page.http.expectOne(DIAGNOSTICS_URL).flush(null, { status: 500, statusText: 'Error' });
    await page.settle();

    expect(loadFailureAlerts(page.fixture.nativeElement)).toEqual([
      'Stav serveru se nepodařilo zjistit.',
    ]);
    expect(alertsHoldingAButton(page.fixture.nativeElement)).toBe(0);
    const retry = pressLoadFailureRetry(page.fixture.nativeElement);
    await page.settle();
    expect(retry.getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement).toBe(retry);
    expect(loadFailureAlerts(page.fixture.nativeElement)).toEqual([
      'Stav serveru se nepodařilo zjistit.',
    ]);
    page.http.expectOne(DIAGNOSTICS_URL).flush(STATE);
    await page.settle();

    expect(page.text('.verdict .ui-list__title')).toBe('Porucha');
  });
  it('when the server runs the latest release, then the application starts with it and when it was checked, without steps', async () => {
    await loaded(releaseView());

    expect(rows('application')[0]).toBe('Vydání nejnovější, ověřeno 15. 11. 2026 6:10 2026.11.3');
    expect(page.has('.release-steps')).toBe(false);
  });

  it('when a newer release is published, then the release row names it with the steps in ZimaOS and what is new on GitHub', async () => {
    await loaded(newerReleaseView());

    expect(page.text('#vydani .ui-list__meta')).toBe(
      'novější 2026.11.5 z 14. 11. 2026 10:30, ověřeno 15. 11. 2026 6:10',
    );
    expect(page.text('#vydani .ui-list__value')).toBe('2026.11.3');
    expect(page.texts('.release-steps li')).toEqual([
      'V ZimaOS otevřete aplikaci „Nová naděje“ a její nastavení.',
      'Zkontrolujte, že všechny služby mají tag „latest“, nic neměňte a klikněte na Uložit.',
      'Za 2–3 minuty obnovte tuto stránku, Vydání pak ukáže 2026.11.5.',
    ]);
    const link = page.element<HTMLAnchorElement>('#vydani a');
    expect(page.text('#vydani a')).toBe('Co je nového v 2026.11.5');
    expect(link.getAttribute('href')).toBe(
      'https://github.com/bzumik1/nfnn/releases/tag/2026.11.5',
    );
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('when the last check failed, then the row says when the release could not be verified', async () => {
    await loaded(
      releaseView({
        checkedAt: '2026-11-16T05:10:00Z',
        failure: 'STATUS',
      }),
    );

    expect(page.text('#vydani .ui-list__meta')).toBe(
      'nejnovější, ověřit se nepodařilo 16. 11. 2026 6:10',
    );
  });

  it('when a build outside the releases runs before the first check, then the row says the latest release is not known yet', async () => {
    await loaded(releaseView({ running: 'dev', latest: null, checkedAt: null, succeededAt: null }));

    expect(page.text('#vydani')).toBe('Vydání nejnovější vydání zatím neznáme dev');
  });

  it('when the release loads, then its number may break only after a dot', async () => {
    await loaded(releaseView({ running: '2026.11.109' }));

    const value = page.cardTitled('Aplikace').querySelector('.release .release-parts')!;
    const breaks = Array.from(value.childNodes)
      .map((node) =>
        node.nodeName === 'WBR'
          ? '|'
          : node.nodeType === Node.COMMENT_NODE
            ? ''
            : (node.textContent ?? ''),
      )
      .join('');
    expect(breaks).toBe('2026.|11.|109');
  });

  it('when the release cannot be read, then the application rows show without it', async () => {
    await loaded(null);

    expect(page.has('#vydani')).toBe(false);
    expect(page.hasButton('Historie vydání')).toBe(false);
    expect(rows('application')[0]).toContain('Paměť');
  });

  it('when the release loads, then Historie vydání follows it closed and asks for nothing', async () => {
    await loaded(releaseView());

    const toggle = page.button('Historie vydání');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBeNull();
    expect(page.has('#historie-vydani')).toBe(false);
    page.http.expectNone(HISTORY_URL);
  });

  it('when they open Historie vydání, then it says it loads and then lists the runs newest first with when each ran, its revision and what is new on GitHub', async () => {
    await loaded(releaseView());

    await page.click('Historie vydání');

    const toggle = page.button('Historie vydání');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('historie-vydani');
    expect(page.text('#historie-vydani [role="status"]')).toBe('Načítáme historii vydání…');
    page.http.expectOne(HISTORY_URL).flush(releaseHistoryView());
    await page.settle();

    expect(page.text('#historie-vydani [role="status"]')).toBe('');
    expect(page.texts('#historie-vydani .ui-list__row')).toEqual([
      '2026.11.109 běží od 19. 11. 2026 19:02 naposledy spuštěno 20. 11. 2026 8:40 2b79cb3 Co je nového v 2026.11.109',
      'Bez čísla vydání od 15. 11. 2026 10:00 do 19. 11. 2026 19:02 dev',
      '2026.11.98 od 12. 11. 2026 17:30 do 15. 11. 2026 10:00 d953749 Co je nového v 2026.11.98',
    ]);
    expect(page.links('#historie-vydani a')).toEqual([
      {
        text: 'Co je nového v 2026.11.109',
        href: 'https://github.com/bzumik1/nfnn/releases/tag/2026.11.109',
      },
      {
        text: 'Co je nového v 2026.11.98',
        href: 'https://github.com/bzumik1/nfnn/releases/tag/2026.11.98',
      },
    ]);
    const link = page.element<HTMLAnchorElement>('#historie-vydani a');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('when they close Historie vydání and open it again, then the toggle says so and the history is asked anew', async () => {
    await loaded(releaseView());
    await page.click('Historie vydání');
    page.http.expectOne(HISTORY_URL).flush(releaseHistoryView());
    await page.settle();

    await page.click('Historie vydání');

    expect(page.button('Historie vydání').getAttribute('aria-expanded')).toBe('false');
    await page.click('Historie vydání');
    page.http.expectOne(HISTORY_URL).flush({ entries: [releaseRun()] });
    await page.settle();
    expect(page.texts('#historie-vydani .ui-list__row')).toEqual([
      '2026.11.109 běží od 19. 11. 2026 19:02 2b79cb3 Co je nového v 2026.11.109',
    ]);
  });

  it('when the history is still empty, then it says no release is recorded yet', async () => {
    await loaded(releaseView());
    await page.click('Historie vydání');
    page.http.expectOne(HISTORY_URL).flush({ entries: [] });
    await page.settle();

    expect(page.text('#historie-vydani')).toBe('Server zatím žádné vydání nezapsal.');
  });

  it('when the history cannot be read, then an alert offers to try again, which loads it', async () => {
    await loaded(releaseView());
    await page.click('Historie vydání');
    page.http.expectOne(HISTORY_URL).flush(null, { status: 500, statusText: 'Error' });
    await page.settle();

    const history = page.element<HTMLElement>('#historie-vydani');
    expect(loadFailureAlerts(history)).toEqual(['Historii vydání se nepodařilo načíst.']);
    expect(alertsHoldingAButton(history)).toBe(0);
    const retry = pressLoadFailureRetry(history);
    await page.settle();
    expect(retry.getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement).toBe(retry);
    expect(loadFailureAlerts(history)).toEqual(['Historii vydání se nepodařilo načíst.']);
    page.http.expectOne(HISTORY_URL).flush(releaseHistoryView());
    await page.settle();
    expect(page.texts('#historie-vydani .ui-list__row')).toHaveLength(3);
    expect(document.activeElement).toBe(page.element('h1'));
  });
});
