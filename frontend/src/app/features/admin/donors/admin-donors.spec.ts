import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { donorAccount } from '../testing/admin-fixtures';
import { AdminDonors } from './admin-donors';

const SEARCH_URL = '/api/admin/donors';

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

describe('Given an administrator on the donors page', () => {
  let fixture: ComponentFixture<AdminDonors>;
  let http: HttpTestingController;

  const jana = donorAccount({ administrator: true, secondFactorEnabled: true });
  const stavby = donorAccount({
    donorId: '019a1c00-0000-7000-8000-00000000a003',
    type: 'COMPANY',
    name: 'Stavby Novák s.r.o.',
    companyIdentifier: '45274649',
    email: 'stavby@example.cz',
    variableSymbol: '7310945528',
    emailVerified: false,
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminDonors],
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
    fixture = TestBed.createComponent(AdminDonors);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

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

  function type(value: string): void {
    const input = fixture.nativeElement.querySelector('#donor-search') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function searched(value: string, items = [jana, stavby]): Promise<void> {
    type(value);
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();
    const request = http.expectOne((candidate) => candidate.url === SEARCH_URL);
    expect(request.request.params.get('query')).toBe(value.trim());
    request.flush({ items });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('when nothing was typed yet, then the page invites to search and asks the backend nothing', () => {
    expect(text('h1')).toBe('Dárci');
    expect(text('[role="status"]')).toBe('Začněte psát a dárci se objeví tady.');
    http.expectNone((candidate) => candidate.url === SEARCH_URL);
  });

  it('when a query is typed, then after the pause the matching donors come with their e-mail, symbol, registration and account tags', async () => {
    await searched(' nov ');

    const [first, second] = rows();
    expect(rowText(first)).toContain('Jana Nováková');
    expect(rowText(first)).toContain('Osoba');
    expect(rowText(first)).toContain('jana@example.cz');
    expect(rowText(first)).toContain('4821937560');
    expect(rowText(first)).toContain('17. 10. 2026 10:00');
    expect(rowText(first)).toContain('Správce');
    expect(rowText(first)).toContain('Dvoufaktorové ověření');
    expect(first.querySelector('a')?.getAttribute('href')).toBe(
      '/sprava/darci/01a18e56-bdb0-775a-bd0a-a60756831369',
    );
    expect(rowText(second)).toContain('Stavby Novák s.r.o.');
    expect(rowText(second)).toContain('Firma · IČO 45274649');
    expect(rowText(second)).toContain('E-mail neověřen');
    expect(rowText(second)).not.toContain('Správce');
    expect(text('[role="status"]')).toBe('Nalezení dárci: 2');
  });

  it('when nobody matches, then the page says so', async () => {
    await searched('xyz', []);

    expect(text('[role="status"]')).toBe('Žádný dárce neodpovídá.');
    expect(rows()).toHaveLength(0);
  });

  it('when the query is cleared, then the results go and nothing is asked', async () => {
    await searched('nov');

    type('');
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();

    expect(rows()).toHaveLength(0);
    expect(text('[role="status"]')).toBe('Začněte psát a dárci se objeví tady.');
    http.expectNone((candidate) => candidate.url === SEARCH_URL);
  });

  it('when typing continues within the pause, then only the final query is sent', async () => {
    type('n');
    await vi.advanceTimersByTimeAsync(100);
    type('no');
    await vi.advanceTimersByTimeAsync(100);
    type('nov');
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();

    const request = http.expectOne((candidate) => candidate.url === SEARCH_URL);
    expect(request.request.params.get('query')).toBe('nov');
    request.flush({ items: [jana] });
    fixture.detectChanges();
    expect(rows()).toHaveLength(1);
  });

  it('when the search fails, then an alert says so', async () => {
    type('nov');
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();
    http
      .expectOne((candidate) => candidate.url === SEARCH_URL)
      .flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(text('[role="alert"]')).toBe('Hledání se nepodařilo. Zkuste to prosím znovu.');
  });

  it('when the role was taken away meanwhile, then the page goes to the overview', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');

    type('nov');
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();
    http
      .expectOne((candidate) => candidate.url === SEARCH_URL)
      .flush(refusal.body, refusal.options);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });
});
