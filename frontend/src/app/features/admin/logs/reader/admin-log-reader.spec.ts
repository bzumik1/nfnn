import { logWindow } from '../../testing/admin-fixtures';
import { LOGS_URL, LogPageHarness, problem } from '../testing/log-page-harness';
import { AdminLogReader } from './admin-log-reader';

describe('Given an administrator reading a log file', () => {
  let page: LogPageHarness;

  async function open(name = 'backend.log'): Promise<void> {
    page = await LogPageHarness.open(
      `/sprava/logy/soubor?nazev=${encodeURIComponent(name)}`,
      AdminLogReader,
      '/sprava/logy/soubor',
    );
  }

  afterEach(() => {
    page.http.verify();
  });

  async function flushWindow(
    query: string,
    overrides: Partial<ReturnType<typeof logWindow>> = {},
    name = 'backend.log',
  ): Promise<void> {
    page.http
      .expectOne((request) => request.urlWithParams === `${LOGS_URL}/${name}?${query}`)
      .flush(logWindow({ name, ...overrides }));
    await page.settle();
  }

  it('when the reader opens, then it shows the tail of the file and lets the administrator page through it', async () => {
    await open();
    await flushWindow('bytes=20000', { from: 100, to: 220, hasOlder: true, hasNewer: false });

    expect(page.text('h1')).toBe('backend.log');
    expect(page.text('.log-text')).toContain('INFO first line');
    expect(page.text('.range')).toBe('Konec logu');
    expect(page.text('.window-copy button')).toBe('Kopírovat výpis logu');
    expect(page.button('Novější →').disabled).toBe(true);

    await page.click('← Starší');
    await flushWindow('bytes=20000&from=0', { from: 0, to: 100, hasOlder: false, hasNewer: true });

    expect(page.text('.range')).toBe('Začátek logu');
    expect(page.button('← Starší').disabled).toBe(true);

    await page.click('Novější →');
    await flushWindow('bytes=20000&from=100', {
      from: 100,
      to: 220,
      hasOlder: true,
      hasNewer: false,
    });

    expect(page.text('.range')).toBe('Konec logu');
  });

  it('when a rotated file is opened, then its own tail is read', async () => {
    await open('backend.log.2026-10-22.0.gz');
    await flushWindow('bytes=20000', { text: 'older first\n' }, 'backend.log.2026-10-22.0.gz');

    expect(page.text('h1')).toBe('backend.log.2026-10-22.0.gz');
    expect(page.text('.log-text')).toBe('older first');
  });

  it('when the file is gone, then the problem is shown', async () => {
    await open('backend.log.2026-10-01.0.gz');
    const missing = problem(
      404,
      'operations/log-not-found',
      'Soubor nenalezen',
      'Takový log není.',
    );
    page.http
      .expectOne((request) => request.url === `${LOGS_URL}/backend.log.2026-10-01.0.gz`)
      .flush(missing.body, missing.options);
    await page.settle();

    expect(page.text('[role="alert"]')).toBe('Soubor nenalezen. Takový log není.');
  });

  it('when they search, then the newest matches are listed with a way to the older ones and a match opens its window', async () => {
    await open();
    await flushWindow('bytes=20000');

    await page.type('#log-search', 'fio');
    await page.submit('form.search-form');
    page.http
      .expectOne(
        (request) =>
          request.urlWithParams === `${LOGS_URL}/backend.log/search?pattern=fio&limit=50`,
      )
      .flush({
        name: 'backend.log',
        sizeBytes: 220,
        matches: [
          { offset: 150, line: '2026-10-23T10:00:01 WARN second line about Fio' },
          { offset: 50, line: '2026-10-22T10:00:01 WARN older line about Fio' },
        ],
        moreOlder: true,
        scannedFrom: 50,
      });
    await page.settle();

    expect(page.text('[role="status"] .ui-card__intro')).toBe(
      '2 řádky, nejnovější první. Kliknutím zobrazíte řádek i s okolím.',
    );
    expect(page.texts('.match')).toEqual([
      '2026-10-23T10:00:01 WARN second line about Fio',
      '2026-10-22T10:00:01 WARN older line about Fio',
    ]);

    await page.click('Načíst starší shody');
    page.http
      .expectOne(
        (request) =>
          request.urlWithParams === `${LOGS_URL}/backend.log/search?pattern=fio&limit=50&before=50`,
      )
      .flush({
        name: 'backend.log',
        sizeBytes: 220,
        matches: [{ offset: 0, line: '2026-10-21T10:00:01 WARN oldest line about Fio' }],
        moreOlder: false,
        scannedFrom: 0,
      });
    await page.settle();

    expect(page.texts('.match')).toHaveLength(3);
    expect(page.hasButton('Načíst starší shody')).toBe(false);

    page.element<HTMLButtonElement>('.match').click();
    await page.settle();
    await flushWindow('bytes=20000&from=150', { from: 150, to: 220, hasOlder: true });

    expect(page.text('.range')).toBe('Konec logu');
  });

  it('when they ask for the browser error reports, then the search holds their pattern and the newest reports are listed', async () => {
    await open();
    await flushWindow('bytes=20000');

    await page.click('Chyby z prohlížečů');
    page.http
      .expectOne(
        (request) =>
          request.urlWithParams ===
          `${LOGS_URL}/backend.log/search?pattern=Browser%20error&limit=50`,
      )
      .flush({
        name: 'backend.log',
        sizeBytes: 220,
        matches: [
          {
            offset: 150,
            line: '2026-11-04T10:00:01 WARN Browser error kind=pdf-render place=global name=TypeError version=1a2b3c4 browser=safari/18 os=ios display=standalone count=1',
          },
        ],
        moreOlder: false,
        scannedFrom: 150,
      });
    await page.settle();

    expect(page.element<HTMLInputElement>('#log-search').value).toBe('Browser error');
    expect(page.texts('.match')[0]).toContain('kind=pdf-render');
  });

  it('when the pattern is not a valid expression, then the problem is shown at the search', async () => {
    await open();
    await flushWindow('bytes=20000');

    await page.type('#log-search', '(');
    await page.submit('form.search-form');
    const refusal = problem(
      400,
      'operations/invalid-log-pattern',
      'Neplatný výraz',
      'Hledaný výraz není platný regulární výraz.',
    );
    page.http
      .expectOne((request) => request.url === `${LOGS_URL}/backend.log/search`)
      .flush(refusal.body, refusal.options);
    await page.settle();

    expect(page.text('.ui-notice--alert')).toBe(
      'Neplatný výraz. Hledaný výraz není platný regulární výraz.',
    );
  });
});
