import { logWindow } from '../../testing/admin-fixtures';
import { LOGS_URL, LogPageHarness, problem } from '../testing/log-page-harness';
import { AdminLogReader } from './admin-log-reader';

const FIO =
  '2026-11-09T22:09:47.639+01:00  INFO 1 --- [nova-nadeje] [scheduling-1] c.n.a.d.i.fio.FioBankStatementSource     : Fio answered 2 movements';
const FAILED =
  '2026-11-10T00:30:11.402+01:00 ERROR 1 --- [nova-nadeje] [scheduling-1] c.n.a.o.a.backup.BackupWatchService      : Backup watch failed for request 01a1b3c4';
const TRACE = 'java.io.UncheckedIOException: /backups/status.json: No such file or directory';
const TOKEN =
  '2026-11-10T01:16:07.196+01:00  WARN 1 --- [nova-nadeje] [http-nio-8080-exec-4] c.n.a.d.a.AuthorizationServerService     : The connector exchanged a token';
const TAIL = `${[FIO, FAILED, TRACE, TOKEN].join('\n')}\n`;
const UTF8 = new TextEncoder();

function bytes(text: string): number {
  return UTF8.encode(text).length;
}

const FAILED_AT = 40000 + bytes(FIO) + 1;

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

  async function openTail(): Promise<void> {
    await open();
    await flushWindow('bytes=20000', {
      from: 40000,
      to: 40000 + bytes(TAIL),
      hasOlder: true,
      hasNewer: false,
      text: TAIL,
    });
  }

  async function flushSearch(
    query: string,
    matches: { offset: number; line: string }[],
    more = false,
  ): Promise<void> {
    page.http
      .expectOne((request) => request.urlWithParams === `${LOGS_URL}/backend.log/search?${query}`)
      .flush({
        name: 'backend.log',
        sizeBytes: 50000,
        matches,
        moreOlder: more,
        scannedFrom: matches.at(-1)?.offset ?? 0,
      });
    await page.settle();
  }

  it('when the reader opens, then the newest entries come first under their Prague day, each with its time, level, class and message', async () => {
    await openTail();

    expect(page.text('h1')).toBe('backend.log');
    expect(page.texts('.day-title')).toEqual(['10. 11. 2026', '9. 11. 2026']);
    expect(page.texts('.entry')).toEqual([
      'Varování AuthorizationServerService 1:16:07 The connector exchanged a token',
      'Chyba BackupWatchService 0:30:11 Backup watch failed for request 01a1b3c4 UncheckedIOException',
      'Info FioBankStatementSource 22:09:47 Fio answered 2 movements',
    ]);
    expect(page.texts('.ui-segmented button')).toEqual(['Vše', 'Varování', 'Chyby']);
    expect(page.element('.ui-segmented button').getAttribute('aria-checked')).toBe('true');
  });

  it('when the reader opens, then each day is a card with its date inside, above its entries', async () => {
    await openTail();

    expect(page.cardTitled('10. 11. 2026').querySelectorAll('.ui-list .entry')).toHaveLength(2);
    expect(page.cardTitled('9. 11. 2026').querySelectorAll('.ui-list .entry')).toHaveLength(1);
  });

  it('when the reader opens at a line, then the window around it loads and its entry takes the focus', async () => {
    page = await LogPageHarness.open(
      `/sprava/logy/soubor?nazev=backend.log&od=${FAILED_AT}`,
      AdminLogReader,
      '/sprava/logy/soubor',
    );
    await flushWindow(`bytes=20000&from=${FAILED_AT - 10000}`, {
      from: 40000,
      to: 40000 + bytes(TAIL),
      hasOlder: true,
      hasNewer: true,
      text: TAIL,
    });

    expect(page.element('.entry.is-focused').textContent).toContain('Backup watch failed');
    expect(document.activeElement?.textContent).toContain('Backup watch failed');
  });

  it('when the reader opens with a level, then that filter is chosen and its matches are listed', async () => {
    page = await LogPageHarness.open(
      '/sprava/logy/soubor?nazev=backend.log&uroven=varovani',
      AdminLogReader,
      '/sprava/logy/soubor',
    );
    await flushWindow('bytes=20000', { from: 40000, to: 40000 + bytes(TAIL), text: TAIL });
    await flushSearch('pattern=%5E%5CS%2B%5Cs%2B(?:WARN%7CERROR)%5Cb&limit=50', [
      { offset: FAILED_AT, line: FAILED },
    ]);

    expect(
      page.element('.ui-segmented [role="radio"]:nth-child(2)').getAttribute('aria-checked'),
    ).toBe('true');
    expect(page.texts('.entry')).toHaveLength(1);
  });

  it('when they tap an entry, then a sheet shows its time, level, thread, class and the whole message to copy', async () => {
    await openTail();

    page.element<HTMLButtonElement>('.entry.level-error').click();
    await page.settle();

    expect(page.text('dialog h2')).toBe('Chyba v 0:30:11');
    expect(page.texts('dialog .entry-facts > div')).toEqual([
      'Kdy 10. 11. 2026 0:30:11',
      'Vlákno scheduling-1',
      'Třída c.n.a.o.a.backup.BackupWatchService',
    ]);
    expect(page.text('dialog .sheet-message')).toBe('Backup watch failed for request 01a1b3c4');
    expect(page.text('dialog .exception-head')).toBe(
      'java.io. UncheckedIOException /backups/status.json: No such file or directory',
    );
    expect(page.button('Kopírovat záznam')).toBeTruthy();
    expect(page.hasButton('Zobrazit okolí')).toBe(false);
  });

  it('when a message names ids and an entry carries a stack trace, then the ids read as code, the row names the exception and the sheet lays out its frames', async () => {
    const failed =
      '2026-11-10T00:14:20.977+01:00  WARN 1 --- [nova-nadeje] [http-nio-8080-exec-4] o.s.b.j.h.DataSourceHealthIndicator : DataSource health check failed for donor 01a14df4-3471-7bc6-8b0e-ac47d1f547a3';
    const trace = [
      '',
      'org.springframework.jdbc.CannotGetJdbcConnectionException: Failed to obtain JDBC Connection',
      '\tat org.springframework.jdbc.datasource.DataSourceUtils.getConnection(DataSourceUtils.java:84) ~[spring-jdbc-7.0.10.jar!/:7.0.10]',
      '\tat org.springframework.jdbc.core.JdbcTemplate.execute(JdbcTemplate.java:362) ~[spring-jdbc-7.0.10.jar!/:7.0.10]',
    ];
    await open();
    await flushWindow('bytes=20000', { text: `${[failed, ...trace].join('\n')}\n` });

    expect(page.texts('.entry .entry-message code')).toEqual([
      'DataSource',
      '01a14df4-3471-7bc6-8b0e-ac47d1f547a3',
    ]);
    expect(page.text('.entry .entry-more')).toBe('CannotGetJdbcConnectionException + 2 řádky');

    page.element<HTMLButtonElement>('.entry').click();
    await page.settle();

    expect(page.text('dialog .exception-name')).toBe('CannotGetJdbcConnectionException');
    expect(page.texts('dialog .frame-method')).toEqual([
      'DataSourceUtils.getConnection',
      'JdbcTemplate.execute',
    ]);
  });

  it('when they load older lines, then the older entries join below and the first of them takes the focus', async () => {
    await openTail();

    await page.click('Načíst starší řádky');
    const older =
      '2026-11-09T21:00:00.000+01:00  INFO 1 --- [nova-nadeje] [main] c.n.a.App : Backend revision abc is ready\n';
    await flushWindow('bytes=20000&from=20000', {
      from: 40000 - bytes(older),
      to: 40000 + bytes(FIO) + 1,
      hasOlder: false,
      hasNewer: true,
      text: `${older}${FIO}\n`,
    });

    expect(page.texts('.entry')).toHaveLength(4);
    expect(page.texts('.entry').at(-1)).toContain('Backend revision abc is ready');
    expect(document.activeElement?.textContent).toContain('Backend revision abc is ready');
    expect(page.hasButton('Načíst starší řádky')).toBe(false);
  });

  it('when they look for newer lines and the file has not grown, then the page says so', async () => {
    await openTail();
    const end = 40000 + bytes(TAIL);

    await page.click('Načíst novější řádky');
    await flushWindow(`bytes=20000&from=${end}`, {
      from: end,
      to: end,
      hasOlder: true,
      hasNewer: false,
      text: '',
    });

    expect(page.text('.live-notice')).toBe('Žádné nové řádky.');
    expect(page.texts('.entry')).toHaveLength(3);
  });

  it('when they show only errors, then the backend is searched for error lines and the matches open their surroundings', async () => {
    await openTail();

    await page.click('Chyby');
    await flushSearch(
      'pattern=%5E%5CS%2B%5Cs%2BERROR%5Cb&limit=50',
      [{ offset: FAILED_AT, line: FAILED }],
      true,
    );

    expect(page.texts('.entry')).toEqual([
      'Chyba BackupWatchService 0:30:11 Backup watch failed for request 01a1b3c4',
    ]);
    expect(page.element('.ui-segmented button:nth-child(3)').getAttribute('aria-checked')).toBe(
      'true',
    );

    await page.click('Načíst starší řádky');
    await flushSearch(`pattern=%5E%5CS%2B%5Cs%2BERROR%5Cb&limit=50&before=${FAILED_AT}`, []);

    expect(page.texts('.entry')).toHaveLength(1);

    page.element<HTMLButtonElement>('.entry').click();
    await page.settle();
    await page.click('Zobrazit okolí');
    await flushWindow(`bytes=20000&from=${FAILED_AT - 10000}`, {
      from: 40000,
      to: 40000 + bytes(TAIL),
      hasOlder: true,
      hasNewer: true,
      text: TAIL,
    });

    expect(page.element('.ui-segmented button').getAttribute('aria-checked')).toBe('true');
    expect(page.texts('.entry')).toHaveLength(3);
    expect(page.element('.entry.is-focused').textContent).toContain('Backup watch failed');
  });

  it('when they search within warnings, then the level and the text are asked together', async () => {
    await openTail();

    await page.click('Varování');
    await flushSearch('pattern=%5E%5CS%2B%5Cs%2B(?:WARN%7CERROR)%5Cb&limit=50', [
      { offset: 41500, line: TOKEN },
    ]);
    await page.type('#log-search', 'token');
    await page.submit('form.search-form');
    await flushSearch('pattern=%5E%5CS%2B%5Cs%2B(?:WARN%7CERROR)%5Cb.*(?:token)&limit=50', [
      { offset: 41500, line: TOKEN },
    ]);

    expect(page.texts('.entry')).toEqual([
      'Varování AuthorizationServerService 1:16:07 The connector exchanged a token',
    ]);
  });

  it('when the pattern is not a valid expression, then the problem is shown at the search and no stale results stay', async () => {
    await openTail();

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

    expect(page.text('.search-form [role="alert"]')).toBe(
      'Neplatný výraz. Hledaný výraz není platný regulární výraz.',
    );
    expect(page.texts('.entry')).toEqual([]);
  });

  it('when they ask for the browser error reports, then the search holds their pattern and the reports are listed', async () => {
    await openTail();

    await page.click('Chyby z prohlížečů');
    await flushSearch('pattern=Browser%20error&limit=50', [
      {
        offset: 41800,
        line: '2026-11-10T01:20:00.000+01:00  WARN 1 --- [nova-nadeje] [http-nio-8080-exec-1] c.n.a.o.i.r.ClientErrorController : Browser error kind=pdf-render count=1',
      },
    ]);

    expect(page.element<HTMLInputElement>('#log-search').value).toBe('Browser error');
    expect(page.texts('.entry')[0]).toContain('kind=pdf-render');
  });

  it('when the file writes no level, then the level filter is not offered', async () => {
    await open('backup.log');
    await flushWindow(
      'bytes=20000',
      { text: '2026-11-10T03:00:22+0100 backup written: nfnn-2026-11-10_0300.dump.age\n' },
      'backup.log',
    );

    expect(page.has('.ui-segmented')).toBe(false);
    expect(page.texts('.entry')[0]).toMatch(
      /^3:00:22 backup written: nfnn-2026-11-10_0300\. ?dump\.age$/,
    );
  });

  it('when the file is gone, then the problem is shown with a retry', async () => {
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

    expect(page.text('[role="alert"] p')).toBe('Soubor nenalezen. Takový log není.');
    expect(page.hasButton('Zkusit znovu')).toBe(true);
  });
});
