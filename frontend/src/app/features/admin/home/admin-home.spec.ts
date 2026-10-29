import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import {
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
      ).toEqual(['Měsíc', 'Dary', 'Noví dárci', 'Celkem', 'Přiřazené', 'Bez dárce']);
      expect(overviewRows()).toEqual([
        'říjen 2026 1 1 999 Kč 999 Kč 0 Kč',
        'září 2026 3 1 1 684,50 Kč 1 534,50 Kč 150 Kč',
        'srpen 2026 1 1 200 Kč 200 Kč 0 Kč',
        'Celkem 2026 5 3 2 883,50 Kč 2 733,50 Kč 150 Kč',
      ]);
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
        'prosinec 2025 1 0 500 Kč 500 Kč 0 Kč',
        'Celkem 2025 1 0 500 Kč 500 Kč 0 Kč',
      ]);
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
        'Poslední záloha se nepovedla. Data webu jsou v pořádku, ale nejsou zálohovaná. Zkuste Zálohovat teď; když to nepomůže, pošlete stránku Zálohy správci serveru.',
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
        'Poslední záloha se nepovedla. Data webu jsou v pořádku, ale nejsou zálohovaná. Zkuste Zálohovat teď; když to nepomůže, pošlete stránku Zálohy správci serveru. Otevřít zálohy',
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
        'Web teď nevidí složku se zálohami, takže zálohy nejde vytvořit ani stáhnout. Data webu jsou v pořádku. Pošlete prosím stránku Zálohy správci serveru. Otevřít zálohy',
      ]);
      expect(attention().textContent).not.toContain('compose');
    });

    it('then a backup key nobody saved yet gets a row leading to the backups', async () => {
      await sources(
        paymentList([]),
        [administrator()],
        backupsView({ key: { available: true, confirmed: false, confirmedAt: null } }),
      );

      expect(items()).toEqual([
        'Klíč k zálohám si zatím nikdo neuložil. Bez něj žádnou zálohu neobnovíte. Uložit klíč',
      ]);
      expect(attention().querySelector('a')?.getAttribute('href')).toBe(
        '/sprava/zalohy#klic-k-zaloham',
      );
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
