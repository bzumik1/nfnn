import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { DonationListResponse, DonationSummaryResponse } from '../../donations/donations-api';
import { Receipt, ReceiptInput } from '../../donations/receipt/receipt';
import {
  emptyDonations,
  emptySummary,
  twoYearDonations,
  twoYearSummary,
} from '../../donations/testing/donation-fixtures';
import { DonorDashboard } from './dashboard';

describe('Given a signed-in donor on the dashboard', () => {
  let fixture: ComponentFixture<DonorDashboard>;
  let http: HttpTestingController;
  let store: AuthStore;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DonorDashboard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', sampleDonor({ variableSymbol: '9876543210' })));
    fixture = TestBed.createComponent(DonorDashboard);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  async function respond(summary: DonationSummaryResponse, list: DonationListResponse): Promise<void> {
    http.expectOne('/api/donations/me/summary').flush(summary);
    http.expectOne('/api/donations/me').flush(list);
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function element(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  }

  function text(selector: string): string {
    return normalized(element(selector)?.textContent ?? '');
  }

  function texts(selector: string): string[] {
    return [...(fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>)].map((node) =>
      normalized(node.textContent ?? ''),
    );
  }

  function normalized(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  function shownReceipt(): ReceiptInput | null {
    const receipt = fixture.debugElement.query(By.directive(Receipt));
    return receipt ? (receipt.componentInstance as Receipt).data() : null;
  }

  async function click(selector: string): Promise<void> {
    (element(selector) as HTMLButtonElement).click();
    await settle();
  }

  async function clickYear(year: string): Promise<void> {
    const button = [...(fixture.nativeElement.querySelectorAll('.year-toggle button') as NodeListOf<HTMLButtonElement>)].find(
      (candidate) => normalized(candidate.textContent ?? '') === year,
    );
    button!.click();
    await settle();
  }

  it('when the page opens, then it greets the donor by name and shows the variable symbol', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    expect(text('.topbar-greeting')).toContain('Jana Nováková');
    expect(text('.symbol-value')).toBe('9876543210');
  });

  it('when the donations are still loading, then a loading line stands where the stat cards go and the symbol stays visible', async () => {
    expect(text('.dashboard-loading')).toBe('Načítáme vaše dary…');
    expect(element('.stats-grid')).toBeNull();
    expect(text('.symbol-value')).toBe('9876543210');

    await respond(twoYearSummary(), twoYearDonations());

    expect(element('.dashboard-loading')).toBeNull();
  });

  it('when the donations arrive, then the stat cards show the total, the count and the last donation from the summary', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    expect(texts('.stat-value')).toEqual(['1 750 Kč', '3', '15. 03. 2026']);
  });

  it('when the donations arrive, then the payments table lists every donation newest first with date, amount, purpose and status', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    const rows = [...(fixture.nativeElement.querySelectorAll('.payments-card tbody tr') as NodeListOf<HTMLElement>)].map((row) =>
      [...row.querySelectorAll('td')].slice(0, 4).map((cell) => normalized(cell.textContent ?? '')),
    );
    expect(rows).toEqual([
      ['15. 03. 2026', '500 Kč', 'Obecný příspěvek', 'Přijato'],
      ['10. 01. 2026', '1 000 Kč', 'Obecný příspěvek', 'Přijato'],
      ['05. 11. 2025', '250 Kč', 'Obecný příspěvek', 'Přijato'],
      ['20. 08. 2025', '2 000 Kč', 'Obecný příspěvek', 'Vráceno'],
    ]);
  });

  it('when the donations arrive, then the year toggle lists the summary years and the newest is selected', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    expect(texts('.year-toggle button')).toEqual(['2026', '2025']);
    expect(text('.year-toggle button.is-active')).toBe('2026');
    expect(text('.yearly-count')).toBe('2 příspěvky v roce 2026');
    expect(text('.yearly-total')).toBe('1 500 Kč celkem');
  });

  it('when the donor switches the year, then the yearly count and total come from that year', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    await clickYear('2025');

    expect(text('.year-toggle button.is-active')).toBe('2025');
    expect(text('.yearly-count')).toBe('1 příspěvek v roce 2025');
    expect(text('.yearly-total')).toBe('250 Kč celkem');
    expect(text('.yearly-pdf')).toBe('↓ PDF za rok 2025');
  });

  it("when the donor opens the yearly receipt, then it shows that year's received donations", async () => {
    await respond(twoYearSummary(), twoYearDonations());

    await click('.yearly-pdf');

    expect(shownReceipt()).toEqual({
      kind: 'summary',
      summary: {
        year: '2026',
        total: 1500,
        payments: [
          { id: 'd-4', date: '15. 03. 2026', amount: 500, purpose: 'Obecný příspěvek', status: 'Přijato' },
          { id: '2026-000017', date: '10. 01. 2026', amount: 1000, purpose: 'Obecný příspěvek', status: 'Přijato' },
        ],
      },
    });
  });

  it('when the donor opens the yearly receipt of a year with a refund, then the refunded donation is left out like in the total', async () => {
    await respond(twoYearSummary(), twoYearDonations());
    await clickYear('2025');

    await click('.yearly-pdf');

    expect(shownReceipt()).toEqual({
      kind: 'summary',
      summary: {
        year: '2025',
        total: 250,
        payments: [{ id: 'd-2', date: '05. 11. 2025', amount: 250, purpose: 'Obecný příspěvek', status: 'Přijato' }],
      },
    });
  });

  it('when the donor opens the receipt of one payment, then it shows that payment', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    await click('.payments-card tbody tr:nth-child(2) .download-btn');

    expect(shownReceipt()).toEqual({
      kind: 'single',
      payment: { id: '2026-000017', date: '10. 01. 2026', amount: 1000, purpose: 'Obecný příspěvek', status: 'Přijato' },
    });
  });

  it('when the donor has no donations yet, then the cards show zeros and the yearly and payments cards explain how a gift appears', async () => {
    await respond(emptySummary(), emptyDonations());

    expect(texts('.stat-value')).toEqual(['0 Kč', '0', '—']);
    expect(element('.year-toggle')).toBeNull();
    expect(element('.yearly-pdf')).toBeNull();
    expect(text('.yearly-empty')).toBe(
      'Zatím jsme od vás žádný dar nepřijali. Jakmile dorazí platba s vaším variabilním symbolem, objeví se tady.',
    );
    expect(element('.payments-card table')).toBeNull();
    expect(text('.payments-empty')).toBe('Zatím tu není žádná platba.');
  });

  it('when the donations cannot be loaded, then an alert offers to try again and a retry asks for both again and shows them', async () => {
    http.expectOne('/api/donations/me').flush(twoYearDonations());
    http
      .expectOne('/api/donations/me/summary')
      .flush({ title: 'Chyba' }, { status: 500, statusText: 'Internal Server Error' });
    await settle();

    expect(text('[role="alert"]')).toContain('Přehled darů se nepodařilo načíst.');
    expect(element('.stats-grid')).toBeNull();
    expect(text('.symbol-value')).toBe('9876543210');

    await click('.dashboard-error button');
    expect(text('.dashboard-loading')).toBe('Načítáme vaše dary…');
    await respond(twoYearSummary(), twoYearDonations());

    expect(element('[role="alert"]')).toBeNull();
    expect(texts('.stat-value')).toEqual(['1 750 Kč', '3', '15. 03. 2026']);
  });

  it('when the donor signs out, then the session ends and the home page opens', async () => {
    await respond(twoYearSummary(), twoYearDonations());
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('.topbar-logout') as HTMLButtonElement).click();
    http.expectOne('/api/donors/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(store.signedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
