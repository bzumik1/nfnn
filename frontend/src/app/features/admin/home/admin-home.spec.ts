import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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
  importState,
  administrator,
  donorAccount,
  monthOverview,
  overview,
  paymentList,
  unpairedPayment,
} from '../testing/admin-fixtures';
import { AdminHome } from './admin-home';

const IMPORT_STATE_URL = '/api/admin/donations/import-state';
const OVERVIEW_URL = '/api/admin/donations/overview';
const BACKUPS_URL = '/api/admin/operations/backups';
const UNPAIRED_URL = '/api/admin/donations/payments?pairing=unpaired';
const ADMINISTRATORS_URL = '/api/admin/donors/administrators';
const PREVIOUS_SIGN_IN_URL = '/api/admin/donors/me/previous-sign-in';
const SINCE_URL = '/api/admin/donations/overview/since';
const SIGNATURE_URL = '/api/admin/donations/receipt-signature';
const SIGNATURE = { configured: true, image: null, width: 400, height: 120, uploadedAt: null };
const NO_SIGNATURE = {
  configured: false,
  image: null,
  width: null,
  height: null,
  uploadedAt: null,
};

describe('Given an administrator on the administration home', () => {
  let fixture: ComponentFixture<AdminHome>;
  let http: HttpTestingController;
  let store: AuthStore;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminHome],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
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
    http.match(SIGNATURE_URL).forEach((pending) => pending.flush(SIGNATURE));
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
      'Stažené období': '20. 07. 2026 – 17. 10. 2026',
      'Poslední úspěšné stažení': '18. 10. 2026 10:05',
      'Poslední pokus': '18. 10. 2026 10:05',
      'Poslední chyba': 'žádná',
    });
    expect(fixture.nativeElement.querySelector('.attention-item--warning')).toBeNull();
    expect(text('[aria-labelledby="admin-import-title"] .healthy')).toBe(
      'Stahování plateb je v pořádku, naposledy 18. 10. 2026 10:05.',
    );
  });

  it('when the import has never run, then one sentence says so and points to the token in the settings', async () => {
    await respond(
      importState({
        coveredFrom: null,
        coveredTo: null,
        lastAttemptedAt: null,
        lastSucceededAt: null,
      }),
    );

    expect(text('.admin-pending')).toBe(
      'Stahování plateb ještě neproběhlo. Pokud to trvá déle než hodinu, zkontrolujte v Nastavení token Fio API.',
    );
    expect(fixture.nativeElement.querySelector('.admin-pending a')?.getAttribute('href')).toBe(
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

    expect(text('.attention-item--stack p')).toBe(
      'Upozornění: Platby z banky se nestahují (1× za sebou) a fond o tom dostal e-mail. Důvod: Fio odmítlo token (chybí, ještě neplatí nebo vypršel).',
    );
    expect(text('.admin-next-step')).toBe(
      'Co udělat: V internetovém bankovnictví Fio (Nastavení → API) vytvořte nový token typu „Sledování účtu“ (platí 180 dní) a vložte ho v Nastavení jako Token Fio API. Otevřít Nastavení',
    );
    expect(fixture.nativeElement.querySelector('.admin-next-step a')?.getAttribute('href')).toBe(
      '/sprava/nastaveni',
    );
    expect(dataRows()['Poslední chyba']).toBe(
      'Fio odmítlo token (chybí, ještě neplatí nebo vypršel) 18. 10. 2026 11:00 (HTTP 401)',
    );
    expect(
      fixture.nativeElement.querySelector('[aria-labelledby="admin-import-title"] .healthy'),
    ).toBeNull();
  });

  it('when the bank does not answer repeatedly, then the warning says the web retries by itself and links nowhere', async () => {
    await respond(
      importState({
        lastAttemptedAt: '2026-10-18T09:00:00Z',
        lastFailure: { kind: 'TRANSPORT', message: null, attemptedAt: '2026-10-18T09:00:00Z' },
        consecutiveFailures: 3,
        reportedOutage: 'TRANSPORT',
      }),
    );

    expect(text('.admin-next-step')).toBe(
      'Co udělat: Banka teď neodpovídá. Web to zkouší znovu sám každou hodinu; pokud to trvá déle, zkontrolujte připojení serveru k internetu.',
    );
    expect(fixture.nativeElement.querySelector('.admin-next-step a')).toBeNull();
  });

  it('when the state cannot be loaded, then an alert offers a retry that asks again', async () => {
    await respond({ title: 'Server error' }, 500);

    expect(text('[role="alert"]')).toContain('Stav importu se nepodařilo načíst.');

    (
      fixture.nativeElement.querySelector('.ui-load-state--error button') as HTMLButtonElement
    ).click();
    await respond(importState());

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(dataRows()['Stažené období']).toBe('20. 07. 2026 – 17. 10. 2026');
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
        'Poslední přihlášení 29. 10. 2026 00:30. Od té doby přišla 1 platba za 500 Kč.',
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
        'Poslední záloha': '23. 10. 2026 03:00 (2 kB)',
        'Zkušební obnova': '18. 10. 2026 04:00, 37 tabulek',
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
          (fixture.nativeElement as HTMLElement).querySelectorAll('.attention-problems li'),
        ).map((item) => (item.textContent ?? '').trim()),
      ).toEqual([
        'Poslední záloha se nepovedla. Data webu jsou v pořádku, ale nejsou zálohovaná. Zkuste Zálohovat teď; když to nepomůže, zkopírujte zprávu pro technika a pošlete ji správci serveru, který web nainstaloval.',
        'Zatím se nevyzkoušelo, že jde zálohu obnovit. Spusťte Ověřit obnovu teď.',
      ]);
      expect(backupsCard().querySelector('.healthy')).toBeNull();
      expect(dataRows('admin-backups-title')).toEqual({
        'Poslední záloha': 'selhala 23. 10. 2026 03:00',
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
      expect(dataRows('admin-backups-title')['Poslední záloha']).toBe('23. 10. 2026 03:00 (2 kB)');
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

    async function sources(
      unpaired = paymentList([]),
      administrators = [administrator()],
      backups = backupsView(),
      state = importState({ lastSucceededAt: '2026-10-18T08:05:30Z' }),
    ): Promise<void> {
      http.expectOne(IMPORT_STATE_URL).flush(state);
      http.expectOne(BACKUPS_URL).flush(backups);
      http.expectOne(UNPAIRED_URL).flush(unpaired);
      http.expectOne(ADMINISTRATORS_URL).flush({ items: administrators });
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('then while they load the card says so', () => {
      expect(text('.attention [role="status"]')).toBe('Zjišťujeme, jestli na vás něco nečeká…');
    });

    it('then with nothing pending it says everything is fine with the last import and backup', async () => {
      await sources();

      expect(text('.attention .healthy')).toBe(
        'Vše je v pořádku. Platby z banky naposledy stažené 18. 10. 2026 10:05, poslední záloha 23. 10. 2026 03:00.',
      );
      expect(attention().querySelector('.attention-list')).toBeNull();
    });

    it('then unpaired payments of every year, backup problems and an administrator without any second factor each get a row with a link', async () => {
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
        '3 platby čekají na přiřazení dárci (850 Kč). Přiřadit platby',
        'Poslední záloha se nepovedla. Data webu jsou v pořádku, ale nejsou zálohovaná. Zkuste Zálohovat teď; když to nepomůže, zkopírujte zprávu pro technika a pošlete ji správci serveru, který web nainstaloval. Zkopírovat zprávu pro technika Otevřít zálohy',
        'Správce Petr Svoboda nemá druhý faktor (kód z ověřovací aplikace ani přístupový klíč), správa se mu neotevře. Otevřít Správce',
      ]);
      const links = Array.from(
        attention().querySelectorAll('a') as NodeListOf<HTMLAnchorElement>,
      ).map((link) => link.getAttribute('href'));
      expect(links).toEqual(['/sprava/platby', '/sprava/zalohy', '/sprava/spravci']);
      expect(attention().querySelector('.healthy')).toBeNull();
    });

    it('then a backup folder the backend cannot see is told in plain words, without the server details', async () => {
      await sources(
        paymentList([]),
        [administrator()],
        backupsView({ available: false, problems: ['BACKUPS_UNAVAILABLE'] }),
      );

      expect(items()).toEqual([
        'Web teď nevidí složku se zálohami, takže zálohy nejde vytvořit ani stáhnout. Data webu jsou v pořádku. Zkopírujte prosím zprávu pro technika a pošlete ji správci serveru, který web nainstaloval. Zkopírovat zprávu pro technika Otevřít zálohy',
      ]);
      expect(attention().textContent).not.toContain('compose');
    });

    it('then the message for the technician is copied with the technical details from the row', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await sources(
        paymentList([]),
        [administrator()],
        backupsView({ available: false, problems: ['BACKUPS_UNAVAILABLE'] }),
      );

      (
        Array.from(attention().querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
          (button) => button.textContent?.trim() === 'Zkopírovat zprávu pro technika',
        ) as HTMLButtonElement
      ).click();
      await fixture.whenStable();

      expect(writeText).toHaveBeenCalledOnce();
      expect(writeText.mock.calls[0][0]).toContain('/DATA/AppData/nfnn/backups');
    });

    it('then a backup key nobody saved yet gets a row leading to the backups', async () => {
      await sources(
        paymentList([]),
        [administrator()],
        backupsView({ key: { available: true, confirmed: false, confirmedAt: null } }),
      );

      expect(items()).toEqual([
        'Klíč k zálohám si zatím nikdo neuložil. Bez něj žádnou zálohu neobnovíte. Uložit ho má někdo ze správní rady, ne technik. Uložit klíč',
      ]);
      expect(attention().querySelector('a')?.getAttribute('href')).toBe(
        '/sprava/zalohy#klic-k-zaloham',
      );
    });

    it('then receipts without an uploaded signature get a row leading to the receipt settings', async () => {
      await sources();
      http.expectOne(SIGNATURE_URL).flush(NO_SIGNATURE);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual([
        'Potvrzení o daru zatím nemají nahraný podpis, jen čáru se jménem. Nahrát podpis',
      ]);
      expect(attention().querySelector('a')?.getAttribute('href')).toBe(
        '/sprava/nastaveni#settings-RECEIPTS',
      );
      expect(attention().querySelector('.healthy')).toBeNull();
    });

    it('then an uploaded signature or one that cannot be checked adds no row', async () => {
      await sources();
      http.expectOne(SIGNATURE_URL).flush(null, { status: 500, statusText: 'Error' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(attention().querySelector('.attention-list')).toBeNull();
      expect(text('.attention .healthy')).toContain('Vše je v pořádku.');
    });

    it('then a source that fails says so with a retry while the others still show', async () => {
      http.expectOne(IMPORT_STATE_URL).flush(importState());
      http.expectOne(BACKUPS_URL).flush(backupsView());
      http.expectOne(UNPAIRED_URL).flush(paymentList([unpairedPayment()]));
      http.expectOne(ADMINISTRATORS_URL).flush(null, { status: 500, statusText: 'Error' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual([
        '1 platba čeká na přiřazení dárci (500 Kč). Přiřadit platby',
        'Správce se nepodařilo zkontrolovat. Zkusit znovu',
      ]);
      expect(text('.attention [role="alert"]')).toContain('Správce se nepodařilo zkontrolovat.');

      (attention().querySelector('.attention-list button') as HTMLButtonElement).click();
      fixture.detectChanges();
      http.expectOne(ADMINISTRATORS_URL).flush({ items: [administrator()] });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(items()).toEqual(['1 platba čeká na přiřazení dárci (500 Kč). Přiřadit platby']);
    });
  });
});
