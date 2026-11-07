import { loggerEntry, logOverride } from '../../testing/admin-fixtures';
import { LOGGERS_URL, LogPageHarness, problem } from '../testing/log-page-harness';
import { AdminLogLevels } from './admin-log-levels';

const LOGGERS = [
  loggerEntry({ logger: 'ROOT' }),
  loggerEntry({ logger: 'cz.novanadeje.app' }),
  loggerEntry({ logger: 'org.hibernate.SQL', configuredLevel: null }),
];

describe('Given an administrator on the log levels page', () => {
  let page: LogPageHarness;

  beforeEach(async () => {
    page = await LogPageHarness.open('/sprava/logy/urovne', AdminLogLevels);
  });

  afterEach(() => {
    page.http.verify();
  });

  async function load(): Promise<void> {
    page.http.expectOne(LOGGERS_URL).flush({ loggers: LOGGERS });
    await page.settle();
  }

  it('when they raise a logger for a while, then the level is put and the list shows the temporary level with a reset', async () => {
    await load();

    expect(page.text('h1')).toBe('Úrovně logování');
    expect(page.texts('.levels tbody tr .logger-name')).toEqual([
      'ROOT',
      'cz.novanadeje.app',
      'org.hibernate.SQL',
    ]);
    expect(page.texts('.levels tbody tr:nth-child(3) td')[1]).toBe('zděděno');

    await page.type('#log-level-logger', 'cz.novanadeje.app');
    await page.choose('#log-level-level', 0);
    await page.type('#log-level-minutes', '10');
    await page.submit('form.level-form');
    const put = page.http.expectOne(`${LOGGERS_URL}/cz.novanadeje.app`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ level: 'TRACE', minutes: 10 });
    put.flush(logOverride({ level: 'TRACE', until: '2026-10-23T10:10:00Z' }));
    page.http.expectOne(LOGGERS_URL).flush({
      loggers: [
        loggerEntry({ logger: 'ROOT' }),
        loggerEntry({
          logger: 'cz.novanadeje.app',
          effectiveLevel: 'TRACE',
          override: logOverride({ level: 'TRACE', until: '2026-10-23T10:10:00Z' }),
        }),
      ],
    });
    await page.settle();

    expect(page.text('.ui-notice--status')).toBe(
      'Logger cz.novanadeje.app má úroveň TRACE do 23. 10. 2026 12:10.',
    );
    expect(page.texts('.levels tbody tr:nth-child(2) td').slice(1, 4)).toEqual([
      'INFO',
      'TRACE',
      'do 23. 10. 2026 12:10',
    ]);

    await page.click('Vrátit úroveň loggeru cz.novanadeje.app');
    const reset = page.http.expectOne(`${LOGGERS_URL}/cz.novanadeje.app`);
    expect(reset.request.method).toBe('DELETE');
    reset.flush(null, { status: 204, statusText: 'No Content' });
    page.http.expectOne(LOGGERS_URL).flush({ loggers: LOGGERS });
    await page.settle();

    expect(page.text('.ui-notice--status')).toBe(
      'Logger cz.novanadeje.app má zase původní úroveň.',
    );
    expect(page.has('.levels tr.overridden')).toBe(false);
  });

  it('when the logger name is not a Java name or the minutes are out of range, then the form says so and posts nothing', async () => {
    await load();

    await page.type('#log-level-logger', 'not a logger!');
    await page.type('#log-level-minutes', '0');
    await page.submit('form.level-form');

    expect(page.element('#log-level-logger').getAttribute('aria-invalid')).toBe('true');
    expect(page.text('form.level-form')).toContain(
      'Název loggeru je ROOT nebo tečkami oddělený název balíčku či třídy.',
    );
    expect(page.text('form.level-form')).toContain('Zadejte 1 až 1440 minut (nejdéle jeden den).');
    page.http.expectNone((request) => request.method === 'PUT');
  });

  it('when the backend refuses the level, then the problem is shown as an alert', async () => {
    await load();

    await page.type('#log-level-logger', 'cz.novanadeje.app');
    await page.submit('form.level-form');
    const refusal = problem(
      400,
      'operations/protected-logger',
      'Chráněný logger',
      'Tento logger by zapisoval citlivá data.',
    );
    page.http.expectOne(`${LOGGERS_URL}/cz.novanadeje.app`).flush(refusal.body, refusal.options);
    await page.settle();

    expect(page.text('.ui-notice--alert')).toBe(
      'Chráněný logger. Tento logger by zapisoval citlivá data.',
    );
  });

  it('when the levels fail to load, then the page offers a retry', async () => {
    page.http.expectOne(LOGGERS_URL).flush(null, { status: 500, statusText: 'Error' });
    await page.settle();

    expect(page.text('[role="alert"]')).toContain('Úrovně logování se nepodařilo načíst.');

    await page.click('Zkusit znovu');
    await load();

    expect(page.texts('.levels tbody tr')).toHaveLength(3);
  });
});
