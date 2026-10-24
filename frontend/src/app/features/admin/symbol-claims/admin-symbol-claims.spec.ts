import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { symbolClaim } from '../testing/admin-fixtures';
import { AdminSymbolClaims } from './admin-symbol-claims';

const LIST_URL = '/api/admin/donations/symbol-claims';
const YES_ID = '019a1c00-0000-7000-8000-00000000c001';
const NO_ID = '019a1c00-0000-7000-8000-00000000c002';

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

describe('Given an administrator on the older symbols page', () => {
  let fixture: ComponentFixture<AdminSymbolClaims>;
  let http: HttpTestingController;

  const yes = symbolClaim();
  const no = symbolClaim({
    id: NO_ID,
    donorId: '019a1c00-0000-7000-8000-00000000a002',
    donorName: 'Petr Svoboda',
    account: '2900233333/2010',
    variableSymbol: '777',
    answer: 'DECLINED',
    answeredAt: '2026-10-19T08:30:00Z',
    donationCount: 0,
  });

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminSymbolClaims],
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
    fixture = TestBed.createComponent(AdminSymbolClaims);
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

  function button(row: HTMLElement, name: string): HTMLButtonElement {
    const found = Array.from(row.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );
    if (found === undefined) {
      throw new Error(`No button "${name}" in "${rowText(row)}"`);
    }
    return found;
  }

  async function listed(items = [yes, no]): Promise<void> {
    http.expectOne(LIST_URL).flush({ items });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('when the list arrives, then every answer shows the donor, account, symbol, answer with its time, the donations and the fitting action', async () => {
    expect(text('[role="status"]:not(:empty)')).toBe('Načítáme odpovědi…');

    await listed();

    const [first, second] = rows();
    expect(rowText(first)).toContain('Jana Nováková');
    expect(rowText(first)).toContain('1234567/0800');
    expect(rowText(first)).toContain('6123456789');
    expect(rowText(first)).toContain('Ano, jsou moje');
    expect(rowText(first)).toContain('20. 10. 2026 11:00');
    expect(rowText(first)).toContain('3 dary');
    expect(button(first, 'Vrátit přiřazení darů')).toBeTruthy();
    expect(first.querySelectorAll('button')).toHaveLength(1);
    expect(first.querySelector('a.admin-name')?.getAttribute('href')).toBe(
      `/sprava/darci/${yes.donorId}`,
    );
    expect(rowText(second)).toContain('Petr Svoboda');
    expect(rowText(second)).toContain('Ne, nejsou moje');
    expect(rowText(second)).toContain('0 darů');
    expect(button(second, 'Zeptat se dárce znovu')).toBeTruthy();
    expect(second.querySelectorAll('button')).toHaveLength(1);
  });

  it('when nobody has answered yet, then the card says so', async () => {
    await listed([]);

    expect(text('.ui-card__empty')).toBe(
      'Zatím nikdo neodpověděl na otázku o starším variabilním symbolu.',
    );
    expect(rows()).toHaveLength(0);
  });

  it('when the donor record is gone, then the row says so instead of a name', async () => {
    await listed([symbolClaim({ donorName: null, donationCount: 1 })]);

    expect(rowText(rows()[0])).toContain('dárce bez záznamu');
    expect(rowText(rows()[0])).toContain('1 dar');
  });

  it('when the list cannot be loaded, then an alert offers a retry that loads again', async () => {
    http.expectOne(LIST_URL).flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(text('[role="alert"]:not(:empty)')).toContain('Odpovědi se nepodařilo načíst.');
    element<HTMLButtonElement>('.ui-load-state--error button').click();
    fixture.detectChanges();

    await listed([yes]);
    expect(rows()).toHaveLength(1);
  });

  it('when a "Yes" is reversed after the confirmation, then the list reloads and the status says what happened', async () => {
    await listed();

    button(rows()[0], 'Vrátit přiřazení darů').click();
    fixture.detectChanges();
    expect(rowText(rows()[0])).toContain(
      'Smažeme 3 dary, platby se vrátí mezi čekající na přiřazení a odpověď se změní na Ne. Vrátit?',
    );
    button(rows()[0], 'Vrátit přiřazení').click();
    fixture.detectChanges();

    const request = http.expectOne(`/api/admin/donations/symbol-claims/${YES_ID}/reverse`);
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text('.ui-notice--status')).toBe(
      'Přiřazení darů u Jana Nováková (VS 6123456789) jsme vrátili: 3 dary jsme smazali a platby s tímto symbolem zase čekají na přiřazení. Odpověď je teď Ne, dárce se už neptáme.',
    );
    expect(document.activeElement).toBe(element('app-live-notice'));
    await listed([{ ...yes, answer: 'DECLINED', donationCount: 0 }, no]);
    expect(rowText(rows()[0])).toContain('Ne, nejsou moje');
  });

  it('when a "No" is deleted after the confirmation, then the list reloads and the status says the donor is asked again', async () => {
    await listed();

    button(rows()[1], 'Zeptat se dárce znovu').click();
    fixture.detectChanges();
    expect(rowText(rows()[1])).toContain(
      'Odpověď Ne smažeme a dárce otázku uvidí znovu ve svém přehledu. Zeptat se znovu?',
    );
    button(rows()[1], 'Zeptat se znovu').click();
    fixture.detectChanges();

    const request = http.expectOne(`/api/admin/donations/symbol-claims/${NO_ID}`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(text('.ui-notice--status')).toBe(
      'Odpověď Ne u Petr Svoboda (VS 777) jsme smazali. Pokud otázka pořád platí, dárce ji uvidí znovu ve svém přehledu.',
    );
    await listed([yes]);
    expect(rows()).toHaveLength(1);
  });

  it('when "Ponechat" answers the confirmation, then nothing is sent and the focus goes from Ponechat back to the opener', async () => {
    await listed();

    button(rows()[0], 'Vrátit přiřazení darů').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(button(rows()[0], 'Ponechat'));
    button(rows()[0], 'Ponechat').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rowText(rows()[0])).not.toContain('Vrátit?');
    expect(document.activeElement).toBe(button(rows()[0], 'Vrátit přiřazení darů'));
    http.expectNone(`/api/admin/donations/symbol-claims/${YES_ID}/reverse`);
  });

  it('when the reversal is refused because of a receipt, then the alert shows the backend title and detail and the list stays', async () => {
    await listed();

    button(rows()[0], 'Vrátit přiřazení darů').click();
    fixture.detectChanges();
    button(rows()[0], 'Vrátit přiřazení').click();
    fixture.detectChanges();
    const refusal = problem(
      409,
      'donations/symbol-claim-has-receipt',
      'Na dary z této odpovědi odkazuje vydané potvrzení',
      'Odpověď nejde zrušit.',
    );
    http
      .expectOne(`/api/admin/donations/symbol-claims/${YES_ID}/reverse`)
      .flush(refusal.body, refusal.options);
    fixture.detectChanges();

    expect(text('.ui-notice--alert')).toBe(
      'Na dary z této odpovědi odkazuje vydané potvrzení. Odpověď nejde zrušit.',
    );
    await fixture.whenStable();
    expect(rows()).toHaveLength(2);
    expect(document.activeElement).toBe(button(rows()[0], 'Vrátit přiřazení darů'));
  });

  it('when the role was taken away meanwhile, then the page goes to the overview', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');

    http.expectOne(LIST_URL).flush(refusal.body, refusal.options);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });
});
