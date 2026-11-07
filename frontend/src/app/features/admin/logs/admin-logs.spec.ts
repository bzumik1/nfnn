import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { diagnostics, logFile, logOverride } from '../testing/admin-fixtures';
import { AdminLogs } from './admin-logs';
import { DIAGNOSTICS_URL, LOGS_URL, LogPageHarness, problem } from './testing/log-page-harness';

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
    page.http
      .expectOne(LOGS_URL)
      .flush({ available: options.available ?? true, files: options.files ?? FILES });
    page.http.expectOne(DIAGNOSTICS_URL).flush(state);
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

    expect(page.links('.files a')).toHaveLength(4);
  });

  it('when the state fails to load, then only the state offers a retry', async () => {
    page.http.expectOne(LOGS_URL).flush({ available: true, files: FILES });
    page.http.expectOne(DIAGNOSTICS_URL).flush(null, { status: 500, statusText: 'Error' });
    await page.settle();

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
