import { logFile } from '../../testing/admin-fixtures';
import { LOGS_URL, LogPageHarness } from '../testing/log-page-harness';
import { AdminLogFiles } from './admin-log-files';

describe('Given an administrator on the older log files page', () => {
  let page: LogPageHarness;

  beforeEach(async () => {
    page = await LogPageHarness.open('/sprava/logy/soubory', AdminLogFiles);
  });

  afterEach(() => {
    page.http.verify();
  });

  it('when the files load, then the older ones are grouped by what writes them, newest first, each leading to its reader', async () => {
    page.http.expectOne(LOGS_URL).flush({
      available: true,
      files: [
        logFile({ name: 'backend.log' }),
        logFile({
          name: 'backend.log.2026-10-24.0.gz',
          sizeBytes: 19_692,
          changedAt: '2026-10-24T22:52:13Z',
          compressed: true,
        }),
        logFile({
          name: 'backend.log.2026-11-06.0.gz',
          sizeBytes: 41_521,
          changedAt: '2026-11-06T23:08:33Z',
          compressed: true,
        }),
        logFile({
          name: 'mcp.log.2026-11-06.gz',
          sizeBytes: 7_470,
          changedAt: '2026-11-07T00:00:32Z',
          compressed: true,
        }),
      ],
    });
    await page.settle();

    expect(page.text('h1')).toBe('Starší soubory');
    expect(page.texts('h2')).toEqual(['Aplikace', 'Konektor']);
    expect(page.links('.ui-list a')).toEqual([
      {
        text: 'backend.log.2026-11-06.0.gz 41 kB · 7. 11. 2026 0:08',
        href: '/sprava/logy/soubor?nazev=backend.log.2026-11-06.0.gz',
      },
      {
        text: 'backend.log.2026-10-24.0.gz 20 kB · 25. 10. 2026 0:52',
        href: '/sprava/logy/soubor?nazev=backend.log.2026-10-24.0.gz',
      },
      {
        text: 'mcp.log.2026-11-06.gz 8 kB · 7. 11. 2026 1:00',
        href: '/sprava/logy/soubor?nazev=mcp.log.2026-11-06.gz',
      },
    ]);
  });

  it('when the files load, then each group is a card with its heading inside, above its files', async () => {
    page.http.expectOne(LOGS_URL).flush({
      available: true,
      files: [
        logFile({ name: 'backend.log.2026-11-06.0.gz', compressed: true }),
        logFile({ name: 'mcp.log.2026-11-06.gz', compressed: true }),
      ],
    });
    await page.settle();

    for (const heading of ['Aplikace', 'Konektor']) {
      expect(page.cardTitled(heading).querySelectorAll('.ui-list a.ui-list__row')).toHaveLength(1);
    }
  });

  it('when there is no older file, then the page says so', async () => {
    page.http.expectOne(LOGS_URL).flush({ available: true, files: [logFile()] });
    await page.settle();

    expect(page.text('.empty')).toBe('Starší soubory zatím nejsou.');
  });

  it('when the backend does not see the log folder, then the page says so', async () => {
    page.http.expectOne(LOGS_URL).flush({ available: false, files: [] });
    await page.settle();

    expect(page.text('[role="alert"]')).toContain('Backend nevidí složku logů.');
  });

  it('when the list fails, then the page offers a retry', async () => {
    page.http.expectOne(LOGS_URL).flush(null, { status: 500, statusText: 'Error' });
    await page.settle();

    await page.click('Zkusit znovu');
    page.http.expectOne(LOGS_URL).flush({ available: true, files: [] });
    await page.settle();

    expect(page.text('.empty')).toBe('Starší soubory zatím nejsou.');
  });
});
