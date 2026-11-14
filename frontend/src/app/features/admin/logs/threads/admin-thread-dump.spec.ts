import { DIAGNOSTICS_URL, LogPageHarness } from '../testing/log-page-harness';
import { AdminThreadDump } from './admin-thread-dump';

const DUMP = [
  '"main" #1 state=RUNNABLE',
  '    at java.base/java.lang.Thread.run(Thread.java:1583)',
  '"scheduling-1" #40 daemon state=TIMED_WAITING',
  '',
].join('\n');

describe('Given an administrator on the thread dump page', () => {
  let page: LogPageHarness;

  beforeEach(async () => {
    page = await LogPageHarness.open('/sprava/logy/vlakna', AdminThreadDump);
  });

  afterEach(() => {
    page.http.verify();
  });

  it('when the dump loads, then the threads are counted by state and the whole dump can be read and copied', async () => {
    page.http.expectOne(`${DIAGNOSTICS_URL}/threads`).flush(DUMP);
    await page.settle();

    expect(page.text('h1')).toBe('Výpis vláken');
    expect(page.texts('.states .ui-list__row')).toEqual(['Celkem 2', 'Běží 1', 'Čekají na čas 1']);
    expect(page.text('.dump')).toContain('"scheduling-1" #40 daemon state=TIMED_WAITING');
    expect(page.button('Kopírovat výpis vláken')).toBeTruthy();
  });

  it('when the dump loads, then the counts and the whole dump are cards with their heading inside, the dump with its copy and reload', async () => {
    page.http.expectOne(`${DIAGNOSTICS_URL}/threads`).flush(DUMP);
    await page.settle();

    expect(page.cardTitled('Podle stavu').querySelector('.ui-list .ui-list__row')).not.toBeNull();
    const dump = page.cardTitled('Celý výpis');
    expect(dump.querySelector('.ui-card__bar app-copy-button')).not.toBeNull();
    expect(dump.querySelector('pre')?.textContent).toContain('"main" #1 state=RUNNABLE');
    expect(dump.querySelector('button.reload')?.textContent?.trim()).toBe('Načíst znovu');
  });

  it('when they load it again, then a fresh dump replaces the old one', async () => {
    page.http.expectOne(`${DIAGNOSTICS_URL}/threads`).flush(DUMP);
    await page.settle();

    await page.click('Načíst znovu');
    page.http.expectOne(`${DIAGNOSTICS_URL}/threads`).flush('"main" #1 state=BLOCKED\n');
    await page.settle();

    expect(page.texts('.states .ui-list__row')).toEqual(['Celkem 1', 'Zablokovaná 1']);
  });

  it('when the dump fails, then the page offers a retry', async () => {
    page.http
      .expectOne(`${DIAGNOSTICS_URL}/threads`)
      .flush(null, { status: 500, statusText: 'Error' });
    await page.settle();

    expect(page.text('[role="alert"]')).toContain('Výpis vláken se nepodařilo načíst.');

    await page.click('Zkusit znovu');
    page.http.expectOne(`${DIAGNOSTICS_URL}/threads`).flush(DUMP);
    await page.settle();

    expect(page.has('.dump')).toBe(true);
  });
});
