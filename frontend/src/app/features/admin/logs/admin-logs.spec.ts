import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import {
  diagnostics,
  logFile,
  loggerEntry,
  logOverride,
  logWindow,
} from '../testing/admin-fixtures';
import { AdminLogs } from './admin-logs';

const LOGS_URL = '/api/admin/operations/logs';
const LOGGERS_URL = '/api/admin/operations/loggers';
const DIAGNOSTICS_URL = '/api/admin/operations/diagnostics';

function problem(status: number, type: string, title: string, detail: string) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title, detail, status },
    options: {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/problem+json' },
    },
  };
}

describe('Given an administrator on the logs page', () => {
  let fixture: ComponentFixture<AdminLogs>;
  let http: HttpTestingController;
  let store: AuthStore;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminLogs],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminLogs);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  function element<T extends HTMLElement>(selector: string): T {
    const found = fixture.nativeElement.querySelector(selector) as T | null;
    if (found === null) {
      throw new Error(`No element matches ${selector}`);
    }
    return found;
  }

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function texts(selector: string): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>,
    ).map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find(
      (candidate) =>
        candidate.textContent?.trim() === name || candidate.getAttribute('aria-label') === name,
    );
    if (found === undefined) {
      throw new Error(`No button ${name}`);
    }
    return found;
  }

  function hasButton(name: string): boolean {
    return Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).some((candidate) => candidate.textContent?.trim() === name);
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function type(selector: string, value: string): Promise<void> {
    const control = element<HTMLInputElement>(selector);
    control.value = value;
    control.dispatchEvent(new Event('input'));
    control.dispatchEvent(new Event('change'));
    control.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function choose(selector: string, index: number): Promise<void> {
    const select = element<HTMLSelectElement>(selector);
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
    select.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function submit(selector: string): Promise<void> {
    element<HTMLFormElement>(selector).dispatchEvent(new Event('submit'));
    await settle();
  }

  async function loadPage(
    options: {
      files?: ReturnType<typeof logFile>[];
      available?: boolean;
      loggers?: ReturnType<typeof loggerEntry>[];
    } = {},
  ): Promise<void> {
    const files = options.files ?? [
      logFile(),
      logFile({ name: 'backend.log.2026-10-22.0.gz', sizeBytes: 3000, compressed: true }),
    ];
    http.expectOne(LOGS_URL).flush({ available: options.available ?? true, files });
    http.expectOne(LOGGERS_URL).flush({
      loggers: options.loggers ?? [
        loggerEntry({ logger: 'ROOT' }),
        loggerEntry({ logger: 'cz.novanadeje.app' }),
        loggerEntry({ logger: 'org.hibernate.SQL', configuredLevel: null }),
      ],
    });
    http.expectOne(DIAGNOSTICS_URL).flush(diagnostics());
    await settle();
  }

  function flushWindow(query: string, overrides: Partial<ReturnType<typeof logWindow>> = {}): void {
    http
      .expectOne((request) => request.urlWithParams === `${LOGS_URL}/backend.log?${query}`)
      .flush(logWindow(overrides));
  }

  it('when the page opens, then it lists the files, shows the tail of backend.log and lets the administrator page through it', async () => {
    await loadPage();
    flushWindow('bytes=20000', { from: 100, to: 220, hasOlder: true, hasNewer: false });
    await settle();

    expect(texts('tbody tr .file-name').slice(0, 2)).toEqual([
      'backend.log',
      'backend.log.2026-10-22.0.gz',
    ]);
    expect(texts('.badge')).toEqual(['komprimovaný']);
    expect(text('.log-text')).toContain('INFO first line');
    expect(text('.range')).toBe('Bajty 100–220 z 220');
    expect(button('Novější →').disabled).toBe(true);
    expect(button('← Starší').disabled).toBe(false);

    button('← Starší').click();
    await settle();
    flushWindow('bytes=20000&from=0', { from: 0, to: 100, hasOlder: false, hasNewer: true });
    await settle();

    expect(text('.range')).toBe('Bajty 0–100 z 220');
    expect(button('← Starší').disabled).toBe(true);

    button('Novější →').click();
    await settle();
    flushWindow('bytes=20000&from=100', { from: 100, to: 220, hasOlder: true, hasNewer: false });
    await settle();

    expect(text('.range')).toBe('Bajty 100–220 z 220');

    button('Zobrazit backend.log.2026-10-22.0.gz').click();
    await settle();
    http
      .expectOne(
        (request) =>
          request.urlWithParams === `${LOGS_URL}/backend.log.2026-10-22.0.gz?bytes=20000`,
      )
      .flush(logWindow({ name: 'backend.log.2026-10-22.0.gz', text: 'older first\n' }));
    await settle();

    expect(text('.title-file')).toBe('backend.log.2026-10-22.0.gz');
    expect(text('.log-text')).toBe('older first');
  });

  it('when they search, then the newest matches are listed with a way to the older ones and a match opens its window', async () => {
    await loadPage();
    flushWindow('bytes=20000');
    await settle();

    await type('#log-search', 'fio');
    await submit('form.search-form');
    http
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
    await settle();

    expect(text('.matches .card-intro')).toBe(
      '2 řádky, nejnovější první. Kliknutím zobrazíte řádek i s okolím.',
    );
    expect(texts('.match')).toEqual([
      '2026-10-23T10:00:01 WARN second line about Fio',
      '2026-10-22T10:00:01 WARN older line about Fio',
    ]);

    button('Načíst starší shody').click();
    await settle();
    http
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
    await settle();

    expect(texts('.match')).toHaveLength(3);
    expect(hasButton('Načíst starší shody')).toBe(false);

    element<HTMLButtonElement>('.match').click();
    await settle();
    flushWindow('bytes=20000&from=150', { from: 150, to: 220, hasOlder: true, hasNewer: false });
    await settle();

    expect(text('.range')).toBe('Bajty 150–220 z 220');
  });

  it('when the pattern is not a valid expression, then the problem is shown at the search', async () => {
    await loadPage();
    flushWindow('bytes=20000');
    await settle();

    await type('#log-search', '(');
    await submit('form.search-form');
    const refusal = problem(
      400,
      'operations/invalid-log-pattern',
      'Neplatný výraz',
      'Hledaný výraz není platný regulární výraz.',
    );
    http
      .expectOne((request) => request.url === `${LOGS_URL}/backend.log/search`)
      .flush(refusal.body, refusal.options);
    await settle();

    expect(text('.admin-notice--alert')).toBe(
      'Neplatný výraz. Hledaný výraz není platný regulární výraz.',
    );
  });

  it('when they raise a logger for a while, then the level is put and the list shows the temporary level with a reset', async () => {
    await loadPage();
    flushWindow('bytes=20000');
    await settle();

    expect(texts('.levels tbody tr .file-name')).toEqual([
      'ROOT',
      'cz.novanadeje.app',
      'org.hibernate.SQL',
    ]);
    expect(texts('.levels tbody tr:nth-child(3) td')[1]).toBe('zděděno');

    await type('#log-level-logger', 'cz.novanadeje.app');
    await choose('#log-level-level', 0);
    await type('#log-level-minutes', '10');
    await submit('form.level-form');
    const put = http.expectOne(`${LOGGERS_URL}/cz.novanadeje.app`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ level: 'TRACE', minutes: 10 });
    put.flush(logOverride({ level: 'TRACE', until: '2026-10-23T10:10:00Z' }));
    http.expectOne(LOGGERS_URL).flush({
      loggers: [
        loggerEntry({ logger: 'ROOT' }),
        loggerEntry({
          logger: 'cz.novanadeje.app',
          effectiveLevel: 'TRACE',
          override: logOverride({ level: 'TRACE', until: '2026-10-23T10:10:00Z' }),
        }),
      ],
    });
    http.expectOne(DIAGNOSTICS_URL).flush(
      diagnostics({
        logLevelOverrides: [logOverride({ level: 'TRACE', until: '2026-10-23T10:10:00Z' })],
      }),
    );
    await settle();

    expect(text('.admin-notice--status')).toBe(
      'Logger cz.novanadeje.app má úroveň TRACE do 23. 10. 2026 12:10.',
    );
    expect(texts('.levels tbody tr:nth-child(2) td').slice(1, 4)).toEqual([
      'INFO',
      'TRACE',
      'do 23. 10. 2026 12:10',
    ]);
    expect(text('.run:last-child dd')).toContain('cz.novanadeje.app TRACE do 23. 10. 2026 12:10');

    button('Vrátit úroveň loggeru cz.novanadeje.app').click();
    await settle();
    const reset = http.expectOne(`${LOGGERS_URL}/cz.novanadeje.app`);
    expect(reset.request.method).toBe('DELETE');
    reset.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne(LOGGERS_URL).flush({
      loggers: [loggerEntry({ logger: 'ROOT' }), loggerEntry({ logger: 'cz.novanadeje.app' })],
    });
    http.expectOne(DIAGNOSTICS_URL).flush(diagnostics());
    await settle();

    expect(text('.admin-notice--status')).toBe('Logger cz.novanadeje.app má zase původní úroveň.');
    expect(fixture.nativeElement.querySelector('.levels tr.overridden')).toBeNull();
  });

  it('when the logger name is not a Java name or the minutes are out of range, then the form says so and posts nothing', async () => {
    await loadPage();
    flushWindow('bytes=20000');
    await settle();

    await type('#log-level-logger', 'not a logger!');
    await type('#log-level-minutes', '0');
    await submit('form.level-form');

    expect(element<HTMLInputElement>('#log-level-logger').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(text('form.level-form')).toContain(
      'Název loggeru je ROOT nebo tečkami oddělený název balíčku či třídy.',
    );
    expect(text('form.level-form')).toContain('Zadejte 1 až 1440 minut (nejdéle jeden den).');
    http.expectNone((request) => request.method === 'PUT');
  });

  it('when the backend refuses the level, then the problem is shown as an alert', async () => {
    await loadPage();
    flushWindow('bytes=20000');
    await settle();

    await type('#log-level-logger', 'cz.novanadeje.app');
    await submit('form.level-form');
    const refusal = problem(
      403,
      'auth/forbidden',
      'Přístup odepřen',
      'Tato akce vyžaduje oprávnění ke změnám.',
    );
    http.expectOne(`${LOGGERS_URL}/cz.novanadeje.app`).flush(refusal.body, refusal.options);
    await settle();

    expect(text('.admin-notice--alert')).toBe(
      'Přístup odepřen. Tato akce vyžaduje oprávnění ke změnám.',
    );
  });

  it('when the diagnostics load, then the JVM, the database and the folders are described and a thread dump can be shown', async () => {
    await loadPage();
    flushWindow('bytes=20000');
    await settle();

    expect(texts('.run dt')).toEqual([
      'Java',
      'Běží od',
      'Paměť (heap)',
      'Vlákna',
      'Úklid paměti',
      'Zatížení',
      'Databáze',
      'Složky',
      'Dočasné úrovně',
    ]);
    const values = texts('.run dd');
    expect(values[0]).toBe('25.0.1+8');
    expect(values[1]).toBe('23. 10. 2026 08:00');
    expect(values[2]).toBe('172,0 MB z 768,0 MB, mimo heap 115,0 MB');
    expect(values[3]).toBe('42 (nejvíc 48, z toho 30 na pozadí)');
    expect(values[4]).toBe('120× za 950 ms celkem');
    expect(values[5]).toBe('0,4 na 4 jádrech');
    expect(values[6]).toBe(
      'Databáze odpovídá za 2 ms; spojení 0 v práci, 10 volných z 10, 0 čeká.',
    );
    expect(texts('.disks li').slice(0, 2)).toEqual([
      '/logs: volných 12,5 GB z 250,0 GB.',
      '/backups: složka není připojená.',
    ]);
    expect(text('.run:last-child dd')).toBe('Žádné.');

    button('Zobrazit výpis vláken').click();
    await settle();
    http
      .expectOne(`${DIAGNOSTICS_URL}/threads`)
      .flush('"main" #1 state=RUNNABLE\n    at a.b.C.d(C.java:1)\n');
    await settle();

    expect(text('#logs-threads .log-text')).toContain('"main" #1 state=RUNNABLE');
    expect(button('Skrýt výpis vláken').getAttribute('aria-expanded')).toBe('true');

    button('Skrýt výpis vláken').click();
    await settle();

    expect(fixture.nativeElement.querySelector('#logs-threads .log-text')).toBeNull();
  });

  it('when the backend does not see the log folder, then the page says so and shows no viewer', async () => {
    await loadPage({ available: false, files: [] });

    expect(text('.unavailable')).toContain('Backend nevidí složku logů.');
    expect(fixture.nativeElement.querySelector('.log-text')).toBeNull();
    expect(texts('.levels tbody tr')).toHaveLength(3);
  });

  it('when the session is gone, then the donor is sent home with the sign-in dialog', async () => {
    const dialog = TestBed.inject(LoginDialogService);
    const router = TestBed.inject(Router);
    const open = vi.spyOn(dialog, 'open');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(401, 'auth/unauthenticated', 'Nepřihlášeno', 'Přihlaste se prosím.');

    http.expectOne(LOGGERS_URL).flush({ loggers: [] });
    http.expectOne(DIAGNOSTICS_URL).flush(diagnostics());
    http.expectOne(LOGS_URL).flush(refusal.body, refusal.options);
    http.expectOne('/api/donors/auth/logout').flush(null);
    await settle();

    expect(navigate).toHaveBeenCalledWith('/');
    expect(open).toHaveBeenCalledWith('login', { returnTo: '/' });
  });
});
