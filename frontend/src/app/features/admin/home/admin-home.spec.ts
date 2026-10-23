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
  monthOverview,
  overview,
} from '../testing/admin-fixtures';
import { AdminHome } from './admin-home';

const IMPORT_STATE_URL = '/api/admin/donations/import-state';
const OVERVIEW_URL = '/api/admin/donations/overview';
const BACKUPS_URL = '/api/admin/operations/backups';

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
    http.match(OVERVIEW_URL).forEach((pending) => pending.flush(overview()));
    http.match(BACKUPS_URL).forEach((pending) => pending.flush(backupsView()));
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
      .querySelectorAll(`.admin-card[aria-labelledby="${card}"] .admin-data div`)
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
    expect(text('.admin-card[aria-labelledby="admin-import-title"] [role="status"]')).toBe(
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
    expect(fixture.nativeElement.querySelector('.admin-outage')).toBeNull();
  });

  it('when the import has never run, then every value says so', async () => {
    await respond(
      importState({
        coveredFrom: null,
        coveredTo: null,
        lastAttemptedAt: null,
        lastSucceededAt: null,
      }),
    );

    expect(dataRows()).toEqual({
      'Stažené období': 'zatím nic',
      'Poslední úspěšné stažení': 'zatím žádné',
      'Poslední pokus': 'zatím žádný',
      'Poslední chyba': 'žádná',
    });
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

    expect(text('.admin-outage')).toBe(
      'Upozornění: Stahování plateb selhává a fond o tom dostal e-mail: Fio odmítlo token (chybí, ještě neplatí nebo vypršel), selhání za sebou: 1.',
    );
    expect(dataRows()['Poslední chyba']).toBe(
      'Fio odmítlo token (chybí, ještě neplatí nebo vypršel) (HTTP 401)',
    );
  });

  it('when the state cannot be loaded, then an alert offers a retry that asks again', async () => {
    await respond({ title: 'Server error' }, 500);

    expect(text('[role="alert"]')).toContain('Stav importu se nepodařilo načíst.');

    (fixture.nativeElement.querySelector('.admin-retry') as HTMLButtonElement).click();
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

    it('then the donors are summed up and every started month has a row with a yearly total', () => {
      expect(text('.admin-summary')).toBe('Registrovaní dárci: 3, z toho nových v roce 2026: 3.');
      expect(overviewRows()).toEqual([
        'říjen 2026 1 999 Kč 1 žádné',
        'září 2026 2 1 534,50 Kč 1 1 (150 Kč)',
        'srpen 2026 1 200 Kč 1 žádné',
        'Celkem 2026 4 2 733,50 Kč 3 1 (150 Kč)',
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

      expect(text('.admin-card[aria-labelledby="admin-overview-title"] [role="status"]')).toBe(
        'Načítáme dary po měsících…',
      );
      await respondOverview(
        `${OVERVIEW_URL}?year=2025`,
        overview({
          year: 2025,
          newDonors: 0,
          donations: { count: 1, totalMinor: 50000, currency: 'CZK' },
          unpairedPayments: { count: 0, totalMinor: 0, currency: 'CZK' },
          months: [
            monthOverview({
              month: '2025-12',
              donations: { count: 1, totalMinor: 50000, currency: 'CZK' },
              newDonors: 0,
            }),
          ],
        }),
      );

      expect(text('.admin-summary')).toBe('Registrovaní dárci: 3, z toho nových v roce 2025: 0.');
      expect(overviewRows()).toEqual([
        'prosinec 2025 1 500 Kč 0 žádné',
        'Celkem 2025 1 500 Kč 0 žádné',
      ]);
    });
  });

  it('when the overview cannot be loaded, then its alert offers a retry that asks again', async () => {
    http.expectOne(IMPORT_STATE_URL).flush(importState());
    await respondOverview(OVERVIEW_URL, { title: 'Server error' }, 500);

    const card = fixture.nativeElement.querySelector(
      '.admin-card[aria-labelledby="admin-overview-title"]',
    ) as HTMLElement;
    expect(card.querySelector('[role="alert"]')?.textContent).toContain(
      'Dary po měsících se nepodařilo načíst.',
    );

    (card.querySelector('.admin-retry') as HTMLButtonElement).click();
    await respondOverview(OVERVIEW_URL, overview());

    expect(card.querySelector('[role="alert"]')).toBeNull();
    expect(overviewRows()).toHaveLength(4);
  });

  describe('when the backups state arrives', () => {
    beforeEach(() => {
      http.expectOne(IMPORT_STATE_URL).flush(importState());
    });

    function backupsCard(): HTMLElement {
      return fixture.nativeElement.querySelector(
        '.admin-card[aria-labelledby="admin-backups-title"]',
      );
    }

    it('then a healthy state names the last backup and test restore and links to the backups', async () => {
      await respondOverview(BACKUPS_URL, backupsView());

      expect(text('#admin-backups-title')).toBe('Zálohy databáze');
      expect(text('.admin-card[aria-labelledby="admin-backups-title"] .healthy')).toBe(
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
        Array.from(backupsCard().querySelectorAll('.admin-problems li')).map((item) =>
          (item.textContent ?? '').trim(),
        ),
      ).toEqual([
        'Poslední záloha selhala.',
        'Zkušební obnova ještě neproběhla, i když zálohy jsou starší než týden.',
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

      (backupsCard().querySelector('.admin-retry') as HTMLButtonElement).click();
      await respondOverview(BACKUPS_URL, backupsView());

      expect(backupsCard().querySelector('[role="alert"]')).toBeNull();
      expect(dataRows('admin-backups-title')['Poslední záloha']).toBe('23. 10. 2026 03:00 (2 kB)');
    });
  });

  it('when the year has payments without a donor, then the overview links to the bank payments', async () => {
    http.expectOne(IMPORT_STATE_URL).flush(importState());
    await respondOverview(OVERVIEW_URL, overview());

    const link = fixture.nativeElement.querySelector(
      '.admin-card[aria-labelledby="admin-overview-title"] a.admin-card-link',
    ) as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Přiřadit platby bez dárce');
    expect(link.getAttribute('href')).toBe('/sprava/platby');
  });
});
