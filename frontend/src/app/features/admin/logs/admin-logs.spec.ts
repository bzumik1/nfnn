import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { diagnostics, logFile, logOverride } from '../testing/admin-fixtures';
import { AdminLogs } from './admin-logs';
import { DIAGNOSTICS_URL, LOGS_URL, LogPageHarness, problem } from './testing/log-page-harness';

const TODAY_SEARCH = `${LOGS_URL}/backend.log/search?pattern=%5E%5CS%2B%5Cs%2B(?:WARN%7CERROR)%5Cb&limit=50`;
const GIGABYTE = 1_000_000_000;
const MOUNTED = [
  { path: '/logs', mounted: true, freeBytes: 500 * GIGABYTE, totalBytes: 1000 * GIGABYTE },
];
const FILES = [
  logFile({ name: 'backend.log', sizeBytes: 106_745, changedAt: '2026-11-07T00:14:59Z' }),
  logFile({
    name: 'backend.log.2026-11-06.0.gz',
    sizeBytes: 41_521,
    changedAt: '2026-11-06T23:08:33Z',
    compressed: true,
  }),
  logFile({ name: 'backup.log', sizeBytes: 18_742, changedAt: '2026-11-06T23:37:52Z' }),
  logFile({ name: 'mcp.log.2026-11-06.gz', changedAt: '2026-11-07T00:00:32Z', compressed: true }),
  logFile({ name: 'nginx-access.log', sizeBytes: 20_097, changedAt: '2026-11-07T00:15:24Z' }),
];

describe('Given an administrator on the logs hub', () => {
  let page: LogPageHarness;

  beforeEach(async () => {
    page = await LogPageHarness.open('/sprava/logy', AdminLogs);
  });

  afterEach(() => {
    page.http.verify();
  });

  async function load(
    options: { files?: ReturnType<typeof logFile>[]; available?: boolean } = {},
    state = diagnostics({ disks: MOUNTED }),
  ): Promise<void> {
    const files = options.files ?? FILES;
    const available = options.available ?? true;
    page.http.expectOne(LOGS_URL).flush({ available, files });
    page.http.expectOne(DIAGNOSTICS_URL).flush(state);
    await page.settle();
    if (available && files.some((file) => file.name === 'backend.log')) {
      await flushToday([]);
    }
  }

  async function flushToday(
    matches: { offset: number; line: string }[],
    moreOlder = false,
  ): Promise<void> {
    page.http.expectOne(TODAY_SEARCH).flush({
      name: 'backend.log',
      sizeBytes: 106_745,
      matches,
      moreOlder,
      scannedFrom: matches.at(-1)?.offset ?? 0,
    });
    await page.settle();
  }

  it('when the hub opens, then the server is without fault, the current files lead to their reader with what writes them and the older ones are counted', async () => {
    await load();

    expect(page.text('h1')).toBe('Logy a diagnostika');
    expect(page.links('.health a')).toEqual([
      {
        text: 'Bez poruchy Databáze odpovídá a složky jsou připojené.',
        href: '/sprava/logy/stav',
      },
    ]);
    expect(page.links('.files a')).toEqual([
      {
        text: 'backend.log Aplikace · 105 kB · 7. 11. 2026 1:14',
        href: '/sprava/logy/soubor?nazev=backend.log',
      },
      {
        text: 'nginx-access.log Požadavky na web · 20 kB · 7. 11. 2026 1:15',
        href: '/sprava/logy/soubor?nazev=nginx-access.log',
      },
      {
        text: 'backup.log Zálohy · 19 kB · 7. 11. 2026 0:37',
        href: '/sprava/logy/soubor?nazev=backup.log',
      },
      { text: 'Starší soubory 2', href: '/sprava/logy/soubory' },
    ]);
    expect(page.links('.tools a')).toEqual([
      { text: 'Úrovně logování', href: '/sprava/logy/urovne' },
      { text: 'Výpis vláken', href: '/sprava/logy/vlakna' },
    ]);
  });

  it('when the hub opens, then each block is a card with its heading inside, above its rows', async () => {
    await load();

    for (const heading of ['Stav serveru', 'Varování a chyby dnes', 'Soubory logu', 'Nástroje']) {
      expect(page.cardTitled(heading).querySelector('.ui-list .ui-list__row')).not.toBeNull();
    }
  });

  it('when warnings and errors were written today, then the card counts each message once, leads to its surroundings and to all of them', async () => {
    const at = (time: string, level: string, logger: string, message: string) =>
      `2026-10-23T${time}.000+02:00 ${level.padStart(5)} 1 --- [nova-nadeje] [scheduling-1] ${logger} : ${message}`;
    page.http.expectOne(LOGS_URL).flush({ available: true, files: FILES });
    page.http.expectOne(DIAGNOSTICS_URL).flush(diagnostics({ disks: MOUNTED }));
    await page.settle();
    await flushToday([
      {
        offset: 900,
        line: at('11:30:11', 'ERROR', 'c.n.a.o.a.backup.BackupWatchService', 'Backup watch failed'),
      },
      {
        offset: 800,
        line: at('10:58:02', 'WARN', 'c.n.a.d.a.FixedWindowRateLimiter', 'Rate limit reached'),
      },
      {
        offset: 700,
        line: at('09:58:02', 'WARN', 'c.n.a.d.a.FixedWindowRateLimiter', 'Rate limit reached'),
      },
      {
        offset: 100,
        line: at('00:10:00', 'WARN', 'c.n.a.App', 'Started').replace('2026-10-23', '2026-10-22'),
      },
    ]);

    expect(page.links('.today a')).toEqual([
      {
        text: 'Chyba Backup watch failed 11:30:11 · BackupWatchService',
        href: '/sprava/logy/soubor?nazev=backend.log&od=900',
      },
      {
        text: 'Varování Rate limit reached 10:58:02 · FixedWindowRateLimiter 2×',
        href: '/sprava/logy/soubor?nazev=backend.log&od=800',
      },
      {
        text: 'Všechna varování a chyby',
        href: '/sprava/logy/soubor?nazev=backend.log&uroven=varovani',
      },
    ]);
  });

  it('when nothing was written today, then the card says so', async () => {
    await load();

    expect(page.text('.today .ui-list__row')).toBe('Dnes žádná varování ani chyby');
  });

  it('when a folder is not mounted and a level is raised for a while, then the state names the failure and the levels row says so', async () => {
    await load(
      {},
      diagnostics({
        disks: [{ path: '/backups', mounted: false, freeBytes: 0, totalBytes: 0 }],
        logLevelOverrides: [logOverride()],
      }),
    );

    expect(page.text('.health a .ui-list__title')).toBe('Porucha');
    expect(page.text('.health a .ui-list__meta')).toBe('Složka /backups není připojená.');
    expect(page.text('.tools a[href="/sprava/logy/urovne"]')).toBe('Úrovně logování 1 dočasně');
  });

  it('when the backend does not see the log folder, then the files say so while the state still shows', async () => {
    await load({ available: false, files: [] });

    expect(page.text('.files [role="alert"]')).toContain('Backend nevidí složku logů.');
    expect(page.links('.files a')).toEqual([]);
    expect(page.text('.health a .ui-list__title')).toBe('Bez poruchy');
  });

  it('when the folder holds no file, then the files say it is empty', async () => {
    await load({ files: [] });

    expect(page.text('.files')).toContain('Složka logů je prázdná.');
  });

  it('when the files fail to load, then only the files offer a retry and it loads them again', async () => {
    page.http.expectOne(LOGS_URL).flush(null, { status: 500, statusText: 'Error' });
    page.http.expectOne(DIAGNOSTICS_URL).flush(diagnostics({ disks: MOUNTED }));
    await page.settle();

    expect(page.text('.files [role="alert"]')).toContain('Soubory logu se nepodařilo načíst.');
    expect(page.text('.health a .ui-list__title')).toBe('Bez poruchy');

    await page.click('Zkusit znovu');
    page.http.expectOne(LOGS_URL).flush({ available: true, files: FILES });
    await page.settle();
    await flushToday([]);

    expect(page.links('.files a')).toHaveLength(4);
  });

  it('when the state fails to load, then only the state offers a retry', async () => {
    page.http.expectOne(LOGS_URL).flush({ available: true, files: FILES });
    page.http.expectOne(DIAGNOSTICS_URL).flush(null, { status: 500, statusText: 'Error' });
    await page.settle();
    await flushToday([]);

    expect(page.text('.health [role="alert"]')).toContain('Stav serveru se nepodařilo zjistit.');
    expect(page.links('.files a')).toHaveLength(4);

    await page.click('Zkusit znovu');
    page.http.expectOne(DIAGNOSTICS_URL).flush(diagnostics({ disks: MOUNTED }));
    await page.settle();

    expect(page.text('.health a .ui-list__title')).toBe('Bez poruchy');
  });

  it('when the session is gone, then the administrator is sent home with the sign-in dialog', async () => {
    const open = vi.spyOn(TestBed.inject(LoginDialogService), 'open');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(401, 'auth/unauthenticated', 'Nepřihlášeno', 'Přihlaste se prosím.');

    page.http.expectOne(DIAGNOSTICS_URL).flush(diagnostics({ disks: MOUNTED }));
    page.http.expectOne(LOGS_URL).flush(refusal.body, refusal.options);
    page.http.expectOne('/api/donors/auth/logout').flush(null);
    await page.settle();

    expect(navigate).toHaveBeenCalledWith('/');
    expect(open).toHaveBeenCalledWith('login', { returnTo: '/sprava/logy' });
  });
});
