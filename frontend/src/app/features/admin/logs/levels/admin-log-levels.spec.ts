import { loggerEntry, logOverride } from '../../testing/admin-fixtures';
import { LOGGERS_URL, LogPageHarness, problem } from '../testing/log-page-harness';
import { AdminLogLevels } from './admin-log-levels';
import { accessibleText } from '../../../../shared/ui/busy-label/testing/accessible-text';
import { labelFaces } from '../../../../shared/ui/busy-label/testing/label-faces';
import { withOrdinarySpaces } from '../../../../../testing/ordinary-spaces';
import {
  alertsHoldingAButton,
  loadFailureAlerts,
  pressLoadFailureRetry,
} from '../../../../shared/ui/load-failure/testing/load-failure-retry';

const LOGGERS = [
  loggerEntry({ logger: 'ROOT' }),
  loggerEntry({ logger: 'cz.novanadeje.app' }),
  loggerEntry({ logger: 'org.hibernate.SQL', configuredLevel: null }),
];
const RAISED = [
  loggerEntry({ logger: 'ROOT' }),
  loggerEntry({
    logger: 'cz.novanadeje.app',
    effectiveLevel: 'DEBUG',
    override: logOverride({ level: 'DEBUG', until: '2026-10-23T10:30:00Z' }),
  }),
];

describe('Given an administrator on the log levels page', () => {
  let page: LogPageHarness;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-23T10:07:30Z'));
    page = await LogPageHarness.open('/sprava/logy/urovne', AdminLogLevels);
  });

  afterEach(() => {
    vi.useRealTimers();
    page.http.verify();
  });

  async function load(loggers = LOGGERS): Promise<void> {
    page.http.expectOne(LOGGERS_URL).flush({ loggers });
    await page.settle();
  }

  function radio(name: string): HTMLButtonElement {
    const found = Array.from(
      document.querySelectorAll<HTMLButtonElement>('dialog [role="radio"]'),
    ).find((candidate) =>
      withOrdinarySpaces(candidate.textContent)?.replace(/\s+/g, ' ').trim().startsWith(name),
    );
    if (found === undefined) {
      throw new Error(`No choice ${name}`);
    }
    return found;
  }

  it('when the page opens, then each watched logger reads as a row with what it writes and its level, and another can be named', async () => {
    await load();

    expect(page.text('h1')).toBe('Úrovně logování');
    expect(page.has('.overrides')).toBe(false);
    expect(page.texts('.watched .ui-list__row')).toEqual([
      'Vše ostatní ROOT INFO',
      'Aplikace cz.novanadeje.app INFO',
      'Dotazy do databáze, bez hodnot org.hibernate.SQL · zděděno INFO',
      'Jiný logger…',
    ]);
  });

  it('when a level is raised for a while, then it leads the page with the time it goes back and a way to end it now', async () => {
    await load(RAISED);

    expect(page.texts('.overrides .ui-list__row')).toEqual([
      'cz.novanadeje.app INFO → DEBUG · vrátí se samo za 23 min (23. 10. 2026 12:30) Vrátit',
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
    expect(page.has('.overrides')).toBe(false);
  });

  it('when they end a raised level and the answer has not come yet, then the button is locked and keeps both labels under the returning name', async () => {
    await load(RAISED);

    await page.click('Vrátit úroveň loggeru cz.novanadeje.app');

    const reset = page.element<HTMLButtonElement>('.overrides button');
    expect(reset.disabled).toBe(true);
    expect(labelFaces(reset)).toEqual(['Vrátit', 'Vracíme…']);
    expect(page.text('.overrides .ui-list__value')).toBe('Vracíme…');
    page.http
      .expectOne(`${LOGGERS_URL}/cz.novanadeje.app`)
      .flush(null, { status: 204, statusText: 'No Content' });
    page.http.expectOne(LOGGERS_URL).flush({ loggers: LOGGERS });
    await page.settle();
  });

  it('when they put a level and the answer has not come yet, then the button is locked and keeps both labels under the setting name', async () => {
    await load();
    page.element<HTMLButtonElement>('.watched button.ui-list__row').click();
    await page.settle();
    radio('WARN').click();
    await page.settle();
    await page.click('1 h');

    await page.click('Nastavit na 1 h');

    const submit = page.element<HTMLButtonElement>('dialog button.submit');
    expect(submit.disabled).toBe(true);
    expect(labelFaces(submit)).toEqual(['Nastavit na 1 h', 'Nastavujeme…']);
    expect(accessibleText(submit)).toBe('Nastavujeme…');
    page.http
      .expectOne(`${LOGGERS_URL}/ROOT`)
      .flush(logOverride({ logger: 'ROOT', level: 'WARN', until: '2026-10-23T11:07:30Z' }));
    page.http.expectOne(LOGGERS_URL).flush({ loggers: LOGGERS });
    await page.settle();
  });

  it('when a level is raised, then the raised and the watched loggers are cards with their heading inside, above their rows', async () => {
    await load(RAISED);

    for (const heading of ['Dočasně změněno', 'Sledované loggery']) {
      expect(page.cardTitled(heading).querySelector('.ui-list .ui-list__row')).not.toBeNull();
    }
  });

  it('when they tap a logger, choose a level and a time, then the level is put and the sheet closes', async () => {
    await load();

    page.element<HTMLButtonElement>('.watched button.ui-list__row').click();
    await page.settle();

    expect(page.text('dialog h2')).toBe('Úroveň loggeru ROOT');
    expect(radio('TRACE').disabled).toBe(true);
    expect(page.text('dialog .trace-note')).toBe('TRACE jen pro cz.novanadeje.app');

    radio('WARN').click();
    await page.settle();
    expect(
      page.element('dialog .ui-segmented > .ui-segmented__thumb').getAttribute('aria-hidden'),
    ).toBe('true');
    await page.click('1 h');
    await page.click('Nastavit na 1 h');
    const put = page.http.expectOne(`${LOGGERS_URL}/ROOT`);
    expect(put.request.body).toEqual({ level: 'WARN', minutes: 60 });
    put.flush(logOverride({ logger: 'ROOT', level: 'WARN', until: '2026-10-23T11:07:30Z' }));
    page.http.expectOne(LOGGERS_URL).flush({ loggers: LOGGERS });
    await page.settle();

    expect(page.has('dialog[open]')).toBe(false);
    expect(page.text('.ui-notice--status')).toBe(
      'Logger ROOT má úroveň WARN do 23. 10. 2026 13:07.',
    );
  });

  it('when they name another logger, then a wrong name is refused at the field and the site’s own code may take TRACE', async () => {
    await load();

    await page.click('Jiný logger…');
    await page.type('#log-level-logger', 'not a logger!');
    await page.click('Nastavit na 30 min');

    expect(page.element('#log-level-logger').getAttribute('aria-invalid')).toBe('true');
    expect(page.text('dialog form')).toContain(
      'Název loggeru je ROOT nebo tečkami oddělený název balíčku či třídy.',
    );
    page.http.expectNone((request) => request.method === 'PUT');

    await page.type('#log-level-logger', 'cz.novanadeje.app.donations');
    radio('TRACE').click();
    await page.settle();
    await page.click('Nastavit na 30 min');
    const put = page.http.expectOne(`${LOGGERS_URL}/cz.novanadeje.app.donations`);
    expect(put.request.body).toEqual({ level: 'TRACE', minutes: 30 });
    put.flush(logOverride({ logger: 'cz.novanadeje.app.donations', level: 'TRACE' }));
    page.http.expectOne(LOGGERS_URL).flush({ loggers: LOGGERS });
    await page.settle();

    expect(page.has('dialog[open]')).toBe(false);
  });

  it('when the backend refuses the level, then the sheet stays open with the problem', async () => {
    await load();

    page.element<HTMLButtonElement>('.watched button.ui-list__row').click();
    await page.settle();
    await page.click('Nastavit na 30 min');
    const refusal = problem(
      400,
      'operations/protected-logger',
      'Chráněný logger',
      'Tento logger by zapisoval citlivá data.',
    );
    page.http.expectOne(`${LOGGERS_URL}/ROOT`).flush(refusal.body, refusal.options);
    await page.settle();

    expect(page.text('dialog [role="alert"]')).toBe(
      'Chráněný logger. Tento logger by zapisoval citlivá data.',
    );
    expect(page.has('dialog[open]')).toBe(true);
  });

  it('when the levels fail to load, then the page offers a retry', async () => {
    page.http.expectOne(LOGGERS_URL).flush(null, { status: 500, statusText: 'Error' });
    await page.settle();

    expect(loadFailureAlerts(page.fixture.nativeElement)).toEqual([
      'Úrovně logování se nepodařilo načíst.',
    ]);
    expect(alertsHoldingAButton(page.fixture.nativeElement)).toBe(0);
    const retry = pressLoadFailureRetry(page.fixture.nativeElement);
    await page.settle();
    expect(retry.getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement).toBe(retry);
    expect(loadFailureAlerts(page.fixture.nativeElement)).toEqual([
      'Úrovně logování se nepodařilo načíst.',
    ]);
    await load();

    expect(page.texts('.watched .ui-list__row')).toHaveLength(4);
  });
});
