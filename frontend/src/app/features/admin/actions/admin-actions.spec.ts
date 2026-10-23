import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { adminAction } from '../testing/admin-fixtures';
import { AdminActions } from './admin-actions';

const LIST_URL = '/api/admin/donors/actions';

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

describe('Given an administrator on the history page', () => {
  let fixture: ComponentFixture<AdminActions>;
  let http: HttpTestingController;

  const paired = adminAction();
  const granted = adminAction({
    id: '019a1c00-0000-7000-8000-00000000e002',
    action: 'GRANT_ADMINISTRATION',
    details: 'Donor 019a1c00-0000-7000-8000-00000000a002 granted the ADMIN role',
    performedAt: '2026-10-21T15:20:00Z',
  });
  const byFormer = adminAction({
    id: '019a1c00-0000-7000-8000-00000000e003',
    adminId: '019a1c00-0000-7000-8000-00000000a009',
    adminName: null,
    adminEmail: null,
    action: 'SOMETHING_NEW',
    details: 'details',
    performedAt: '2026-10-20T15:20:00Z',
  });

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminActions],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminActions);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

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

  function rows(): HTMLTableRowElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));
  }

  function rowText(row: HTMLElement): string {
    return (row.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function firstPage(items = [paired, granted, byFormer], hasMore = false): void {
    const request = http.expectOne((candidate) => candidate.url === LIST_URL);
    expect(request.request.params.get('limit')).toBe('50');
    expect(request.request.params.has('before')).toBe(false);
    request.flush({ items, hasMore });
    fixture.detectChanges();
  }

  it('when the first page arrives, then every change shows when, who, what in Czech with its code, and the technical details', () => {
    expect(text('[role="status"]')).toBe('Načítáme historii…');

    firstPage();

    const [first, second, third] = rows();
    expect(rowText(first)).toContain('22. 10. 2026 12:00');
    expect(rowText(first)).toContain('Jana Nováková');
    expect(rowText(first)).toContain('jana@example.cz');
    expect(rowText(first)).toContain('Přiřazení platby dárci');
    expect(rowText(first)).toContain('PAIR_PAYMENT');
    expect(rowText(first)).toContain('paired to donor');
    expect(rowText(second)).toContain('Přidání správce');
    expect(rowText(third)).toContain('správce bez účtu');
    expect(rowText(third)).toContain('019a1c00-0000-7000-8000-00000000a009');
    expect(rowText(third)).toContain('SOMETHING_NEW');
    expect(fixture.nativeElement.querySelector('.admin-more')).toBeNull();
  });

  it('when the settings or a log level were changed, then those changes are named in Czech too', () => {
    firstPage([
      adminAction({ action: 'CHANGE_SETTINGS', details: 'Settings changed: PUBLIC_URL' }),
      adminAction({
        id: '019a1c00-0000-7000-8000-00000000e004',
        action: 'CHANGE_LOG_LEVEL',
        details: 'Logger cz.novanadeje.app set to DEBUG',
      }),
      adminAction({
        id: '019a1c00-0000-7000-8000-00000000e005',
        action: 'RESET_LOG_LEVEL',
        details: 'Logger cz.novanadeje.app reset',
      }),
    ]);

    const [settings, raised, reset] = rows();
    expect(rowText(settings)).toContain('Změna nastavení webu');
    expect(rowText(raised)).toContain('Dočasná změna úrovně logování');
    expect(rowText(reset)).toContain('Vrácení úrovně logování');
  });

  it('when a change came through a connected application, then the row names the application and a change on the web names none', () => {
    firstPage([adminAction({ action: 'CHANGE_LOG_LEVEL', client: 'claude.ai' }), granted]);

    const [throughApp, onWeb] = rows();
    expect(rowText(throughApp)).toContain('přes aplikaci claude.ai');
    expect(rowText(throughApp)).toContain('Dočasná změna úrovně logování');
    expect(rowText(onWeb)).not.toContain('přes aplikaci');
  });

  it('when nothing has been changed yet, then the card says so', () => {
    firstPage([]);

    expect(text('.admin-empty')).toBe('Zatím žádný správce nic nezměnil.');
  });

  it('when more pages exist, then "Načíst starší" asks for the changes before the oldest one and appends them', () => {
    firstPage([paired, granted], true);
    expect(text('.admin-more button')).toBe('Načíst starší');

    element<HTMLButtonElement>('.admin-more button').click();
    fixture.detectChanges();

    const request = http.expectOne((candidate) => candidate.url === LIST_URL);
    expect(request.request.params.get('before')).toBe('2026-10-21T15:20:00Z');
    expect(request.request.params.get('limit')).toBe('50');
    expect(element<HTMLButtonElement>('.admin-more button').disabled).toBe(true);
    request.flush({ items: [byFormer], hasMore: false });
    fixture.detectChanges();

    expect(rows()).toHaveLength(3);
    expect(rowText(rows()[2])).toContain('SOMETHING_NEW');
    expect(fixture.nativeElement.querySelector('.admin-more')).toBeNull();
  });

  it('when the next page cannot be loaded, then an alert says so and the button stays for another try', () => {
    firstPage([paired], true);

    element<HTMLButtonElement>('.admin-more button').click();
    fixture.detectChanges();
    http
      .expectOne((candidate) => candidate.url === LIST_URL)
      .flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(text('.admin-more [role="alert"]')).toBe(
      'Starší záznamy se nepodařilo načíst. Zkuste to prosím znovu.',
    );
    expect(element<HTMLButtonElement>('.admin-more button').disabled).toBe(false);
    expect(rows()).toHaveLength(1);
  });

  it('when the list cannot be loaded, then an alert offers a retry that loads again', () => {
    http
      .expectOne((candidate) => candidate.url === LIST_URL)
      .flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(text('[role="alert"]')).toContain('Historii se nepodařilo načíst.');
    element<HTMLButtonElement>('.admin-retry').click();
    fixture.detectChanges();

    firstPage([paired]);
    expect(rows()).toHaveLength(1);
  });

  it('when the role was taken away meanwhile, then the page goes to the overview', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');

    http.expectOne((candidate) => candidate.url === LIST_URL).flush(refusal.body, refusal.options);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });
});
