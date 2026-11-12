import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import {
  activitySince,
  backupRun,
  backupsView,
  historyImport,
  importState,
  administrator,
  donorAccount,
  monthOverview,
  overview,
  paymentList,
  receiptSigningKey,
  receiptSigningKeys,
  unpairedPayment,
  noReceiptSignatory,
  receiptSignatory,
} from '../testing/admin-fixtures';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { FOUNDATION_STAR } from '../../../shared/ui/foundation-star/foundation-star';
import { AdminHome } from './admin-home';
import { Connectivity } from '../../../core/connectivity/connectivity';
import { ShownAnswers } from '../../../core/connectivity/shown-answers';
import type { AccountStore, CopyContents } from '../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import { AdministrationCopyDownload } from '../device-copy/administration-copy-download';
import { everyOfferedYear } from '../device-copy/administration-overview';

const IMPORT_STATE_URL = '/api/admin/donations/import-state';
const OVERVIEW_URL = '/api/admin/donations/overview';
const BACKUPS_URL = '/api/admin/operations/backups';
const UNPAIRED_URL = '/api/admin/donations/payments?pairing=unpaired';
const ADMINISTRATORS_URL = '/api/admin/donors/administrators';
const PREVIOUS_SIGN_IN_URL = '/api/admin/donors/me/previous-sign-in';
const SINCE_URL = '/api/admin/donations/overview/since';
const SIGNING_KEYS_URL = '/api/admin/donations/receipt-signing-keys';
const SIGNATORY_URL = '/api/admin/donations/receipt-signatory';

describe('Given an administrator on the administration home', () => {
  const compact = signal(false);
  let fixture: ComponentFixture<AdminHome>;
  let http: HttpTestingController;
  let store: AuthStore;

  beforeEach(async () => {
    localStorage.clear();
    compact.set(false);
    await TestBed.configureTestingModule({
      imports: [AdminHome],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
    store.login('admin@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminHome);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.match(IMPORT_STATE_URL).forEach((pending) => pending.flush(importState()));
    http.match(OVERVIEW_URL).forEach((pending) => pending.flush(overview()));
    http.match(BACKUPS_URL).forEach((pending) => pending.flush(backupsView()));
    http.match(UNPAIRED_URL).forEach((pending) => pending.flush(paymentList([])));
    http
      .match(ADMINISTRATORS_URL)
      .forEach((pending) => pending.flush({ items: [administrator()] }));
    http
      .match(PREVIOUS_SIGN_IN_URL)
      .forEach((pending) => pending.flush({ previousSignInAt: null }));
    http
      .match((request) => request.url === SINCE_URL)
      .forEach((pending) => pending.flush(activitySince()));
    http.match(SIGNING_KEYS_URL).forEach((pending) => pending.flush(receiptSigningKeys()));
    http.match(SIGNATORY_URL).forEach((pending) => pending.flush(receiptSignatory()));
    http.verify();
  });

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function dataRows(card = 'admin-import-title'): Record<string, string> {
    const rows: Record<string, string> = {};
    fixture.nativeElement
      .querySelectorAll(`.ui-card[aria-labelledby="${card}"] .admin-data div`)
      .forEach((row: HTMLElement) => {
        rows[row.querySelector('dt')?.textContent?.trim() ?? ''] = (
          row.querySelector('dd')?.textContent ?? ''
        )
          .replace(/\s+/g, ' ')
          .trim();
      });
    return rows;
  }

  async function respond(body: object, status = 200): Promise<void> {
    http
      .expectOne(IMPORT_STATE_URL)
      .flush(body, status === 200 ? undefined : { status, statusText: 'Error' });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function settleWithFakeTimers(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();
    }
  }

  async function respondOverview(url: string, body: object, status = 200): Promise<void> {
    http.expectOne(url).flush(body, status === 200 ? undefined : { status, statusText: 'Error' });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function overviewRows(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(
        '.overview-table tbody tr, .overview-table tfoot tr',
      ) as NodeListOf<HTMLTableRowElement>,
    ).map((row) => (row.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  it('when the page opens, then it asks for the import state with the token and says it is loading', () => {
    const request = http.expectOne(IMPORT_STATE_URL);

    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(text('h1')).toBe('Správa');
    expect(text('.ui-card[aria-labelledby="admin-import-title"] [role="status"]')).toBe(
      'Načítáme stav importu…',
    );
    request.flush(importState());
  });

  it('when the import works, then the covered period and the last times are shown without a warning', async () => {
    await respond(
      importState({
        coveredFrom: '2026-07-20',
        coveredTo: '2026-10-17',
        lastAttemptedAt: '2026-10-18T08:05:30Z',
        lastSucceededAt: '2026-10-18T08:05:30Z',
      }),
    );

    expect(dataRows()).toEqual({
      'Stažené období': '20. 7. 2026 – 17. 10. 2026',
      'Poslední úspěšné stažení': '18. 10. 2026 10:05',
      'Poslední pokus': '18. 10. 2026 10:05',
      'Poslední chyba': 'žádná',
    });
    expect(fixture.nativeElement.querySelector('.attention-import')).toBeNull();
    expect(text('[aria-labelledby="admin-import-title"] .healthy')).toBe(
      'Stahování plateb je v pořádku, naposledy 18. 10. 2026 10:05.',
    );
  });

  it('when the history is locked, then the next step points at the button for older payments instead of a restart', async () => {
    await respond(
      importState({
        lastAttemptedAt: '2026-10-18T09:00:00Z',
        lastFailure: {
          kind: 'HISTORY_LOCKED',
          message: null,
          attemptedAt: '2026-10-18T09:00:00Z',
        },
        consecutiveFailures: 3,
        reportedOutage: 'HISTORY_LOCKED',
      }),
    );

    expect(text('.attention-import .admin-next-step')).toBe(
      'Co udělat: Odemkněte historii v internetovém bankovnictví Fio (Nastavení → API, ikona zámku) a do 10 minut stiskněte níže „Načíst starší platby“.',
    );
    expect(text('.attention-import')).not.toContain('restart');
    expect(text('.attention-import-next a')).toBe('Přejít ke starším platbám');
    expect(
      fixture.nativeElement.querySelector('.attention-import-next a')?.getAttribute('href'),
    ).toBe('/sprava#starsi-platby');
  });

  it('when the import card is ready, then it holds the part for older payments with the default day', async () => {
    await respond(importState({ defaultHistoryFrom: '2025-01-01' }));

    const card = fixture.nativeElement.querySelector(
      '.ui-card[aria-labelledby="admin-import-title"]',
    ) as HTMLElement;
    expect(card.querySelector('app-history-import h3')?.textContent?.trim()).toBe(
      'Starší platby z banky',
    );
    expect((card.querySelector('input#history-from') as HTMLInputElement).value).toBe('2025-01-01');
  });

  async function finishRun(added: number): Promise<void> {
    http.expectOne(UNPAIRED_URL).flush(paymentList([]));
    http.expectOne(IMPORT_STATE_URL).flush(
      importState({
        coveredFrom: '2026-08-08',
        coveredTo: '2026-11-04',
        historyImport: historyImport({ status: 'RUNNING' }),
      }),
    );
    await settleWithFakeTimers();
    expect(dataRows()['Stažené období']).toBe('8. 8. 2026 – 4. 11. 2026');
    await vi.advanceTimersByTimeAsync(3000);

    http.expectOne(IMPORT_STATE_URL).flush(
      importState({
        coveredFrom: '2026-01-01',
        coveredTo: '2026-11-05',
        historyImport: historyImport({
          status: 'COMPLETED',
          added,
          finishedAt: '2026-11-05T10:01:00Z',
        }),
      }),
    );
    await settleWithFakeTimers();
  }

  it('when a run of older payments finishes with new payments, then the covered period shows the state the run ended with and the unpaired payments are asked again', async () => {
    vi.useFakeTimers();
    try {
      await finishRun(2);

      expect(dataRows()['Stažené období']).toBe('1. 1. 2026 – 5. 11. 2026');
      expect(text('app-history-import [role="status"]')).toBe(
        'Hotovo (5. 11. 2026 11:01): staženo období 1. 1. 2026 – 5. 11. 2026, 2 nové platby.',
      );
      http.expectOne(UNPAIRED_URL).flush(paymentList([unpairedPayment()]));
      await settleWithFakeTimers();
      expect(text('.attention-unpaired .ui-list__title')).toBe('1 platba čeká na přiřazení');
    } finally {
      vi.useRealTimers();
    }
  });

  it('when a run of older payments finishes without new payments, then the unpaired payments are not asked again', async () => {
    vi.useFakeTimers();
    try {
      await finishRun(0);

      expect(dataRows()['Stažené období']).toBe('1. 1. 2026 – 5. 11. 2026');
      http.expectNone(UNPAIRED_URL);
    } finally {
      vi.useRealTimers();
    }
  });

  it('when the import has never run, then a warning row says so and leads to the token in the settings', async () => {
    await respond(
      importState({
        coveredFrom: null,
        coveredTo: null,
        lastAttemptedAt: null,
        lastSucceededAt: null,
      }),
    );

    expect(text('.attention-import a')).toBe(
      'Upozornění: Stahování plateb ještě neproběhlo Pokud to trvá déle než hodinu, zkontrolujte v Nastavení token Fio API.',
    );
    expect(fixture.nativeElement.querySelector('.attention-import a')?.getAttribute('href')).toBe(
      '/sprava/nastaveni',
    );
    expect(dataRows()).toEqual({
      'Stažené období': 'zatím nic',
      'Poslední úspěšné stažení': 'zatím žádné',
      'Poslední pokus': 'zatím žádný',
      'Poslední chyba': 'žádná',
    });
    expect(
      fixture.nativeElement.querySelector('[aria-labelledby="admin-import-title"] .healthy'),
    ).toBeNull();
  });

  it('when the token was rejected and the outage was reported, then the warning and the failure are named in Czech', async () => {
    await respond(
      importState({
        lastAttemptedAt: '2026-10-18T09:00:00Z',
        lastFailure: {
          kind: 'UNAUTHORIZED',
          message: 'HTTP 401',
          attemptedAt: '2026-10-18T09:00:00Z',
        },
        consecutiveFailures: 1,
        reportedOutage: 'UNAUTHORIZED',
      }),
    );

    expect(text('.attention-import')).toBe(
      'Upozornění: Platby z banky se nestahují 1× za sebou, fond o tom dostal e-mail. Důvod: Fio odmítlo token (chybí, ještě neplatí nebo vypršel). Co udělat: V internetovém bankovnictví Fio (Nastavení → API) vytvořte nový token typu „Sledování účtu“ (platí 180 dní) a vložte ho v Nastavení jako Token Fio API.',
    );
    expect(fixture.nativeElement.querySelector('.attention-import a')).toBeNull();
    expect(text('.attention-import-next a')).toBe('Otevřít Nastavení');
    expect(
      fixture.nativeElement.querySelector('.attention-import-next a')?.getAttribute('href'),
    ).toBe('/sprava/nastaveni');
    expect(dataRows()['Poslední chyba']).toBe(
      'Fio odmítlo token (chybí, ještě neplatí nebo vypršel) 18. 10. 2026 11:00 (HTTP 401)',
    );
    expect(
      fixture.nativeElement.querySelector('[aria-labelledby="admin-import-title"] .healthy'),
    ).toBeNull();
  });

  it('when the bank does not answer repeatedly, then the warning says the web retries by itself and leads nowhere', async () => {
    await respond(
      importState({
        lastAttemptedAt: '2026-10-18T09:00:00Z',
        lastFailure: { kind: 'TRANSPORT', message: null, attemptedAt: '2026-10-18T09:00:00Z' },
        consecutiveFailures: 3,
        reportedOutage: 'TRANSPORT',
      }),
    );

    expect(text('.attention-import .admin-next-step')).toBe(
      'Co udělat: Banka teď neodpovídá. Web to zkouší znovu sám každou hodinu; pokud to trvá déle, zkontrolujte připojení serveru k internetu.',
    );
    expect(fixture.nativeElement.querySelector('.attention-import-next')).toBeNull();
  });

  it('when the state cannot be loaded, then an alert offers a retry that asks again', async () => {
    await respond({ title: 'Server error' }, 500);

    expect(text('[role="alert"]')).toContain('Stav importu se nepodařilo načíst.');

    (
      fixture.nativeElement.querySelector('.ui-load-state--error button') as HTMLButtonElement
    ).click();
    await respond(importState());

    expect(fixture.nativeElement.querySelector('[role="alert"]:not(:empty)')).toBeNull();
    expect(dataRows()['Stažené období']).toBe('20. 7. 2026 – 17. 10. 2026');
  });

  it('when the role was taken away meanwhile, then the administrator is sent to their own overview', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    await respond(
      {
        type: 'https://nfnn.cz/problems/auth/forbidden',
        title: 'Nemáte oprávnění',
        status: 403,
      },
      403,
    );

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('when the session has ended, then the administrator is sent home to sign in', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    await respond(
      {
        type: 'https://nfnn.cz/problems/auth/unauthenticated',
        title: 'Přihlaste se',
        status: 401,
      },
      401,
    );
    http
      .expectOne('/api/donors/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(store.signedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/');
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);
  });
  describe('when the donations overview arrives', () => {
    beforeEach(async () => {
      http.expectOne(IMPORT_STATE_URL).flush(importState());
      await respondOverview(OVERVIEW_URL, overview());
    });

    it('then every started month shows everything received, new donors, paired and unpaired, with a yearly total', () => {
      expect(text('.admin-summary')).toBe('Registrovaní dárci: 3, z toho nových v roce 2026: 3.');
      expect(
        Array.from(
          fixture.nativeElement.querySelectorAll(
            '.overview-table thead th',
          ) as NodeListOf<HTMLElement>,
        ).map((cell) => cell.textContent?.trim()),
      ).toEqual(['Měsíc', 'Dary', 'Dárci', 'Noví dárci', 'Celkem', 'Přiřazené', 'Bez dárce']);
      expect(overviewRows()).toEqual([
        'říjen 2026 1 1 1 999 Kč 999 Kč 0 Kč',
        'září 2026 3 2 1 1 684,50 Kč 1 534,50 Kč 150 Kč',
        'srpen 2026 1 1 1 200 Kč 200 Kč 0 Kč',
        'Celkem 2026 5 2 3 2 883,50 Kč 2 733,50 Kč 150 Kč',
      ]);
    });

    it('then a hint above the table tells the donors who gave from the newly registered ones', () => {
      const table = fixture.nativeElement.querySelector('.overview-table') as HTMLTableElement;
      const hint = fixture.nativeElement.querySelector(
        `#${table.getAttribute('aria-describedby')}`,
      ) as HTMLElement;

      expect(hint.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'Dárci: kolik různých dárců v měsíci poslalo dar; platby bez dárce se nepočítají. Noví dárci: kolik dárců se v měsíci zaregistrovalo.',
      );
      expect(
        Array.from(
          table.querySelectorAll('tbody tr:first-child td') as NodeListOf<HTMLElement>,
        ).map((cell) => cell.dataset['label']),
      ).toEqual(['Měsíc', 'Dary', 'Dárci', 'Noví dárci', 'Celkem', 'Přiřazené', 'Bez dárce']);
    });

    it('then a line under the table says new donors are registrations and the total includes payments without a donor', () => {
      const table = fixture.nativeElement.querySelector('.overview-table') as HTMLTableElement;

      expect(table.nextElementSibling?.classList.contains('overview-columns')).toBe(true);
      expect(text('.overview-columns')).toBe(
        'Noví dárci jsou nové registrace, i bez daru, takže jich může být víc než dárců. Celkem zahrnuje i platby, které ještě nemají dárce (Celkem = Přiřazené + Bez dárce).',
      );
    });

    it('then another year can be chosen and its months replace the table', async () => {
      const select = fixture.nativeElement.querySelector(
        '.year-select select',
      ) as HTMLSelectElement;
      expect(Array.from(select.options).map((option) => option.value)).toEqual(['2026', '2025']);

      select.value = '2025';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(text('.ui-card[aria-labelledby="admin-overview-title"] [role="status"]')).toBe(
        'Načítáme dary po měsících…',
      );
      await respondOverview(
        `${OVERVIEW_URL}?year=2025`,
        overview({
          year: 2025,
          newDonors: 0,
          givingDonors: 1,
          received: { count: 1, totalMinor: 50000, currency: 'CZK' },
          paired: { count: 1, totalMinor: 50000, currency: 'CZK' },
          unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
          months: [
            monthOverview({
              month: '2025-12',
              received: { count: 1, totalMinor: 50000, currency: 'CZK' },
              newDonors: 0,
              paired: { count: 1, totalMinor: 50000, currency: 'CZK' },
            }),
          ],
        }),
      );

      expect(text('.admin-summary')).toBe('Registrovaní dárci: 3, z toho nových v roce 2025: 0.');
      expect(overviewRows()).toEqual([
        'prosinec 2025 1 1 0 500 Kč 500 Kč 0 Kč',
        'Celkem 2025 1 1 0 500 Kč 500 Kč 0 Kč',
      ]);
    });
  });

  describe('when the previous sign-in arrives', () => {
    const SINCE_CARD = '.ui-card[aria-labelledby="admin-since-title"]';

    function sinceRequest(from: string) {
      return http.expectOne(
        (request) => request.url === SINCE_URL && request.params.get('from') === from,
      );
    }

    async function signedInBefore(at: string, activity = activitySince()): Promise<void> {
      await respondOverview(PREVIOUS_SIGN_IN_URL, { previousSignInAt: at });
      sinceRequest(at).flush(activity);
      await fixture.whenStable();
      fixture.detectChanges();
    }

    function links(): { text: string; href: string | null }[] {
      return Array.from(
        fixture.nativeElement.querySelectorAll(`${SINCE_CARD} a`) as NodeListOf<HTMLAnchorElement>,
      ).map((link) => ({
        text: (link.textContent ?? '').replace(/\s+/g, ' ').trim(),
        href: link.getAttribute('href'),
      }));
    }

    it('then the block is the first card and says it is loading until both answers come', () => {
      const first = fixture.nativeElement.querySelector('.ui-card') as HTMLElement;
      expect(first.getAttribute('aria-labelledby')).toBe('admin-since-title');
      expect(text('#admin-since-title')).toBe('Od posledního přihlášení');
      expect(text(`${SINCE_CARD} [role="status"]`)).toBe('Zjišťujeme, co je od minula nového…');
    });

    it('then it names the sign-in, sums the new payments and links the paired, the waiting payments and the new donors', async () => {
      await signedInBefore('2026-10-28T20:14:00Z');

      expect(text(`${SINCE_CARD} .since-lead`)).toBe(
        'Poslední přihlášení 28. 10. 2026 21:14. Od té doby přišlo 5 plateb za 12 500 Kč.',
      );
      expect(dataRows('admin-since-title')).toEqual({
        'Přiřazené dárcům': '3 platby za 7 500 Kč',
        'Čekají na přiřazení': '2 platby za 5 000 Kč',
        'Noví dárci': '3 nové registrace',
      });
      expect(links()).toEqual([
        { text: '3 platby za 7 500 Kč', href: '/sprava/platby?stav=prirazene&od=2026-10-28' },
        { text: '2 platby za 5 000 Kč', href: '/sprava/platby?od=2026-10-28' },
        { text: '3 nové registrace', href: '/sprava/darci' },
      ]);
    });

    it('then one payment and one donor read in the singular and a figure of none has no link', async () => {
      await signedInBefore(
        '2026-10-28T23:30:00Z',
        activitySince({
          payments: { count: 1, totalMinor: 50000, currency: 'CZK' },
          paired: { count: 1, totalMinor: 50000, currency: 'CZK' },
          unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
          newDonors: 1,
        }),
      );

      expect(text(`${SINCE_CARD} .since-lead`)).toBe(
        'Poslední přihlášení 29. 10. 2026 0:30. Od té doby přišla 1 platba za 500 Kč.',
      );
      expect(dataRows('admin-since-title')).toEqual({
        'Přiřazené dárcům': '1 platba za 500 Kč',
        'Čekají na přiřazení': 'žádná',
        'Noví dárci': '1 nová registrace',
      });
      expect(links().map((link) => link.href)).toEqual([
        '/sprava/platby?stav=prirazene&od=2026-10-29',
        '/sprava/darci',
      ]);
    });

    it('then registrations without any payment say no payment came and leave the payment figures out', async () => {
      await signedInBefore(
        '2026-10-28T20:14:00Z',
        activitySince({
          payments: { count: 0, totalMinor: 0, currency: 'CZK' },
          paired: { count: 0, totalMinor: 0, currency: 'CZK' },
          unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
          newDonors: 2,
        }),
      );

      expect(text(`${SINCE_CARD} .since-lead`)).toBe(
        'Poslední přihlášení 28. 10. 2026 21:14. Od té doby nepřišla žádná platba.',
      );
      expect(dataRows('admin-since-title')).toEqual({ 'Noví dárci': '2 nové registrace' });
    });

    it('then nothing new is said in one sentence instead of zeros', async () => {
      await signedInBefore(
        '2026-10-28T20:14:00Z',
        activitySince({
          payments: { count: 0, totalMinor: 0, currency: 'CZK' },
          paired: { count: 0, totalMinor: 0, currency: 'CZK' },
          unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
          newDonors: 0,
        }),
      );

      expect(text(`${SINCE_CARD} .since-lead`)).toBe(
        'Poslední přihlášení 28. 10. 2026 21:14. Od té doby nepřišla žádná platba a nikdo nový se nezaregistroval.',
      );
      expect(fixture.nativeElement.querySelector(`${SINCE_CARD} dl`)).toBeNull();
    });

    it('then a first sign-in says so and asks for nothing more', async () => {
      await respondOverview(PREVIOUS_SIGN_IN_URL, { previousSignInAt: null });

      expect(text(`${SINCE_CARD} .since-lead`)).toBe(
        'Jste tu poprvé. Od příštího přihlášení tu uvidíte nové platby a nové dárce.',
      );
      http.expectNone((request) => request.url === SINCE_URL);
    });

    it('then a failure offers a retry that asks again', async () => {
      await respondOverview(PREVIOUS_SIGN_IN_URL, { title: 'Server error' }, 500);

      const card = fixture.nativeElement.querySelector(SINCE_CARD) as HTMLElement;
      expect(card.querySelector('[role="alert"]')?.textContent).toContain(
        'Co je od minula nového, se nepodařilo zjistit.',
      );

      (card.querySelector('[role="alert"] button') as HTMLButtonElement).click();
      await signedInBefore('2026-10-28T20:14:00Z');

      expect(card.querySelector('[role="alert"]')).toBeNull();
      expect(text(`${SINCE_CARD} .since-lead`)).toContain('Od té doby přišlo 5 plateb');
    });
  });

  it('when the overview cannot be loaded, then its alert offers a retry that asks again', async () => {
    http.expectOne(IMPORT_STATE_URL).flush(importState());
    await respondOverview(OVERVIEW_URL, { title: 'Server error' }, 500);

    const card = fixture.nativeElement.querySelector(
      '.ui-card[aria-labelledby="admin-overview-title"]',
    ) as HTMLElement;
    expect(card.querySelector('[role="alert"]')?.textContent).toContain(
      'Dary po měsících se nepodařilo načíst.',
    );

    (card.querySelector('.ui-load-state--error button') as HTMLButtonElement).click();
    await respondOverview(OVERVIEW_URL, overview());

    expect(card.querySelector('[role="alert"]')).toBeNull();
    expect(overviewRows()).toHaveLength(4);
  });

  describe('when the backups state arrives', () => {
    beforeEach(() => {
      http.expectOne(IMPORT_STATE_URL).flush(importState());
    });

    function backupsCard(): HTMLElement {
      return fixture.nativeElement.querySelector('.ui-card[aria-labelledby="admin-backups-title"]');
    }

    it('then a healthy state names the last backup and test restore and links to the backups', async () => {
      await respondOverview(BACKUPS_URL, backupsView());

      expect(text('#admin-backups-title')).toBe('Zálohy databáze');
      expect(text('.ui-card[aria-labelledby="admin-backups-title"] .healthy')).toBe(
        'Zálohování je v pořádku.',
      );
      expect(dataRows('admin-backups-title')).toEqual({
        'Poslední záloha': '23. 10. 2026 3:00 (2 kB)',
        'Zkušební obnova': '18. 10. 2026 4:00, 37 tabulek',
      });
      expect(backupsCard().querySelector('a')?.getAttribute('href')).toBe('/sprava/zalohy');
    });

    it('then failures and problems are named in Czech', async () => {
      await respondOverview(
        BACKUPS_URL,
        backupsView({
          lastBackup: backupRun({ outcome: 'FAILED', fileName: null, error: 'pg_dump: exit 1' }),
          lastTestRestore: null,
          problems: ['BACKUP_FAILED', 'TEST_RESTORE_MISSING'],
        }),
      );

      expect(
        Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll('.attention-backups'),
        ).map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim()),
      ).toEqual([
        'Naléhavé: Poslední záloha se nepovedla. Data webu jsou v pořádku, ale nejsou zálohovaná. Zkuste Zálohovat teď; když to nepomůže, zkopírujte zprávu pro technika a pošlete ji správci serveru, který web nainstaloval.',
        'Naléhavé: Zatím se nevyzkoušelo, že jde zálohu obnovit. Spusťte Ověřit obnovu teď.',
      ]);
      expect(backupsCard().querySelector('.healthy')).toBeNull();
      expect(dataRows('admin-backups-title')).toEqual({
        'Poslední záloha': 'selhala 23. 10. 2026 3:00',
        'Zkušební obnova': 'zatím žádná',
      });
    });

    it('then a failed load offers a retry that asks again', async () => {
      await respondOverview(BACKUPS_URL, { title: 'Server error' }, 500);

      expect(backupsCard().querySelector('[role="alert"]')?.textContent).toContain(
        'Stav záloh se nepodařilo načíst.',
      );

      (backupsCard().querySelector('.ui-load-state--error button') as HTMLButtonElement).click();
      await respondOverview(BACKUPS_URL, backupsView());

      expect(backupsCard().querySelector('[role="alert"]')).toBeNull();
      expect(dataRows('admin-backups-title')['Poslední záloha']).toBe('23. 10. 2026 3:00 (2 kB)');
    });
  });

  describe('when every source of the attention card answers', () => {
    function attention(): HTMLElement {
      return fixture.nativeElement.querySelector('.attention');
    }

    function items(): string[] {
      return Array.from(
        attention().querySelectorAll('.attention-list > li') as NodeListOf<HTMLElement>,
      ).map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim());
    }

    function links(): string[] {
      return Array.from(attention().querySelectorAll('a') as NodeListOf<HTMLAnchorElement>).map(
        (link) => link.getAttribute('href') ?? '',
      );
    }

    async function sources(
      unpaired = paymentList([]),
      administrators = [administrator()],
      backups = backupsView(),
      state = importState({ lastSucceededAt: '2026-10-18T08:05:30Z' }),
      signingKeys = receiptSigningKeys(),
    ): Promise<void> {
      http.expectOne(IMPORT_STATE_URL).flush(state);
      http.expectOne(BACKUPS_URL).flush(backups);
      http.expectOne(UNPAIRED_URL).flush(unpaired);
      http.expectOne(ADMINISTRATORS_URL).flush({ items: administrators });
      http.expectOne(SIGNING_KEYS_URL).flush(signingKeys);
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('then the group is named by its heading and while they load its row says so', () => {
      expect(attention().getAttribute('aria-labelledby')).toBe('admin-attention-title');
      expect(text('#admin-attention-title')).toBe('Co potřebuje vaši pozornost');
      expect(text('.attention [role="status"]')).toBe('Zjišťujeme, jestli na vás něco nečeká…');
    });

    it('then with nothing pending one calm row says everything is fine with the last import and backup', async () => {
      await sources();

      expect(items()).toEqual([
        'Vše je v pořádku Platby z banky naposledy stažené 18. 10. 2026 10:05, poslední záloha 23. 10. 2026 3:00.',
      ]);
      expect(links()).toEqual([]);
      expect(attention().querySelector('button')).toBeNull();
    });

    it('then unpaired payments of every year, backup problems and an administrator without any second factor each get a row that is one link', async () => {
      await sources(
        paymentList([
          unpairedPayment(),
          unpairedPayment({ id: 'p2', amountMinor: 15000 }),
          unpairedPayment({ id: 'p3', amountMinor: 20000 }),
        ]),
        [
          administrator(),
          administrator({ donorId: 'petr', name: 'Petr Svoboda', secondFactorEnabled: false }),
          administrator({ donorId: 'eva', name: 'Eva Malá', secondFactorEnabled: false }),
        ],
        backupsView({ problems: ['BACKUP_FAILED'] }),
      );
      http.expectOne('/api/admin/donors/petr').flush(donorAccount({ name: 'Petr Svoboda' }));
      http
        .expectOne('/api/admin/donors/eva')
        .flush(donorAccount({ name: 'Eva Malá', passkeys: 1 }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual([
        '3 platby čekají na přiřazení 850 Kč',
        'Naléhavé: Poslední záloha se nepovedla. Data webu jsou v pořádku, ale nejsou zálohovaná. Zkuste Zálohovat teď; když to nepomůže, zkopírujte zprávu pro technika a pošlete ji správci serveru, který web nainstaloval.',
        'Zpráva pro technika Kopírovat zprávu pro technika',
        'Správce nemá druhý faktor, správa se mu neotevře Petr Svoboda',
      ]);
      expect(links()).toEqual(['/sprava/platby', '/sprava/zalohy', '/sprava/spravci']);
      expect(
        Array.from(attention().querySelectorAll('.attention-list > li')).map(
          (item) => item.children.length,
        ),
      ).toEqual([1, 1, 1, 1]);
    });

    it('then several administrators without any second factor share one row naming them all', async () => {
      await sources(paymentList([]), [
        administrator({ donorId: 'petr', name: 'Petr Svoboda', secondFactorEnabled: false }),
        administrator({ donorId: 'eva', name: 'Eva Malá', secondFactorEnabled: false }),
      ]);
      http.expectOne('/api/admin/donors/petr').flush(donorAccount({ name: 'Petr Svoboda' }));
      http.expectOne('/api/admin/donors/eva').flush(donorAccount({ name: 'Eva Malá' }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual([
        'Správci nemají druhý faktor, správa se jim neotevře Petr Svoboda, Eva Malá',
      ]);
    });

    it('then the count of waiting payments is a figure, the sum a value beside it', async () => {
      await sources(paymentList([unpairedPayment()]));

      const row = attention().querySelector('.attention-unpaired a') as HTMLAnchorElement;
      expect(text('.attention-unpaired .ui-list__title')).toBe('1 platba čeká na přiřazení');
      expect(text('.attention-unpaired .ui-list__value')).toBe('500 Kč');
      expect(row.getAttribute('href')).toBe('/sprava/platby');
    });

    it('then a backup folder the backend cannot see is told in plain words, without the server details, with the message for the technician beside it', async () => {
      await sources(
        paymentList([]),
        [administrator()],
        backupsView({ available: false, problems: ['BACKUPS_UNAVAILABLE'] }),
      );

      expect(items()).toEqual([
        'Naléhavé: Web teď nevidí složku se zálohami, takže zálohy nejde vytvořit ani stáhnout. Data webu jsou v pořádku. Zkopírujte prosím zprávu pro technika a pošlete ji správci serveru, který web nainstaloval.',
        'Zpráva pro technika Kopírovat zprávu pro technika',
      ]);
      expect(attention().textContent).not.toContain('compose');
    });

    it('then the message for the technician is copied with the technical details from its row', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await sources(
        paymentList([]),
        [administrator()],
        backupsView({ available: false, problems: ['BACKUPS_UNAVAILABLE'] }),
      );

      (attention().querySelector('.attention-technician button') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(writeText).toHaveBeenCalledOnce();
      expect(writeText.mock.calls[0][0]).toContain('/DATA/AppData/nfnn/backups');
    });

    it('then a backup key nobody saved yet gets a warning row leading to the backups', async () => {
      await sources(
        paymentList([]),
        [administrator()],
        backupsView({ key: { available: true, confirmed: false, confirmedAt: null } }),
      );

      expect(items()).toEqual([
        'Upozornění: Klíč k zálohám si zatím nikdo neuložil Bez něj žádnou zálohu neobnovíte. Uložit ho má někdo ze správní rady, ne technik.',
      ]);
      expect(links()).toEqual(['/sprava/zalohy#klic-k-zaloham']);
    });

    it('then a receipt signing key that fails its seal gets an urgent row leading to the settings', async () => {
      await sources(
        paymentList([]),
        [administrator()],
        backupsView(),
        importState({ lastSucceededAt: '2026-10-18T08:05:30Z' }),
        receiptSigningKeys([receiptSigningKey({ published: false })]),
      );

      expect(items()).toEqual([
        'Naléhavé: Klíč k ověřovacím QR kódům není zveřejněný Klíč 21fe31df není zveřejněný, proto se QR kódy jím podepsané neověří. Jeho záznam v databázi chybí nebo neprošel kontrolou pečeti (změna mimo web nebo záloha jiného serveru, kterou server nepřevzal); obraťte se na technika serveru.',
      ]);
      expect(links()).toEqual(['/sprava/nastaveni#klic-k-overovacim-qr']);
    });

    it('then a current receipt signing key missing from the list gets the same urgent row', async () => {
      await sources(
        paymentList([]),
        [administrator()],
        backupsView(),
        importState({ lastSucceededAt: '2026-10-18T08:05:30Z' }),
        { currentKeyId: '21fe31df', currentKeyPublished: false, keys: [], auditMismatches: [] },
      );

      expect(items()).toEqual([
        'Naléhavé: Klíč k ověřovacím QR kódům není zveřejněný Klíč 21fe31df není zveřejněný, proto se QR kódy jím podepsané neověří. Jeho záznam v databázi chybí nebo neprošel kontrolou pečeti (změna mimo web nebo záloha jiného serveru, kterou server nepřevzal); obraťte se na technika serveru.',
      ]);
    });

    it('then two unpublished receipt signing keys are named together under a plural title', async () => {
      await sources(
        paymentList([]),
        [administrator()],
        backupsView(),
        importState({ lastSucceededAt: '2026-10-18T08:05:30Z' }),
        receiptSigningKeys([
          receiptSigningKey({ published: false }),
          receiptSigningKey({ keyId: '39f713d0', current: false, published: false }),
        ]),
      );

      expect(text('.attention-signing-key .ui-list__title')).toBe(
        'Naléhavé: Klíče k ověřovacím QR kódům nejsou zveřejněné',
      );
    });

    it('then a withdrawn key of the server and key rows that disagree with the audit trail get an urgent row leading to the settings', async () => {
      await sources(
        paymentList([]),
        [administrator()],
        backupsView(),
        importState({ lastSucceededAt: '2026-10-18T08:05:30Z' }),
        {
          ...receiptSigningKeys([receiptSigningKey({ status: 'revoked' })]),
          auditMismatches: [{ keyId: '39f713d0', kind: 'missing' }],
        },
      );

      expect(items()).toEqual([
        'Naléhavé: Klíč k ověřovacím QR kódům potřebuje kontrolu Klíč serveru 21fe31df je zneplatněný a server zatím nemá nový, takže se potvrzení o daru teď nestáhnou. Nový klíč si server vytvoří při startu; když se to nestane do pár minut, obraťte se na technika serveru. Klíč 39f713d0 je v historii správy, ale jeho záznam v databázi chybí (změna mimo web). QR kódy jím podepsané se neověří; obraťte se na technika serveru.',
      ]);
      expect(links()).toEqual(['/sprava/nastaveni#klic-k-overovacim-qr']);
    });

    it('then receipts nobody signs get an urgent row leading to the people of the foundation', async () => {
      await sources();
      http.expectOne(SIGNATORY_URL).flush(noReceiptSignatory());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual([
        'Naléhavé: Nikdo nepodepisuje potvrzení o daru Web je proto dárcům nevystaví.',
      ]);
      expect(links()).toEqual(['/sprava/lide-fondu']);
    });

    it('then receipts nobody signs lead the rows, ahead of another problem', async () => {
      await sources(
        paymentList([]),
        [administrator()],
        backupsView({ key: { available: true, confirmed: false, confirmedAt: null } }),
      );
      http.expectOne(SIGNATORY_URL).flush(noReceiptSignatory());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual([
        'Naléhavé: Nikdo nepodepisuje potvrzení o daru Web je proto dárcům nevystaví.',
        'Upozornění: Klíč k zálohám si zatím nikdo neuložil Bez něj žádnou zálohu neobnovíte. Uložit ho má někdo ze správní rady, ne technik.',
      ]);
    });

    it('then a signatory without an uploaded signature gets a row leading to the people of the foundation', async () => {
      await sources();
      http.expectOne(SIGNATORY_URL).flush(receiptSignatory({ signature: false }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual([
        'Podepisující nemá nahraný podpis Potvrzení o daru mají zatím jen čáru se jménem.',
      ]);
      expect(links()).toEqual(['/sprava/lide-fondu']);
    });

    it('then a signatory who cannot be checked says so with a retry, and a signed signatory adds no row', async () => {
      await sources();
      http.expectOne(SIGNATORY_URL).flush(null, { status: 500, statusText: 'Error' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual([
        'Nepodařilo se zkontrolovat, kdo podepisuje potvrzení o daru. Zkusit znovu',
      ]);
      expect(text('.attention [role="alert"]')).toBe(
        'Nepodařilo se zkontrolovat, kdo podepisuje potvrzení o daru.',
      );
      (attention().querySelector('.attention-signatory button') as HTMLButtonElement).click();
      http.expectOne(SIGNATORY_URL).flush(receiptSignatory());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()[0]).toContain('Vše je v pořádku');
    });

    it('then a source that fails says so with a retry while the others still show', async () => {
      http.expectOne(IMPORT_STATE_URL).flush(importState());
      http.expectOne(BACKUPS_URL).flush(backupsView());
      http.expectOne(UNPAIRED_URL).flush(paymentList([unpairedPayment()]));
      http.expectOne(ADMINISTRATORS_URL).flush(null, { status: 500, statusText: 'Error' });
      http.expectOne(SIGNING_KEYS_URL).flush(receiptSigningKeys());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual([
        '1 platba čeká na přiřazení 500 Kč',
        'Správce se nepodařilo zkontrolovat. Zkusit znovu',
      ]);
      expect(text('.attention [role="alert"]')).toBe('Správce se nepodařilo zkontrolovat.');

      (attention().querySelector('.attention-administrators button') as HTMLButtonElement).click();
      fixture.detectChanges();
      http.expectOne(ADMINISTRATORS_URL).flush({ items: [administrator()] });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual(['1 platba čeká na přiřazení 500 Kč']);
    });

    it('then waiting payments that cannot be counted say so with a retry that asks again', async () => {
      http.expectOne(IMPORT_STATE_URL).flush(importState());
      http.expectOne(BACKUPS_URL).flush(backupsView());
      http.expectOne(UNPAIRED_URL).flush(null, { status: 500, statusText: 'Error' });
      http.expectOne(ADMINISTRATORS_URL).flush({ items: [administrator()] });
      http.expectOne(SIGNING_KEYS_URL).flush(receiptSigningKeys());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual(['Platby čekající na přiřazení se nepodařilo zjistit. Zkusit znovu']);

      (attention().querySelector('.attention-unpaired button') as HTMLButtonElement).click();
      fixture.detectChanges();
      http.expectOne(UNPAIRED_URL).flush(paymentList([unpairedPayment()]));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual(['1 platba čeká na přiřazení 500 Kč']);
    });

    it('then the import and the backups that cannot be read point to their cards below without a link', async () => {
      http.expectOne(IMPORT_STATE_URL).flush(null, { status: 500, statusText: 'Error' });
      http.expectOne(BACKUPS_URL).flush(null, { status: 500, statusText: 'Error' });
      http.expectOne(UNPAIRED_URL).flush(paymentList([]));
      http.expectOne(ADMINISTRATORS_URL).flush({ items: [administrator()] });
      http.expectOne(SIGNING_KEYS_URL).flush(receiptSigningKeys());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual([
        'Stav stahování plateb se nepodařilo zjistit; zkuste to znovu v kartě níže.',
        'Stav záloh se nepodařilo zjistit; zkuste to znovu v kartě níže.',
      ]);
      expect(links()).toEqual([]);
    });

    it('then receipt signing keys that cannot be checked say so with a retry that asks again', async () => {
      http
        .expectOne(IMPORT_STATE_URL)
        .flush(importState({ lastSucceededAt: '2026-10-18T08:05:30Z' }));
      http.expectOne(BACKUPS_URL).flush(backupsView());
      http.expectOne(UNPAIRED_URL).flush(paymentList([]));
      http.expectOne(ADMINISTRATORS_URL).flush({ items: [administrator()] });
      http.expectOne(SIGNING_KEYS_URL).flush(null, { status: 500, statusText: 'Error' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual([
        'Klíč k ověřovacím QR kódům se nepodařilo zkontrolovat. Zkusit znovu',
      ]);
      expect(text('.attention [role="alert"]')).toBe(
        'Klíč k ověřovacím QR kódům se nepodařilo zkontrolovat.',
      );

      (attention().querySelector('.attention-signing-key button') as HTMLButtonElement).click();
      fixture.detectChanges();
      http.expectOne(SIGNING_KEYS_URL).flush(receiptSigningKeys());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()[0]).toContain('Vše je v pořádku');
    });
  });

  describe('when the window is as narrow as a phone or a tablet', () => {
    function sections(): HTMLElement | null {
      return fixture.nativeElement.querySelector('nav[aria-label="Sekce správy"]');
    }

    function rows(): string[][] {
      return Array.from(sections()?.querySelectorAll('section') ?? []).map((section) => [
        clean(section.querySelector('h2')?.textContent),
        ...Array.from(section.querySelectorAll('a')).map(
          (link) => `${clean(link.textContent)} → ${link.getAttribute('href')}`,
        ),
      ]);
    }

    function clean(value: string | null | undefined): string {
      return (value ?? '').replace(/\s+/g, ' ').trim();
    }

    beforeEach(async () => {
      compact.set(true);
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('then what needs attention comes right under the heading, and the sections of every day and the way to the rest follow what is new since the last sign-in, each one tap away', () => {
      expect(fixture.nativeElement.querySelector('h1')?.nextElementSibling).toBe(
        fixture.nativeElement.querySelector('.attention'),
      );
      expect(fixture.nativeElement.querySelector('.since')?.nextElementSibling).toBe(
        sections()?.closest('app-admin-section-rows'),
      );
      expect(rows()).toEqual([
        [
          'Každý den',
          'Platby z banky → /sprava/platby',
          'Dárci → /sprava/darci',
          'Aktuality → /sprava/aktuality',
          'Pomáháme → /sprava/projekty',
        ],
        ['Občas a pro technika', 'Lidé fondu, správci, zálohy, nastavení… → /sprava/vice'],
      ]);
    });

    it("then the way to the rest leads with the foundation's star, hidden from screen readers", () => {
      const lead = sections()?.querySelector('a[href="/sprava/vice"] .ui-list__lead');

      expect(lead?.getAttribute('aria-hidden')).toBe('true');
      expect(lead?.querySelector('svg')?.getAttribute('viewBox')).toBe(FOUNDATION_STAR.viewBox);
      expect(lead?.querySelector('path')?.getAttribute('d')).toBe(FOUNDATION_STAR.path);
    });

    it('then the payments row shows how many payments wait to be paired and says it to screen readers', async () => {
      http
        .expectOne(UNPAIRED_URL)
        .flush(paymentList([unpairedPayment(), unpairedPayment({ id: 'p2', amountMinor: 15000 })]));
      await fixture.whenStable();
      fixture.detectChanges();

      const payments = sections()?.querySelector('a[href="/sprava/platby"]');
      expect(clean(payments?.querySelector('.ui-list__count')?.textContent)).toBe('2');
      expect(payments?.querySelector('.ui-list__count')?.getAttribute('aria-hidden')).toBe('true');
      expect(clean(payments?.querySelector('.visually-hidden')?.textContent)).toBe(
        '2 platby čekají na přiřazení',
      );
    });

    it('then no count shows while no payment waits', async () => {
      http.expectOne(UNPAIRED_URL).flush(paymentList([]));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(sections()?.querySelector('.ui-list__count')).toBeNull();
    });

    it('and the window widens again, then the side panel lists the sections and the overview leaves them out', async () => {
      compact.set(false);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(sections()).toBeNull();
      expect(fixture.nativeElement.querySelector('.since')?.nextElementSibling).toBe(
        fixture.nativeElement.querySelector('.attention'),
      );
    });
  });
});

describe('Given an administrator on the administration home with the administration copy on the device', () => {
  const RECORD = {
    donorId: 'donor-1',
    name: 'Jana Nováková',
    type: 'PERSON',
    variableSymbol: '7700001001',
    companyIdentifier: null,
    address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
    preferredLocale: 'cs',
    registeredAt: '2026-01-15T10:00:00Z',
    erasedAt: null,
  };
  const PAID = {
    id: 'payment-1',
    version: '0123456789abcdef',
    bankTransactionId: 26000000001,
    bookedOn: '2026-10-01',
    amountMinor: 50000,
    currency: 'CZK',
    variableSymbol: '7700001001',
    counterpartyAccount: '1234567/0800',
    counterpartyName: 'NOVAKOVA JANA',
    messageForRecipient: null,
    importedAt: '2026-10-01T12:00:00Z',
    unpairedByAdminAt: null,
    accountVerification: false,
  };
  const UNPAIRED = {
    ...PAID,
    id: 'payment-2',
    bankTransactionId: 26000000002,
    bookedOn: '2026-10-05',
    amountMinor: 30000,
    variableSymbol: null,
    importedAt: '2026-10-05T12:00:00Z',
  };
  const GIFT = {
    id: 'donation-1',
    donorId: 'donor-1',
    paymentId: 'payment-1',
    receivedAt: '2026-10-01',
    amountMinor: 50000,
    currency: 'CZK',
    status: 'RECEIVED',
    source: 'BANK',
    purpose: 'GENERAL',
    pairedBy: 'VARIABLE_SYMBOL',
    bankAccountId: null,
    symbolClaimId: null,
    recordedAt: '2026-10-01T12:00:00Z',
  };
  const STORED_IMPORT = {
    coveredFrom: '2026-07-20',
    coveredTo: '2026-10-17',
    lastAttemptedAt: '2026-10-18T10:00:00Z',
    lastSucceededAt: '2026-10-17T10:00:00Z',
    lastFailure: {
      kind: 'UNAUTHORIZED',
      message: 'Fio refused the token',
      attemptedAt: '2026-10-18T10:00:00Z',
    },
    consecutiveFailures: 1,
    reportedOutage: 'UNAUTHORIZED',
    balance: null,
  };
  let fixture: ComponentFixture<AdminHome>;
  let http: HttpTestingController;
  let refresh: ReturnType<typeof vi.fn>;
  let offline: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    localStorage.clear();
    refresh = vi.fn().mockResolvedValue('unchanged');
    offline = signal(true);
    const rows = { payments: [PAID, UNPAIRED], donations: [GIFT], donorRecords: [RECORD] };
    const contents: CopyContents = {
      chunks: [
        { id: 'donations/payments:2026-10', rowsSha256: 'a', rows: [UNPAIRED, PAID] },
        { id: 'donations/donations:2026-10', rowsSha256: 'b', rows: [GIFT] },
        { id: 'donations/donor-records:2026-01', rowsSha256: 'c', rows: [RECORD] },
        { id: 'donations/import-state', rowsSha256: 'd', rows: [STORED_IMPORT] },
      ],
      summary: {
        donations: {
          today: '2026-10-20',
          receiptsAvailableFrom: 2026,
          byYear: everyOfferedYear(rows as never, '2026-10-20'),
        },
      },
      storedAt: '2026-10-20T08:00:00.000Z',
    };
    const opened: OpenedCopy = {
      store: {
        copyId: 'copy-1',
        contents: signal(contents).asReadonly(),
      } as unknown as AccountStore,
      reason: 'unlocked',
      account: { email: 'admin@example.cz', userHandle: 'h', administrator: true },
    };
    await TestBed.configureTestingModule({
      imports: [AdminHome],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: CompactLayout, useValue: { isCompact: signal(false).asReadonly() } },
        provideRouter([]),
        { provide: DeviceVault, useValue: { administration: signal(opened).asReadonly() } },
        {
          provide: Connectivity,
          useValue: {
            offline: offline.asReadonly(),
            cause: signal('network').asReadonly(),
          },
        },
        {
          provide: AdministrationCopyDownload,
          useValue: {
            refresh,
            checkedAt: signal<string | null>(null).asReadonly(),
            writesAtStart: () => null,
            firstDownload: signal(null).asReadonly(),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminHome);
    fixture.detectChanges();
    for (let round = 0; round < 3; round++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  });

  afterEach(() => {
    http.match(() => true).forEach((pending) => pending.flush(null, { status: 0, statusText: '' }));
    http.verify();
  });

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it('when the device is offline, then the year overview, the payments waiting for a donor and the import state come from the copy without asking the server', () => {
    expect(http.match(IMPORT_STATE_URL)).toEqual([]);
    expect(http.match((request) => request.url === OVERVIEW_URL)).toEqual([]);
    expect(http.match((request) => request.url === '/api/admin/donations/payments')).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();

    expect(text('.ui-card[aria-labelledby="admin-overview-title"] .admin-summary')).toBe(
      'Registrovaní dárci: 1, z toho nových v roce 2026: 1.',
    );
    expect(text('.overview-table tbody tr')).toContain('říjen 2026');
    expect(text('.ui-card[aria-labelledby="admin-import-title"]')).toContain('Poslední chyba');
    expect(text('.ui-card[aria-labelledby="admin-import-title"]')).not.toContain('Fio refused');
    expect(fixture.nativeElement.textContent).toContain('1 platba čeká na přiřazení');
    expect(TestBed.inject(ShownAnswers).oldest()).toBe(Date.parse('2026-10-20T08:00:00.000Z'));
  });

  it("when the device comes back online, then the import state is read from the server again, with the failure's text and the part for older payments the copy does not hold", async () => {
    expect(fixture.nativeElement.querySelector('app-history-import')).toBeNull();

    offline.set(false);
    fixture.detectChanges();
    await vi.waitFor(() =>
      http.expectOne(IMPORT_STATE_URL).flush(
        importState({
          lastFailure: {
            kind: 'UNAUTHORIZED',
            message: 'Fio refused the token',
            attemptedAt: '2026-10-18T10:00:00Z',
          },
          defaultHistoryFrom: '2025-01-01',
        }),
      ),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text('.ui-card[aria-labelledby="admin-import-title"]')).toContain(
      '(Fio refused the token)',
    );
    expect(fixture.nativeElement.querySelector('app-history-import')).not.toBeNull();
  });
});
