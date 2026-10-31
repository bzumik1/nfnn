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
    subjectId: '019a1c00-0000-7000-8000-00000000a002',
    donorId: '019a1c00-0000-7000-8000-00000000a002',
    summary: 'Role správce udělena dárci Petr Svoboda.',
    details: 'Role správce udělena dárci 019a1c00-0000-7000-8000-00000000a002',
    performedAt: '2026-10-21T15:20:00Z',
  });
  const byFormer = adminAction({
    id: '019a1c00-0000-7000-8000-00000000e003',
    adminId: '019a1c00-0000-7000-8000-00000000a009',
    adminName: null,
    adminEmail: null,
    action: 'SOMETHING_NEW',
    subjectId: null,
    donorId: null,
    summary: 'Something new happened',
    details: 'Something new happened',
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

  it('when the first page arrives, then every change shows when, who, what and a Czech sentence from the server, with the technical details collapsed', () => {
    expect(text('[role="status"]')).toBe('Načítáme historii…');

    firstPage();

    const [first, second, third] = rows();
    expect(rowText(first)).toContain('22. 10. 2026 12:00');
    expect(rowText(first)).toContain('Jana Nováková');
    expect(rowText(first)).toContain('jana@example.cz');
    expect(rowText(first)).toContain('Přiřazení platby dárci');
    expect(rowText(first)).not.toContain('PAIR_PAYMENT');
    expect(rowText(first.querySelector('.summary') as HTMLElement)).toBe(
      'Platba 500 Kč ze dne 10. 10. 2026 ručně přiřazena dárci Jana Nováková.',
    );
    const details = first.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent?.trim()).toBe('Technické podrobnosti');
    expect(rowText(details)).toContain('Money[amountMinor=50000, currency=CZK]');
    expect(first.querySelector('.details')?.closest('[lang]')?.getAttribute('lang')).not.toBe('en');
    expect(rowText(second)).toContain('Přidání správce');
    expect(rowText(third)).toContain('správce bez účtu');
    expect(rowText(third.querySelector('details') as HTMLElement)).toContain(
      'Správce: 019a1c00-0000-7000-8000-00000000a009',
    );
    expect(rowText(third)).toContain('SOMETHING_NEW');
    expect(fixture.nativeElement.querySelector('.admin-more')).toBeNull();
  });

  it('when the server registered its receipt signing key, then the row names the server instead of an administrator and the action in Czech', () => {
    firstPage([
      adminAction({
        id: '019a1c00-0000-7000-8000-00000000e010',
        adminId: '00000000-0000-0000-0000-000000000000',
        adminName: null,
        adminEmail: null,
        action: 'REGISTER_RECEIPT_SIGNING_KEY',
        subjectId: null,
        donorId: null,
        summary:
          'Server zaregistroval a zveřejnil svůj klíč k ověřovacím QR kódům na potvrzeních o daru (21fe31df).',
        details: 'Server zaregistroval svůj klíč k ověřovacím QR na potvrzeních o daru: 21fe31df',
      }),
    ]);

    const [row] = rows();
    expect(rowText(row.querySelector('.admin-col') as HTMLElement)).toBe('server');
    expect(rowText(row)).toContain('Registrace klíče k ověřovacím QR kódům');
    expect(rowText(row)).not.toContain('správce bez účtu');
    expect(rowText(row.querySelector('details') as HTMLElement)).not.toContain('Správce:');
  });

  it('when the server adopted a receipt signing key from a restored backup, then the row names the server and the adoption in Czech', () => {
    firstPage([
      adminAction({
        id: '019a1c00-0000-7000-8000-00000000e011',
        adminId: '00000000-0000-0000-0000-000000000000',
        adminName: null,
        adminEmail: null,
        action: 'ADOPT_RECEIPT_SIGNING_KEY',
        subjectId: null,
        donorId: null,
        summary:
          'Server převzal z obnovené zálohy klíč k ověřovacím QR kódům 39f713d0 a zveřejnil ho (obnova 019a1b2c-0000-7000-8000-000000000001).',
        details:
          'Server převzal klíč k ověřovacím QR 39f713d0 z obnovené zálohy (obnova 019a1b2c-0000-7000-8000-000000000001)',
      }),
    ]);

    const [row] = rows();
    expect(rowText(row.querySelector('.admin-col') as HTMLElement)).toBe('server');
    expect(rowText(row)).toContain('Převzetí klíče k ověřovacím QR kódům ze zálohy');
    expect(rowText(row)).toContain(
      'Server převzal z obnovené zálohy klíč k ověřovacím QR kódům 39f713d0 a zveřejnil ho (obnova 019a1b2c-0000-7000-8000-000000000001).',
    );
  });

  it('when a change names the donor it concerned, then the row links to the donor card and a change without a donor does not', () => {
    firstPage([
      paired,
      adminAction({
        id: '019a1c00-0000-7000-8000-00000000e007',
        action: 'RESET_SECOND_FACTOR',
        subjectId: '019a1c00-0000-7000-8000-00000000a002',
        donorId: '019a1c00-0000-7000-8000-00000000a002',
      }),
      byFormer,
    ]);

    const [payment, donor, other] = rows();
    expect(payment.querySelector('a')?.getAttribute('href')).toBe(
      '/sprava/darci/01a18e56-bdb0-775a-bd0a-a60756831369',
    );
    const link = donor.querySelector('a') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Otevřít kartu dárce');
    expect(link.getAttribute('href')).toBe('/sprava/darci/019a1c00-0000-7000-8000-00000000a002');
    expect(other.querySelector('a')).toBeNull();
  });

  it('when the backup schedule was changed, then the change is named in Czech', () => {
    firstPage([adminAction({ action: 'CHANGE_BACKUP_SCHEDULE', subjectId: null })]);

    expect(rowText(rows()[0])).toContain('Změna plánu záloh');
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

  it('when the receipt signature was uploaded or removed, then those changes are named in Czech too', () => {
    firstPage([
      adminAction({
        action: 'CHANGE_RECEIPT_SIGNATURE',
        details: 'Signature image for receipts uploaded: 1200x400 px',
      }),
      adminAction({
        id: '019a1c00-0000-7000-8000-00000000e006',
        action: 'REMOVE_RECEIPT_SIGNATURE',
        details: 'Signature image for receipts removed',
      }),
    ]);

    const [uploaded, removed] = rows();
    expect(rowText(uploaded)).toContain('Nahrání podpisu na potvrzení o daru');
    expect(rowText(removed)).toContain('Odebrání podpisu z potvrzení o daru');
  });

  it('when a receipt was issued, then the change is named in Czech, not by its code', () => {
    firstPage([
      adminAction({
        action: 'ISSUE_RECEIPT',
        summary: 'Dárci Jana Nováková vystaveno roční potvrzení 2027-000001 za rok 2026.',
        client: 'claude.ai',
      }),
    ]);

    const issued = rowText(rows()[0]);
    expect(issued).toContain('Vystavení potvrzení o daru');
    expect(issued).not.toContain('ISSUE_RECEIPT');
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

    expect(text('.ui-card__empty')).toBe('Zatím žádný správce nic nezměnil.');
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
    element<HTMLButtonElement>('.ui-load-state--error button').click();
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
