import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HistoryImportResponse, ImportStateResponse } from '../../admin-api';
import { historyImport, importState } from '../../testing/admin-fixtures';
import { HistoryImport } from './history-import';

const HISTORY_URL = '/api/admin/donations/import/history';
const IMPORT_STATE_URL = '/api/admin/donations/import-state';
const POLL_MS = 3000;
const MAX_POLLS = 40;

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
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
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

  function checkAgain(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('button.history-check-again');
  }

  function busy(): boolean {
    return button().getAttribute('aria-disabled') === 'true';
  }

  function status(): string {
    return text('[role="status"]');
  }

  function alert(): string {
    return text('[role="alert"]');
  }

  function fieldError(): string {
    return text('.field-error');
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
    await vi.advanceTimersByTimeAsync(POLL_MS);
    http.expectOne(IMPORT_STATE_URL).flush(importState({ historyImport: run, ...overrides }));
    await settle();
  }

  function problem(code: string, status: number) {
    return {
      body: {
        type: `https://nfnn.cz/problems/donations/${code}`,
        title: 'Odmítnuto',
        detail: 'Podrobnost serveru.',
        status,
      },
      options: { status, statusText: 'Bad Request' },
    };
  }

  describe('when it opens without an earlier run', () => {
    beforeEach(async () => {
      await open();
    });

    it('then it names the part, explains the limit with one number and lists the steps with the day first', () => {
      expect(text('h3')).toBe('Starší platby z banky');
      expect(text('.history-lead')).toBe(
        'Nové platby web stahuje z banky sám každou hodinu. Platby starší než 89 dní vydá Fio jen do 10 minut po odemčení historie v internetovém bankovnictví.',
      );
      const steps = Array.from(
        fixture.nativeElement.querySelectorAll('ol li') as NodeListOf<HTMLElement>,
      ).map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim());
      expect(steps).toEqual([
        'Níže zvolte den, od kterého platby chcete.',
        'V internetovém bankovnictví Fio otevřete Nastavení → API.',
        'U tokenu, který používá tento web, klikněte na ikonu zámku a historii odemkněte.',
        'Do 10 minut se vraťte sem a stiskněte „Načíst starší platby“.',
      ]);
      expect(
        (fixture.nativeElement.querySelector('section') as HTMLElement).getAttribute('id'),
      ).toBe('starsi-platby');
    });

    it('then the date field is labelled, starts at the default day, lies between 2000 and today in Prague and explains repeats', () => {
      expect(text('label[for="history-from"]')).toBe('Stáhnout platby od');
      expect(dateField().value).toBe('2026-01-01');
      expect(dateField().min).toBe('2000-01-01');
      expect(dateField().max).toBe('2026-11-05');
      const hint = fixture.nativeElement.querySelector(
        `#${dateField().getAttribute('aria-describedby')?.split(' ')[0]}`,
      );
      expect((hint?.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(
        'Platby za posledních 89 dní web stáhne i bez odemčení. Načíst je můžete i opakovaně: platby, které web už má, se nezdvojí.',
      );
      expect(button().textContent?.trim()).toBe('Načíst starší platby');
      expect(button().disabled).toBe(false);
      expect(busy()).toBe(false);
      expect(checkAgain()).toBeNull();
      expect(status()).toBe('');
      expect(alert()).toBe('');
    });

    it('and they press the button, then the chosen day is posted and the button stays focusable while it waits for the bank', async () => {
      await changeDate('2025-06-01');
      await submit();

      const request = http.expectOne(HISTORY_URL);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ from: '2025-06-01' });
      expect(button().disabled).toBe(false);
      expect(busy()).toBe(true);
      expect(button().textContent?.trim()).toBe('Žádáme banku…');

      request.flush(historyImport({ from: '2025-06-01' }), { status: 202, statusText: 'Accepted' });
      await settle();

      expect(status()).toBe(
        'Fio přijímá jeden dotaz za 30 sekund. Stahování začne samo nejpozději v 11:00:20. Stránku můžete zavřít, výsledek tu uvidíte i později.',
      );
      expect(busy()).toBe(true);
      expect(button().textContent?.trim()).toBe('Žádáme banku…');
    });

    it('and they press the button again while it waits, then nothing more is posted', async () => {
      await submit();
      const request = http.expectOne(HISTORY_URL);

      await submit();

      http.expectNone(HISTORY_URL);
      request.flush(historyImport(), { status: 202, statusText: 'Accepted' });
      await settle();
      await submit();
      http.expectNone(HISTORY_URL);
    });

    it('and today is chosen, then it is posted', async () => {
      await changeDate('2026-11-05');
      await submit();

      expect(http.expectOne(HISTORY_URL).request.body).toEqual({ from: '2026-11-05' });
    });

    it('and the date is emptied, then nothing is posted and the field says what is missing', async () => {
      await changeDate('');
      await submit();

      http.expectNone(HISTORY_URL);
      expect(fieldError()).toContain('Zadejte prosím den');
    });

    it('and a day after today is typed, then nothing is posted, the field says so and takes focus', async () => {
      await changeDate('2026-11-06');
      await submit();

      http.expectNone(HISTORY_URL);
      expect(dateField().getAttribute('aria-invalid')).toBe('true');
      expect(fieldError()).toBe('Zvolte prosím den nejpozději dnes.');
      expect(document.activeElement).toBe(dateField());
    });

    it('and a day before 2000 is typed, then nothing is posted, the field says so and takes focus', async () => {
      await changeDate('1999-12-31');
      await submit();

      http.expectNone(HISTORY_URL);
      expect(dateField().getAttribute('aria-invalid')).toBe('true');
      expect(fieldError()).toBe('Zvolte prosím den nejdříve 01. 01. 2000.');
      expect(document.activeElement).toBe(dateField());
    });

    it('and the server finds the day too early, then the field says so, takes focus and the alert stays empty', async () => {
      await submit();
      const refused = problem('history-start-too-early', 400);
      http.expectOne(HISTORY_URL).flush(refused.body, refused.options);
      await settle();

      expect(fieldError()).toBe('Zvolte prosím den nejdříve 01. 01. 2000.');
      expect(dateField().getAttribute('aria-invalid')).toBe('true');
      expect(alert()).toBe('');
      expect(busy()).toBe(false);
      expect(document.activeElement).toBe(dateField());
    });

    it('and the server finds the day in the future, then the field says so, takes focus and the alert stays empty', async () => {
      await submit();
      const refused = problem('history-start-in-future', 400);
      http.expectOne(HISTORY_URL).flush(refused.body, refused.options);
      await settle();

      expect(fieldError()).toBe('Zvolte prosím den nejpozději dnes.');
      expect(alert()).toBe('');
      expect(document.activeElement).toBe(dateField());
    });

    it('and the server refuses otherwise, then its problem is the alert and the button is free again', async () => {
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
      expect(busy()).toBe(false);
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

    it('then the state is asked every 3000 ms and the running run says from which day it downloads', async () => {
      await vi.advanceTimersByTimeAsync(2999);
      http.expectNone(IMPORT_STATE_URL);

      await poll(historyImport({ status: 'RUNNING' }));

      expect(status()).toBe('Stahujeme platby od 01. 01. 2026…');
      expect(busy()).toBe(true);
      expect(button().textContent?.trim()).toBe('Stahujeme platby…');
      expect(finished).toEqual([]);
    });

    it('then a queued run whose start has passed says it starts in a moment', async () => {
      await poll(historyImport({ startsAt: '2026-11-05T10:00:04Z' }));

      expect(status()).toBe('Stahování začne za chvíli…');
    });

    it('then a completed run names its time, the period and the new payments, stops asking and hands the state on', async () => {
      await poll(historyImport({ status: 'RUNNING' }));
      await poll(
        historyImport({ status: 'COMPLETED', added: 5, finishedAt: '2026-11-05T10:01:00Z' }),
        { coveredFrom: '2026-01-01' },
      );

      expect(status()).toBe(
        'Hotovo (05. 11. 2026 11:01): staženo období 01. 01. 2026 – 05. 11. 2026, 5 nových plateb.',
      );
      expect(busy()).toBe(false);
      expect(button().textContent?.trim()).toBe('Načíst starší platby');
      expect(finished.map((state) => state.coveredFrom)).toEqual(['2026-01-01']);

      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      http.expectNone(IMPORT_STATE_URL);
    });

    it('then a locked history is an alert with its time that points back at the steps', async () => {
      await poll(
        historyImport({
          status: 'HISTORY_LOCKED',
          failure: 'HISTORY_LOCKED',
          finishedAt: '2026-11-05T10:00:30Z',
        }),
      );

      expect(alert()).toBe(
        'Načtení z 05. 11. 2026 11:00 se nepovedlo. Důvod: historie ve Fio byla zamčená. Odemkněte ji podle kroků výše a zkuste to znovu.',
      );
      expect(status()).toBe('');
      expect(finished.length).toBe(1);
    });

    it('then a failed run is one alert with its time, reason and next step, which reminds that the unlock lasts 10 minutes, and no link follows', async () => {
      await poll(
        historyImport({
          status: 'FAILED',
          failure: 'TRANSPORT',
          finishedAt: '2026-11-05T10:00:30Z',
        }),
      );

      expect(alert()).toBe(
        'Platby se nepodařilo stáhnout (05. 11. 2026 11:00). Důvod: Fio nebylo dostupné. Co udělat: Banka teď neodpovídá. Starší platby se samy znovu nenačtou: za chvíli stiskněte „Načíst starší platby“ znovu; pokud to trvá déle, zkontrolujte připojení serveru k internetu. Pokud od odemčení historie uplynulo víc než 10 minut, odemkněte ji předtím znovu.',
      );
      expect(fixture.nativeElement.querySelector('.history-next-step')).toBeNull();
    });

    it('then a run the bank kept refusing as too frequent says to press the button again later, unlocking the history again after 10 minutes', async () => {
      await poll(
        historyImport({
          status: 'FAILED',
          failure: 'RATE_LIMITED',
          finishedAt: '2026-11-05T10:00:30Z',
        }),
      );

      expect(alert()).toBe(
        'Platby se nepodařilo stáhnout (05. 11. 2026 11:00). Důvod: Fio odmítlo příliš častý dotaz. Co udělat: Banka teď odmítá příliš časté dotazy. Starší platby se samy znovu nenačtou: za pár minut stiskněte „Načíst starší platby“ znovu. Pokud od odemčení historie uplynulo víc než 10 minut, odemkněte ji předtím znovu.',
      );
      expect(fixture.nativeElement.querySelector('.history-next-step')).toBeNull();
    });

    it.each([
      [
        'RATE_LIMITED',
        'Fio odmítlo příliš častý dotaz',
        'Banka teď odmítá příliš časté dotazy. Starší platby se samy znovu nenačtou: za pár minut stiskněte „Načíst starší platby“ znovu.',
      ],
      [
        'TRANSPORT',
        'Fio nebylo dostupné',
        'Banka teď neodpovídá. Starší platby se samy znovu nenačtou: za chvíli stiskněte „Načíst starší platby“ znovu; pokud to trvá déle, zkontrolujte připojení serveru k internetu.',
      ],
    ] as const)(
      'then a %s run within the last 89 days says nothing about unlocking the history',
      async (failure, reason, step) => {
        await poll(
          historyImport({
            status: 'FAILED',
            failure,
            needsUnlockedHistory: false,
            finishedAt: '2026-11-05T10:00:30Z',
          }),
        );

        expect(alert()).toBe(
          `Platby se nepodařilo stáhnout (05. 11. 2026 11:00). Důvod: ${reason}. Co udělat: ${step}`,
        );
      },
    );

    it.each([
      [
        'UNEXPECTED',
        'Neočekávaná chyba',
        'Starší platby se samy znovu nenačtou: za chvíli stiskněte „Načíst starší platby“ znovu. Když se chyba opakuje, pošlete technikovi čas z této zprávy; podrobnosti najde v logu.',
      ],
      [
        'INVALID_RESPONSE',
        'Fio poslalo odpověď, které web nerozumí',
        'Za chvíli stiskněte „Načíst starší platby“ znovu; když se to opakuje, může jít o změnu na straně Fio a technik najde podrobnosti v logu.',
      ],
    ] as const)(
      'then a run that ended as %s says to press the button again and leads to the logs',
      async (failure, reason, step) => {
        await poll(
          historyImport({ status: 'FAILED', failure, finishedAt: '2026-11-05T10:00:30Z' }),
        );

        expect(alert()).toBe(
          `Platby se nepodařilo stáhnout (05. 11. 2026 11:00). Důvod: ${reason}. Co udělat: ${step}`,
        );
        expect(text('.history-next-step')).toBe('Otevřít logy');
        expect(
          fixture.nativeElement.querySelector('.history-next-step a')?.getAttribute('href'),
        ).toBe('/sprava/logy');
      },
    );

    it('then a run the bank refused the token for leads to the settings', async () => {
      await poll(
        historyImport({
          status: 'FAILED',
          failure: 'UNAUTHORIZED',
          finishedAt: '2026-11-05T10:00:30Z',
        }),
      );

      expect(alert()).toBe(
        'Platby se nepodařilo stáhnout (05. 11. 2026 11:00). Důvod: Fio odmítlo token (chybí, ještě neplatí nebo vypršel). Co udělat: V internetovém bankovnictví Fio (Nastavení → API) vytvořte nový token typu „Sledování účtu“ (platí 180 dní) a vložte ho v Nastavení jako Token Fio API.',
      );
      expect(text('.history-next-step')).toBe('Otevřít Nastavení');
      expect(
        fixture.nativeElement.querySelector('.history-next-step a')?.getAttribute('href'),
      ).toBe('/sprava/nastaveni');
      expect(fixture.nativeElement.querySelector('[role="alert"] a')).toBeNull();
    });

    it('then a failed check is asked again at the next step', async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
      http.expectOne(IMPORT_STATE_URL).flush(null, { status: 502, statusText: 'Bad Gateway' });
      await settle();

      await poll(historyImport({ status: 'RUNNING' }));

      expect(status()).toBe('Stahujeme platby od 01. 01. 2026…');
    });

    describe('and 40 checks still find it running', () => {
      beforeEach(async () => {
        for (let check = 0; check < MAX_POLLS; check++) {
          await poll(historyImport({ status: 'RUNNING' }));
        }
      });

      it('then it stops asking, says how to learn the result and offers to check again', async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
        http.expectNone(IMPORT_STATE_URL);
        expect(status()).toBe(
          'Stahování ještě běží. Výsledek zjistíte tlačítkem níže nebo po obnovení stránky.',
        );
        expect(checkAgain()?.textContent?.trim()).toBe('Zjistit výsledek');
        expect(busy()).toBe(true);
      });

      it('and they press "Zjistit výsledek", then focus moves to the busy button, it asks again and shows the result', async () => {
        checkAgain()?.focus();
        checkAgain()?.click();
        await settle();

        expect(checkAgain()).toBeNull();
        expect(document.activeElement).toBe(button());
        expect(busy()).toBe(true);
        await poll(
          historyImport({ status: 'COMPLETED', added: 0, finishedAt: '2026-11-05T10:03:00Z' }),
        );

        expect(status()).toBe(
          'Hotovo (05. 11. 2026 11:03): staženo období 01. 01. 2026 – 05. 11. 2026, žádná nová platba.',
        );
        expect(finished.length).toBe(1);
      });
    });

    it('and the part is left, then it stops asking', async () => {
      fixture.destroy();

      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      http.expectNone(IMPORT_STATE_URL);
    });
  });

  describe('when it opens while an earlier run is still running', () => {
    beforeEach(async () => {
      await open(importState({ historyImport: historyImport({ status: 'RUNNING' }) }));
    });

    it('then it shows the run, keeps the button busy and asks until the run ends', async () => {
      expect(status()).toBe('Stahujeme platby od 01. 01. 2026…');
      expect(busy()).toBe(true);

      await poll(
        historyImport({ status: 'COMPLETED', added: 1, finishedAt: '2026-11-05T10:01:00Z' }),
      );

      expect(status()).toBe(
        'Hotovo (05. 11. 2026 11:01): staženo období 01. 01. 2026 – 05. 11. 2026, 1 nová platba.',
      );
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
      'and it added %i new payments, then the result line says "%s" and nothing is asked',
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

        expect(status()).toBe(
          `Hotovo (04. 11. 2026 11:01): staženo období 01. 03. 2025 – 04. 11. 2026, ${phrase}.`,
        );
        expect(busy()).toBe(false);
        await vi.advanceTimersByTimeAsync(POLL_MS * 2);
        http.expectNone(IMPORT_STATE_URL);
      },
    );

    it('and the history was locked, then the alert stays shown with its time and the button is free', async () => {
      await open(
        importState({
          historyImport: historyImport({
            status: 'HISTORY_LOCKED',
            failure: 'HISTORY_LOCKED',
            finishedAt: '2026-11-04T09:00:00Z',
          }),
        }),
      );

      expect(alert()).toBe(
        'Načtení z 04. 11. 2026 10:00 se nepovedlo. Důvod: historie ve Fio byla zamčená. Odemkněte ji podle kroků výše a zkuste to znovu.',
      );
      expect(busy()).toBe(false);
    });
  });

  describe('when the server names another default day', () => {
    it('then the field starts at it', async () => {
      await open(importState({ defaultHistoryFrom: '2024-05-01' }));

      expect(dateField().value).toBe('2024-05-01');
    });
  });
});
