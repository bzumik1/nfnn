import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { importState } from '../testing/admin-fixtures';
import { AdminHome } from './admin-home';

const IMPORT_STATE_URL = '/api/admin/donations/import-state';

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

  afterEach(() => http.verify());

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function dataRows(): Record<string, string> {
    const rows: Record<string, string> = {};
    fixture.nativeElement.querySelectorAll('.admin-data div').forEach((row: HTMLElement) => {
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

  it('when the page opens, then it asks for the import state with the token and says it is loading', () => {
    const request = http.expectOne(IMPORT_STATE_URL);

    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(text('h1')).toBe('Správa');
    expect(text('[role="status"]')).toBe('Načítáme stav importu…');
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
  it('when the home is shown, then it links to the bank payments, the administrators, the older symbols and the history', async () => {
    http.expectOne(IMPORT_STATE_URL).flush(importState());
    fixture.detectChanges();

    const links = Array.from(
      fixture.nativeElement.querySelectorAll('nav.admin-links a') as NodeListOf<HTMLAnchorElement>,
    ).map((link) => [
      link.getAttribute('href'),
      link.querySelector('.admin-link-title')?.textContent?.trim(),
    ]);
    expect(links).toEqual([
      ['/sprava/platby', 'Platby z banky'],
      ['/sprava/spravci', 'Správci'],
      ['/sprava/starsi-symboly', 'Starší symboly'],
      ['/sprava/historie', 'Historie správy'],
    ]);
  });
});
