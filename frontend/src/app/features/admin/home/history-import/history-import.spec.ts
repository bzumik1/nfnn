import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HistoryImportResponse, ImportStateResponse } from '../../admin-api';
import { historyImport, importState } from '../../testing/admin-fixtures';
import { HISTORY_MAX_POLLS, HISTORY_POLL_MS, HistoryImport } from './history-import';

const HISTORY_URL = '/api/admin/donations/import/history';
const IMPORT_STATE_URL = '/api/admin/donations/import-state';

describe('Given the part for older bank payments on the import card', () => {
  let fixture: ComponentFixture<HistoryImport>;
  let http: HttpTestingController;
  let finished: ImportStateResponse[];

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    vi.setSystemTime(new Date('2026-11-05T10:00:05Z'));
    TestBed.configureTestingModule({
      imports: [HistoryImport],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    finished = [];
  });

  afterEach(() => {
    fixture?.destroy();
    http.verify();
    vi.useRealTimers();
  });

  async function open(state: ImportStateResponse = importState()): Promise<void> {
    fixture = TestBed.createComponent(HistoryImport);
    fixture.componentRef.setInput('state', state);
    fixture.componentInstance.finished.subscribe((value) => finished.push(value));
    fixture.detectChanges();
    await settle();
  }

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function dateField(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input#history-from');
  }

  function button(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[type="submit"]');
  }

  function status(): string {
    return text('[role="status"]');
  }

  function alert(): string {
    return text('[role="alert"]');
  }

  async function submit(): Promise<void> {
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    await settle();
  }

  async function changeDate(value: string): Promise<void> {
    const input = dateField();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function poll(run: HistoryImportResponse | null, overrides = {}): Promise<void> {
    await vi.advanceTimersByTimeAsync(HISTORY_POLL_MS);
    http.expectOne(IMPORT_STATE_URL).flush(importState({ historyImport: run, ...overrides }));
    await settle();
  }

  describe('when it opens without an earlier run', () => {
    beforeEach(async () => {
      await open();
    });

    it('then it names the part, explains the limit and lists the unlock steps in order', () => {
      expect(text('h3')).toBe('Starší platby z banky');
      expect(text('.history-lead')).toBe(
        'Web stahuje platby z banky každou hodinu za posledních 89 dní. Starší platby vydá Fio jen do 10 minut po odemčení historie.',
      );
      const steps = Array.from(
        fixture.nativeElement.querySelectorAll('ol li') as NodeListOf<HTMLElement>,
      ).map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim());
      expect(steps).toEqual([
        'V internetovém bankovnictví Fio otevřete Nastavení → API.',
        'U tokenu webu klikněte na ikonu zámku a historii odemkněte.',
        'Do 10 minut zvolte datum a stiskněte Načíst starší platby.',
      ]);
    });

    it('then the date field is labelled, starts at the default day, ends today in Prague and explains repeats', () => {
      expect(text('label[for="history-from"]')).toBe('Stáhnout platby od');
      expect(dateField().value).toBe('2026-01-01');
      expect(dateField().max).toBe('2026-11-05');
      const hint = fixture.nativeElement.querySelector(
        `#${dateField().getAttribute('aria-describedby')?.split(' ')[0]}`,
      );
      expect((hint?.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(
        'Platby za posledních 89 dní web stáhne i bez odemčení. Načíst jde i znovu: platby, které web už má, se nezdvojí.',
      );
      expect(button().textContent?.trim()).toBe('Načíst starší platby');
      expect(button().disabled).toBe(false);
      expect(status()).toBe('');
      expect(alert()).toBe('');
    });

    it('and they press the button, then the chosen day is posted and the button waits for the bank', async () => {
      await changeDate('2025-06-01');
      await submit();

      const request = http.expectOne(HISTORY_URL);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ from: '2025-06-01' });
      expect(button().disabled).toBe(true);
      expect(button().textContent?.trim()).toBe('Žádáme banku…');

      request.flush(historyImport({ from: '2025-06-01' }), { status: 202, statusText: 'Accepted' });
      await settle();

      expect(status()).toBe('Čekáme na banku, stahování začne v 11:00.');
      expect(button().disabled).toBe(true);
      expect(button().textContent?.trim()).toBe('Žádáme banku…');
    });

    it('and the date is emptied, then nothing is posted and the field says what is missing', async () => {
      await changeDate('');
      await submit();

      http.expectNone(HISTORY_URL);
      expect(text('.field-error')).toContain('Zadejte prosím den');
    });

    it('and a day after today is typed, then nothing is posted and the field says so', async () => {
      await changeDate('2026-11-06');
      await submit();

      http.expectNone(HISTORY_URL);
      expect(dateField().getAttribute('aria-invalid')).toBe('true');
      expect(text('app-form-field')).toContain('Zvolte prosím den nejpozději dnes.');
    });

    it('and the server refuses, then its problem is the alert and the button is free again', async () => {
      await submit();
      http.expectOne(HISTORY_URL).flush(
        {
          type: 'https://nfnn.cz/problems/donations/bank-import-off',
          title: 'Stahování z banky je vypnuté',
          detail: 'Chybí token Fio API.',
          status: 409,
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(alert()).toBe('Stahování z banky je vypnuté. Chybí token Fio API.');
      expect(button().disabled).toBe(false);
    });

    it('and the request fails without a problem, then a Czech sentence says to try again', async () => {
      await submit();
      http.expectOne(HISTORY_URL).flush(null, { status: 502, statusText: 'Bad Gateway' });
      await settle();

      expect(alert()).toBe('Požadavek se nepodařilo předat bance. Zkuste to prosím znovu.');
    });
  });

  describe('when a run is queued', () => {
    beforeEach(async () => {
      await open();
      await submit();
      http.expectOne(HISTORY_URL).flush(historyImport(), { status: 202, statusText: 'Accepted' });
      await settle();
    });

    it('then the state is asked for every 3 s and the running run says from which day it downloads', async () => {
      await vi.advanceTimersByTimeAsync(HISTORY_POLL_MS - 1);
      http.expectNone(IMPORT_STATE_URL);

      await poll(historyImport({ status: 'RUNNING' }));

      expect(status()).toBe('Stahujeme platby od 01. 01. 2026…');
      expect(button().disabled).toBe(true);
      expect(finished).toEqual([]);
    });

    it('then a queued run whose start has passed says it waits for its turn', async () => {
      await poll(historyImport({ startsAt: '2026-11-05T10:00:04Z' }));

      expect(status()).toBe('Stahování čeká na řadu…');
    });

    it('then a completed run names the period and the new payments, stops asking and hands the state on', async () => {
      await poll(historyImport({ status: 'RUNNING' }));
      await poll(
        historyImport({ status: 'COMPLETED', added: 5, finishedAt: '2026-11-05T10:01:00Z' }),
        { coveredFrom: '2026-01-01' },
      );

      expect(status()).toBe('Hotovo: staženo období 01. 01. 2026 – 05. 11. 2026, 5 nových plateb.');
      expect(button().disabled).toBe(false);
      expect(button().textContent?.trim()).toBe('Načíst starší platby');
      expect(finished.map((state) => state.coveredFrom)).toEqual(['2026-01-01']);

      await vi.advanceTimersByTimeAsync(HISTORY_POLL_MS * 3);
      http.expectNone(IMPORT_STATE_URL);
    });

    it('then a locked history is an alert that points back at the steps', async () => {
      await poll(
        historyImport({
          status: 'HISTORY_LOCKED',
          failure: 'HISTORY_LOCKED',
          finishedAt: '2026-11-05T10:00:30Z',
        }),
      );

      expect(alert()).toBe(
        'Historie ve Fio je zamčená. Odemkněte ji podle kroků výše a zkuste to znovu.',
      );
      expect(status()).toBe('');
      expect(finished.length).toBe(1);
    });

    it('then a failed run is an alert naming the failure in Czech', async () => {
      await poll(
        historyImport({
          status: 'FAILED',
          failure: 'TRANSPORT',
          finishedAt: '2026-11-05T10:00:30Z',
        }),
      );

      expect(alert()).toBe('Platby se nepodařilo stáhnout: Fio nebylo dostupné. Zkuste to znovu.');
    });

    it('then a failed check is asked again at the next step', async () => {
      await vi.advanceTimersByTimeAsync(HISTORY_POLL_MS);
      http.expectOne(IMPORT_STATE_URL).flush(null, { status: 502, statusText: 'Bad Gateway' });
      await settle();

      await poll(historyImport({ status: 'RUNNING' }));

      expect(status()).toBe('Stahujeme platby od 01. 01. 2026…');
    });

    it(`then after ${HISTORY_MAX_POLLS} checks it stops and says the result comes after a reload`, async () => {
      for (let check = 0; check < HISTORY_MAX_POLLS; check++) {
        await poll(historyImport({ status: 'RUNNING' }));
      }

      await vi.advanceTimersByTimeAsync(HISTORY_POLL_MS * 3);
      http.expectNone(IMPORT_STATE_URL);
      expect(status()).toBe('Stahování ještě běží; výsledek uvidíte po obnovení stránky.');
    });

    it('and the part is left, then it stops asking', async () => {
      fixture.destroy();

      await vi.advanceTimersByTimeAsync(HISTORY_POLL_MS * 3);
      http.expectNone(IMPORT_STATE_URL);
    });
  });

  describe('when it opens while an earlier run is still running', () => {
    beforeEach(async () => {
      await open(importState({ historyImport: historyImport({ status: 'RUNNING' }) }));
    });

    it('then it shows the run, keeps the button busy and asks until the run ends', async () => {
      expect(status()).toBe('Stahujeme platby od 01. 01. 2026…');
      expect(button().disabled).toBe(true);

      await poll(
        historyImport({ status: 'COMPLETED', added: 1, finishedAt: '2026-11-05T10:01:00Z' }),
      );

      expect(status()).toBe('Hotovo: staženo období 01. 01. 2026 – 05. 11. 2026, 1 nová platba.');
      expect(finished.length).toBe(1);
    });
  });

  describe('when it opens after an earlier run finished', () => {
    it.each([
      [0, 'žádná nová platba'],
      [1, '1 nová platba'],
      [3, '3 nové platby'],
      [12, '12 nových plateb'],
    ])(
      'with %i new payments, then the result line says "%s" and nothing is asked',
      async (added, phrase) => {
        await open(
          importState({
            historyImport: historyImport({
              from: '2025-03-01',
              to: '2026-11-04',
              status: 'COMPLETED',
              added,
              finishedAt: '2026-11-04T10:01:00Z',
            }),
          }),
        );

        expect(status()).toBe(`Hotovo: staženo období 01. 03. 2025 – 04. 11. 2026, ${phrase}.`);
        expect(button().disabled).toBe(false);
        await vi.advanceTimersByTimeAsync(HISTORY_POLL_MS * 2);
        http.expectNone(IMPORT_STATE_URL);
      },
    );

    it('with a locked history, then the alert stays shown and the button is free', async () => {
      await open(
        importState({
          historyImport: historyImport({ status: 'HISTORY_LOCKED', failure: 'HISTORY_LOCKED' }),
        }),
      );

      expect(alert()).toBe(
        'Historie ve Fio je zamčená. Odemkněte ji podle kroků výše a zkuste to znovu.',
      );
      expect(button().disabled).toBe(false);
    });
  });

  describe('when the server names another default day', () => {
    it('then the field starts at it', async () => {
      await open(importState({ defaultHistoryFrom: '2024-05-01' }));

      expect(dateField().value).toBe('2024-05-01');
    });
  });
});
