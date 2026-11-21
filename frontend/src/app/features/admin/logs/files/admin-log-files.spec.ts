import { logFile } from '../../testing/admin-fixtures';
import { LOGS_URL, LogPageHarness } from '../testing/log-page-harness';
import { AdminLogFiles } from './admin-log-files';
import {
  alertsHoldingAButton,
  loadFailureAlerts,
  pressLoadFailureRetry,
} from '../../../../shared/ui/load-failure/testing/load-failure-retry';

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
    expect(
      ['Aplikace', 'Konektor'].flatMap((heading) =>
        Array.from(page.cardTitled(heading).querySelectorAll('.file-name'), (name) =>
          name.textContent?.trim(),
        ),
      ),
    ).toEqual([
      'backend.log.2026-11-06.0.gz',
      'backend.log.2026-10-24.0.gz',
      'mcp.log.2026-11-06.gz',
    ]);
    expect(page.texts('.ui-list a .ui-list__meta')).toEqual([
      '41 kB · 7. 11. 2026 0:08',
      '20 kB · 25. 10. 2026 0:52',
      '8 kB · 7. 11. 2026 1:00',
    ]);
    expect(page.links('.ui-list a').map((link) => link.href)).toEqual([
      '/sprava/logy/soubor?nazev=backend.log.2026-11-06.0.gz',
      '/sprava/logy/soubor?nazev=backend.log.2026-10-24.0.gz',
      '/sprava/logy/soubor?nazev=mcp.log.2026-11-06.gz',
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

  it('when the files load, then each name may break only after a dot, inside a row led by the file icon as on Logy a diagnostika', async () => {
    page.http.expectOne(LOGS_URL).flush({
      available: true,
      files: [logFile({ name: 'backend.log.2026-10-22.0.gz', compressed: true })],
    });
    await page.settle();

    const row = page.cardTitled('Aplikace').querySelector('a.ui-list__row') as HTMLElement;
    const name = row.querySelector('.ui-list__title.file-name') as HTMLElement;
    expect([...name.querySelectorAll('.ui-word')].map((part) => part.textContent)).toEqual([
      'backend.',
      'log.',
      '2026-10-22.',
      '0.',
      'gz',
    ]);
    expect(name.querySelectorAll('wbr')).toHaveLength(4);
    expect(row.firstElementChild?.matches('.ui-list__lead.ui-list__glyph')).toBe(true);
    expect(row.querySelector('.ui-list__glyph svg')?.getAttribute('width')).toBe('20');
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

    expect(loadFailureAlerts(page.fixture.nativeElement)).toEqual([
      'Soubory logu se nepodařilo načíst.',
    ]);
    expect(alertsHoldingAButton(page.fixture.nativeElement)).toBe(0);
    const retry = pressLoadFailureRetry(page.fixture.nativeElement);
    await page.settle();
    expect(retry.getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement).toBe(retry);
    expect(loadFailureAlerts(page.fixture.nativeElement)).toEqual([
      'Soubory logu se nepodařilo načíst.',
    ]);
    page.http.expectOne(LOGS_URL).flush({ available: true, files: [] });
    await page.settle();

    expect(page.text('.empty')).toBe('Starší soubory zatím nejsou.');
  });
});
