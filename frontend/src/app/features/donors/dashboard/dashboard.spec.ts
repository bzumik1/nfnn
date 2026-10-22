import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { DonationListResponse, DonationSummaryResponse } from '../../donations/donations-api';
import {
  donationItem,
  emptyDonations,
  emptySummary,
  twoYearDonations,
  twoYearSummary,
} from '../../donations/testing/donation-fixtures';
import { bankAccount } from '../../donations/testing/bank-account-fixtures';
import { BankAccountsCard } from './bank-accounts-card/bank-accounts-card';
import { DonorDashboard } from './dashboard';

const OBJECT_URL = 'blob:http://localhost/receipt';
const BANK_CHECK_URL = '/api/donations/me/bank-check';
const BANK_ACCOUNTS_URL = '/api/donations/me/bank-accounts';
const EARLIER = '2026-10-18T08:05:30Z';
const LATER = '2026-10-18T08:07:10Z';

describe('Given a signed-in donor on the dashboard', () => {
  let fixture: ComponentFixture<DonorDashboard>;
  let http: HttpTestingController;
  let store: AuthStore;
  let savedFiles: { fileName: string; href: string }[];
  let createObjectURL: ReturnType<typeof vi.fn>;
  let bankCheck: TestRequest;

  beforeEach(async () => {
    localStorage.clear();
    savedFiles = [];
    createObjectURL = vi.fn(() => OBJECT_URL);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      savedFiles.push({ fileName: this.download, href: this.href });
    });
    await TestBed.configureTestingModule({
      imports: [DonorDashboard],
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', sampleDonor({ variableSymbol: '9876543210' })));
    fixture = TestBed.createComponent(DonorDashboard);
    fixture.detectChanges();
    bankCheck = http.expectOne({ method: 'POST', url: BANK_CHECK_URL });
    http.expectOne({ method: 'GET', url: BANK_ACCOUNTS_URL }).flush({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

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

  async function settleBlobFailure(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
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

  function button(selector: string): HTMLButtonElement {
    return element(selector) as HTMLButtonElement;
  }

  async function click(selector: string): Promise<void> {
    button(selector).click();
    await settle();
  }

  async function clickYear(year: string): Promise<void> {
    const toggle = [...(fixture.nativeElement.querySelectorAll('.year-toggle button') as NodeListOf<HTMLButtonElement>)].find(
      (candidate) => normalized(candidate.textContent ?? '') === year,
    );
    toggle!.click();
    await settle();
  }

  function pdf(): Blob {
    return new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' });
  }

  function attachment(fileName: string): { headers: Record<string, string> } {
    return {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`,
      },
    };
  }

  function problemBlob(type: string, title: string, status: number): Blob {
    return new Blob([JSON.stringify({ type: `https://nfnn.cz/problems/${type}`, title, detail: '', status })], {
      type: 'application/problem+json',
    });
  }

  function summaryWithReceiptsFrom2026(): DonationSummaryResponse {
    return { ...twoYearSummary(), receiptsAvailableFrom: 2026 };
  }

  function donationsWithoutReceiptsBefore2026(): DonationListResponse {
    const list = twoYearDonations();
    return {
      ...list,
      items: list.items.map((item) => (item.receivedAt < '2026-01-01' ? { ...item, receiptAvailable: false } : item)),
    };
  }

  const yearlyUrl = (year: number): string => `/api/donations/me/receipts/yearly?year=${year}`;
  const secondRowButton = '.payments-card tbody tr:nth-child(2) .download-btn';
  const thirdRowButton = '.payments-card tbody tr:nth-child(3) .download-btn';

  it('when the page opens, then it asks the bank for new payments while the donations load', async () => {
    expect(bankCheck.request.method).toBe('POST');
    expect(bankCheck.request.headers.get('Authorization')).toBe('Bearer token-1');

    await respond(twoYearSummary(), twoYearDonations());
  });

  it('when the bank was checked recently and nothing is running, then the time of the bank data shows and the donations are not loaded again', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    bankCheck.flush({ bankDataAsOf: EARLIER, checking: false }, { status: 202, statusText: 'Accepted' });
    await settle();

    expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:05');
    expect(button('.bank-check-btn').disabled).toBe(false);
    http.expectNone('/api/donations/me/summary');
    http.expectNone(BANK_ACCOUNTS_URL);
  });

  it('when the bank is being checked, then the dashboard says so, waits for the check and loads the donations again once new bank data arrived', async () => {
    vi.useFakeTimers();
    await respond(emptySummary(), emptyDonations());

    bankCheck.flush({ bankDataAsOf: EARLIER, checking: true }, { status: 202, statusText: 'Accepted' });
    await settle();

    expect(text('.bank-check-status')).toBe('Kontrolujeme nové platby v bance…');
    expect(button('.bank-check-btn').disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    http.expectOne({ method: 'GET', url: BANK_CHECK_URL }).flush({ bankDataAsOf: EARLIER, checking: true });
    await vi.advanceTimersByTimeAsync(2000);
    http.expectOne({ method: 'GET', url: BANK_CHECK_URL }).flush({ bankDataAsOf: LATER, checking: false });
    http.expectOne(BANK_ACCOUNTS_URL).flush({ items: [bankAccount()] });
    await respond(twoYearSummary(), twoYearDonations());

    expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:07');
    expect(text('app-bank-accounts-card .account-number')).toBe('2900233333/2010');
    expect(button('.bank-check-btn').disabled).toBe(false);
    expect(texts('.payments-card tbody tr')).toHaveLength(twoYearDonations().items.length);
  });

  it('when the check ends without new bank data, then the donations are not loaded again', async () => {
    vi.useFakeTimers();
    await respond(twoYearSummary(), twoYearDonations());

    bankCheck.flush({ bankDataAsOf: EARLIER, checking: true }, { status: 202, statusText: 'Accepted' });
    await vi.advanceTimersByTimeAsync(2000);
    http.expectOne({ method: 'GET', url: BANK_CHECK_URL }).flush({ bankDataAsOf: EARLIER, checking: false });
    await settle();

    http.expectNone('/api/donations/me/summary');
    http.expectNone(BANK_ACCOUNTS_URL);
    expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:05');
  });

  it('when the donor presses Obnovit, then the bank is asked again and the donations load again even without new bank data', async () => {
    await respond(twoYearSummary(), twoYearDonations());
    bankCheck.flush({ bankDataAsOf: EARLIER, checking: false }, { status: 202, statusText: 'Accepted' });
    await settle();

    await click('.bank-check-btn');
    http.expectOne({ method: 'POST', url: BANK_CHECK_URL }).flush({ bankDataAsOf: EARLIER, checking: false });

    http.expectOne(BANK_ACCOUNTS_URL).flush({ items: [bankAccount()] });
    await respond(twoYearSummary(), twoYearDonations());
    expect(text('app-bank-accounts-card .account-number')).toBe('2900233333/2010');
    expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:05');
  });

  it('when the add account dialog checked the bank and got new data, then the bank time changes and the donations load again', async () => {
    await respond(twoYearSummary(), twoYearDonations());
    bankCheck.flush({ bankDataAsOf: EARLIER, checking: false }, { status: 202, statusText: 'Accepted' });
    await settle();
    const card = fixture.debugElement.query(By.directive(BankAccountsCard)).componentInstance as BankAccountsCard;

    card.bankChecked.emit({ bankDataAsOf: EARLIER, checking: false });
    await settle();
    http.expectNone('/api/donations/me/summary');

    card.bankChecked.emit({ bankDataAsOf: LATER, checking: false });
    await respond(twoYearSummary(), twoYearDonations());

    expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:07');
  });

  it('when the bank check fails, then the dashboard shows no bank time and the donor can try again', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    bankCheck.flush(null, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(element('.bank-check-status')).toBeNull();
    expect(button('.bank-check-btn').disabled).toBe(false);
  });

  it('when the payments are shown, then a note says how long a payment takes to appear and that it needs the variable symbol', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    expect(text('.bank-hint')).toContain('Okamžitá platba se tu obvykle objeví do minuty');
    expect(text('.bank-hint')).toContain('váš variabilní symbol');
    expect(text('.bank-hint')).toContain(
      'Nové platby hledáme v bance každou hodinu a také když otevřete tento přehled nebo stisknete „Obnovit“, nejvýš ale jednou za 30 sekund.',
    );
    expect(text('.bank-hint')).not.toContain('při každém otevření');
  });

  it('when the page opens, then the top bar shows the name of the donor without a greeting and the variable symbol is shown', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    expect(normalized(text('.topbar-donor'))).toBe('Jana Nováková');
    expect(text('.symbol-value')).toBe('9876543210');
  });

  it('when the page opens, then the top bar offers a way back to the home page besides the logo', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    const back = element('.topbar a.topbar-home') as HTMLAnchorElement;
    expect(normalized(back.querySelector('.topbar-home-label')?.textContent ?? '')).toBe('Hlavní stránka');
    expect(normalized(back.querySelector('.topbar-home-label-short')?.textContent ?? '')).toBe('Domů');
    expect(back.getAttribute('href')).toBe('/');
  });

  it('when the page opens, then the variable symbol can be copied and the donor can give again with it', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    expect(text('.symbol-card app-copy-button button')).toBe('Kopírovat variabilní symbol');
    const giveAgain = element('.symbol-card a.give-again') as HTMLAnchorElement;
    expect(normalized(giveAgain.textContent ?? '')).toBe('Přispět znovu');
    expect(giveAgain.getAttribute('href')).toBe('/#donate');
  });

  it('when the payments are shown, then every cell names its column so a phone can show the rows as cards', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    const labels = [...(fixture.nativeElement.querySelectorAll('.payments-card tbody tr:first-child td') as NodeListOf<HTMLElement>)].map(
      (cell) => cell.dataset['label'],
    );
    expect(labels).toEqual(['Datum', 'Částka', 'Účel', 'Stav', 'Potvrzení']);
  });

  it('when a donation was paired by the sender account, then its purpose carries a tag naming the end of that account', async () => {
    const list = twoYearDonations();
    list.items[0] = donationItem({ id: 'd-4', pairedBy: 'SENDER_ACCOUNT', senderAccount: '2900233333/2010' });
    list.items[1] = donationItem({ id: 'd-3', pairedBy: 'SENDER_ACCOUNT', senderAccount: '19-2000145399/0800' });

    await respond(twoYearSummary(), list);

    const tag = element('.payments-card tbody tr:first-child .pairing-tag');
    expect(tag?.getAttribute('title')).toBe('Přiřazeno podle účtu 2900233333/2010, platba přišla bez variabilního symbolu');
    expect(normalized(tag?.querySelector('[aria-hidden="true"]')?.textContent ?? '')).toBe('bez VS · …3333/2010');
    expect(normalized(tag?.querySelector('.visually-hidden')?.textContent ?? '')).toBe(
      'Přiřazeno podle účtu 2900233333/2010, platba přišla bez variabilního symbolu',
    );
    expect(text('.payments-card tbody tr:nth-child(2) .pairing-tag [aria-hidden="true"]')).toBe('bez VS · …5399/0800');
  });

  it('when a donation was paired by a symbol the donor confirmed at their account, then its purpose carries a tag naming that symbol and the end of the account', async () => {
    const list = twoYearDonations();
    list.items[0] = donationItem({
      id: 'd-4',
      pairedBy: 'CONFIRMED_SYMBOL',
      senderAccount: '19-2000145399/0800',
      confirmedSymbol: '6123456789',
    });

    await respond(twoYearSummary(), list);

    const tag = element('.payments-card tbody tr:first-child .pairing-tag');
    const sentence =
      'Přiřazeno podle účtu 19-2000145399/0800 a variabilního symbolu 6123456789, který jste u účtu potvrdili jako svůj';
    expect(tag?.getAttribute('title')).toBe(sentence);
    expect(normalized(tag?.querySelector('[aria-hidden="true"]')?.textContent ?? '')).toBe('VS 6123456789 · …5399/0800');
    expect(normalized(tag?.querySelector('.visually-hidden')?.textContent ?? '')).toBe(sentence);
    expect(texts('.pairing-tag')).toHaveLength(1);
  });

  it('when donations were paired by the variable symbol or by hand, then they carry no tag', async () => {
    const list = twoYearDonations();
    list.items[0] = donationItem({ id: 'd-4', pairedBy: null, source: 'MANUAL' });

    await respond(twoYearSummary(), list);

    expect(element('.pairing-tag')).toBeNull();
  });

  it('when the page opens, then the bank accounts card shows below the payments with the variable symbol for adding one', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    const cards = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.payments-card, app-bank-accounts-card, app-profile-card')];
    expect(cards.map((card) => card.tagName.toLowerCase())).toEqual(['div', 'app-bank-accounts-card', 'app-profile-card']);
    expect(text('app-bank-accounts-card h2')).toBe('Moje bankovní účty');
  });

  it('when the page opens, then the help line keeps a space before the e-mail address', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    expect(text('.contact-line')).toBe('Máte dotaz k platbě? Napište nám na info@nfnn.cz');
  });

  it('when the page opens, then one level-one heading names the page for screen readers', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    const headings = (fixture.nativeElement as HTMLElement).querySelectorAll('h1');
    expect(headings.length).toBe(1);
    expect(headings[0].textContent?.trim()).toBe('Můj přehled darů');
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

  it('when a donation has hellers, then its amount shows two decimals', async () => {
    const list = twoYearDonations();
    list.items[0] = donationItem({ id: 'd-4', receivedAt: '2026-03-15', amountMinor: 100050 });
    const summary = twoYearSummary();
    summary.totalAmountMinor = 225050;

    await respond(summary, list);

    expect(text('.payments-card tbody tr:first-child td.amount')).toBe('1 000,50 Kč');
    expect(texts('.stat-value')[0]).toBe('2 250,50 Kč');
  });

  it('when a year holds five or more donations, then the yearly count uses the plural for many', async () => {
    const summary = twoYearSummary();
    summary.byYear[0] = { year: 2026, count: 5, totalAmountMinor: 150000 };

    await respond(summary, twoYearDonations());

    expect(text('.yearly-count')).toBe('5 příspěvků v roce 2026');
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

  it('when the donor downloads the receipt of one payment, then the PDF of that donation is saved under the name the server gives', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    await click(secondRowButton);
    const request = http.expectOne('/api/donations/me/d-3/receipt');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    const file = pdf();
    request.flush(file, attachment('potvrzeni-o-daru-2026-000017.pdf'));
    await settle();

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-daru-2026-000017.pdf', href: OBJECT_URL }]);
    expect(element('[role="alert"]')).toBeNull();
  });

  it('when the donor downloads the receipt of a completed year, then the PDF of that year is saved', async () => {
    await respond(twoYearSummary(), twoYearDonations());
    await clickYear('2025');

    await click('.yearly-pdf');
    http.expectOne(yearlyUrl(2025)).flush(pdf(), attachment('potvrzeni-o-darech-2025.pdf'));
    await settle();

    expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-darech-2025.pdf', href: OBJECT_URL }]);
  });

  it('when the selected year is not completed yet, then its PDF button is disabled and a line says when it can be downloaded', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    expect(text('.year-toggle button.is-active')).toBe('2026');
    expect(button('.yearly-pdf').disabled).toBe(true);
    expect(text('.yearly-pdf')).toBe('↓ PDF za rok 2026');
    expect(text('.yearly-hint')).toBe('Potvrzení za rok 2026 bude ke stažení po skončení roku.');

    await click('.yearly-pdf');
    http.expectNone((request) => request.url.startsWith('/api/donations/me/receipts/yearly'));

    await clickYear('2025');

    expect(button('.yearly-pdf').disabled).toBe(false);
    expect(element('.yearly-hint')).toBeNull();
  });

  it('when a payment was refunded, then its row offers no receipt download and no line says from when receipts are issued', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    const rows = [...(fixture.nativeElement.querySelectorAll('.payments-card tbody tr') as NodeListOf<HTMLElement>)];
    expect(rows.map((row) => row.querySelector('.download-btn') !== null)).toEqual([true, true, true, false]);
    expect(element('.receipts-from')).toBeNull();
  });

  it('when donations were received before the first receipt year, then their rows offer no download and a line under the payments says from when receipts are issued', async () => {
    await respond(summaryWithReceiptsFrom2026(), donationsWithoutReceiptsBefore2026());

    const rows = [...(fixture.nativeElement.querySelectorAll('.payments-card tbody tr') as NodeListOf<HTMLElement>)];
    expect(rows.map((row) => row.querySelector('.download-btn') !== null)).toEqual([true, true, false, false]);
    expect(rows.map((row) => row.querySelector('td.receipt')!.classList.contains('is-empty'))).toEqual([false, false, true, true]);
    expect(text('.payments-card .receipts-from')).toBe(
      'Potvrzení o daru tu vystavujeme za dary přijaté od 1. ledna 2026, u starších darů proto tlačítko „Stáhnout PDF“ chybí.',
    );
  });

  it('when the selected year is before the first receipt year, then the yearly card offers no PDF and a line says from which year receipts are issued', async () => {
    await respond(summaryWithReceiptsFrom2026(), donationsWithoutReceiptsBefore2026());

    expect(text('.yearly-pdf')).toBe('↓ PDF za rok 2026');
    expect(text('.yearly-hint')).toBe('Potvrzení za rok 2026 bude ke stažení po skončení roku.');

    await clickYear('2025');

    expect(text('.year-toggle button.is-active')).toBe('2025');
    expect(element('.yearly-pdf')).toBeNull();
    expect(text('#yearly-hint')).toBe('Potvrzení za rok tu vystavujeme za dary od roku 2026.');
    expect(text('.yearly-count')).toBe('1 příspěvek v roce 2025');
  });

  it('when a download is running, then its button is disabled and says the PDF is being prepared until it arrives', async () => {
    await respond(twoYearSummary(), twoYearDonations());
    await clickYear('2025');

    await click('.yearly-pdf');
    expect(button('.yearly-pdf').disabled).toBe(true);
    expect(text('.yearly-pdf')).toBe('Připravujeme PDF…');

    await click(secondRowButton);
    expect(button(secondRowButton).disabled).toBe(true);
    expect(text(secondRowButton)).toBe('Připravujeme PDF…');
    expect(text('.payments-card tbody tr:first-child .download-btn')).toBe('Stáhnout PDF');

    http.expectOne(yearlyUrl(2025)).flush(pdf(), attachment('potvrzeni-o-darech-2025.pdf'));
    await settle();
    expect(button('.yearly-pdf').disabled).toBe(false);
    expect(text('.yearly-pdf')).toBe('↓ PDF za rok 2025');
    expect(button(secondRowButton).disabled).toBe(true);

    http.expectOne('/api/donations/me/d-3/receipt').flush(pdf(), attachment('potvrzeni-o-daru-2026-000017.pdf'));
    await settle();
    expect(button(secondRowButton).disabled).toBe(false);
    expect(text(secondRowButton)).toBe('Stáhnout PDF');
  });

  it('when the server says the year is not completed yet, then the yearly card shows the title of that problem', async () => {
    const summary = twoYearSummary();
    summary.yearlyReceiptsAvailableThrough = 2026;
    await respond(summary, twoYearDonations());

    await click('.yearly-pdf');
    http
      .expectOne(yearlyUrl(2026))
      .flush(problemBlob('donations/year-not-yet-completed', 'Rok ještě neskončil', 400), { status: 400, statusText: 'Bad Request' });
    await settleBlobFailure();

    expect(text('.yearly-card [role="alert"]')).toBe('Rok ještě neskončil');
    expect(savedFiles).toEqual([]);
    expect(button('.yearly-pdf').disabled).toBe(false);
  });

  it('when the server has no donations of that year to confirm, then the yearly card shows the title of that problem', async () => {
    await respond(twoYearSummary(), twoYearDonations());
    await clickYear('2025');

    await click('.yearly-pdf');
    http
      .expectOne(yearlyUrl(2025))
      .flush(problemBlob('donations/yearly-receipt-not-available', 'Za tento rok nemáme žádný dar', 404), {
        status: 404,
        statusText: 'Not Found',
      });
    await settleBlobFailure();

    expect(text('.yearly-card [role="alert"]')).toBe('Za tento rok nemáme žádný dar');
  });

  it('when the server issues no receipts for the selected year, then the yearly card shows the title of that problem', async () => {
    await respond(twoYearSummary(), twoYearDonations());
    await clickYear('2025');

    await click('.yearly-pdf');
    http
      .expectOne(yearlyUrl(2025))
      .flush(
        problemBlob('donations/receipt-before-first-year', 'Za dary z této doby potvrzení na webu nevystavujeme', 400),
        { status: 400, statusText: 'Bad Request' },
      );
    await settleBlobFailure();

    expect(text('.yearly-card [role="alert"]')).toBe('Za dary z této doby potvrzení na webu nevystavujeme');
    expect(savedFiles).toEqual([]);
  });

  it('when the receipt of a payment is no longer available, then the problem title is shown and the payments are loaded again', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    await click(secondRowButton);
    http
      .expectOne('/api/donations/me/d-3/receipt')
      .flush(problemBlob('donations/receipt-not-available', 'Potvrzení k tomuto daru nelze vystavit', 404), {
        status: 404,
        statusText: 'Not Found',
      });
    await settleBlobFailure();
    const refunded = twoYearDonations();
    refunded.items[1] = donationItem({
      id: 'd-3',
      receivedAt: '2026-01-10',
      amountMinor: 100000,
      status: 'REFUNDED',
      receiptAvailable: false,
    });
    await respond(twoYearSummary(), refunded);

    expect(text('.payments-card [role="alert"]')).toBe('Potvrzení k tomuto daru nelze vystavit');
    expect(text('.payments-card tbody tr:nth-child(2)')).toContain('Vráceno');
    expect(element(secondRowButton)).toBeNull();
  });

  it('when the server issues no receipt for a payment from before the first receipt year, then the problem title is shown and the payments are loaded again', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    await click(thirdRowButton);
    http
      .expectOne('/api/donations/me/d-2/receipt')
      .flush(
        problemBlob('donations/receipt-before-first-year', 'Za dary z této doby potvrzení na webu nevystavujeme', 400),
        { status: 400, statusText: 'Bad Request' },
      );
    await settleBlobFailure();
    await respond(summaryWithReceiptsFrom2026(), donationsWithoutReceiptsBefore2026());

    expect(text('.payments-card [role="alert"]')).toBe('Za dary z této doby potvrzení na webu nevystavujeme');
    expect(element(thirdRowButton)).toBeNull();
    expect(text('.receipts-from')).toContain('od 1. ledna 2026');
    expect(savedFiles).toEqual([]);
  });

  it('when the payments are loaded again after a missing receipt, then the year the donor had chosen stays selected', async () => {
    await respond(twoYearSummary(), twoYearDonations());
    await clickYear('2025');

    await click(secondRowButton);
    http
      .expectOne('/api/donations/me/d-3/receipt')
      .flush(problemBlob('donations/receipt-not-available', 'Potvrzení k tomuto daru nelze vystavit', 404), {
        status: 404,
        statusText: 'Not Found',
      });
    await settleBlobFailure();
    await respond(twoYearSummary(), twoYearDonations());

    expect(text('.year-toggle button.is-active')).toBe('2025');
    expect(text('.yearly-count')).toBe('1 příspěvek v roce 2025');
    expect(text('.yearly-pdf')).toBe('↓ PDF za rok 2025');
  });

  it('when a download fails for any other reason, then a generic message asks to try again and a successful retry clears it', async () => {
    await respond(twoYearSummary(), twoYearDonations());

    await click(secondRowButton);
    http
      .expectOne('/api/donations/me/d-3/receipt')
      .flush(new Blob(['Bad Gateway'], { type: 'text/html' }), { status: 502, statusText: 'Bad Gateway' });
    await settleBlobFailure();

    expect(text('.payments-card [role="alert"]')).toBe('Potvrzení se nepodařilo stáhnout. Zkuste to prosím znovu.');

    await click(secondRowButton);
    http.expectOne('/api/donations/me/d-3/receipt').flush(pdf(), attachment('potvrzeni-o-daru-2026-000017.pdf'));
    await settle();

    expect(element('[role="alert"]')).toBeNull();
    expect(savedFiles).toHaveLength(1);
  });

  it('when the access token expires during a download, then the session is refreshed and the PDF is still saved', async () => {
    await respond(twoYearSummary(), twoYearDonations());
    await clickYear('2025');

    await click('.yearly-pdf');
    http
      .expectOne(yearlyUrl(2025))
      .flush(problemBlob('auth/expired-token', 'Platnost přihlášení vypršela', 401), { status: 401, statusText: 'Unauthorized' });
    await settleBlobFailure();
    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-2'));
    const retried = http.expectOne(yearlyUrl(2025));
    expect(retried.request.headers.get('Authorization')).toBe('Bearer token-2');
    retried.flush(pdf(), attachment('potvrzeni-o-darech-2025.pdf'));
    await settle();

    expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-darech-2025.pdf', href: OBJECT_URL }]);
    expect(element('[role="alert"]')).toBeNull();
  });

  it('when a download is refused because the session has ended, then the donor is sent home to sign in', async () => {
    await respond(twoYearSummary(), twoYearDonations());
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    await click(secondRowButton);
    http
      .expectOne('/api/donations/me/d-3/receipt')
      .flush(problemBlob('auth/unauthenticated', 'Přihlaste se', 401), { status: 401, statusText: 'Unauthorized' });
    await settleBlobFailure();

    expect(element('[role="alert"]')).toBeNull();
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('when the donor has no donations yet, then the cards show zeros and the yearly and payments cards explain how a gift appears', async () => {
    await respond(emptySummary(), emptyDonations());

    expect(texts('.stat-value')).toEqual(['0 Kč', '0', '—']);
    expect(element('.year-toggle')).toBeNull();
    expect(element('.yearly-pdf')).toBeNull();
    expect(text('.yearly-empty')).toBe(
      'Zatím tu nemáme žádný váš dar. Jakmile dorazí platba s vaším variabilním symbolem, objeví se tady. Posíláte trvalým příkazem?',
    );
    expect(element('.payments-card table')).toBeNull();
    expect(text('.payments-empty')).toBe('Zatím tu není žádná platba.');
  });

  it('when the donor with no donations yet follows the standing order link, then the bank accounts card heading takes the focus and the address stays', async () => {
    await respond(emptySummary(), emptyDonations());
    const addressBefore = window.location.href;
    const link = element('.yearly-empty a') as HTMLAnchorElement;
    expect(normalized(link.textContent ?? '')).toBe('Posíláte trvalým příkazem?');
    expect(link.getAttribute('href')).toBe('#bank-accounts-title');

    const follow = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(follow);
    await settle();

    expect(document.activeElement).toBe(element('app-bank-accounts-card h2#bank-accounts-title'));
    expect(follow.defaultPrevented).toBe(true);
    expect(window.location.href).toBe(addressBefore);
  });

  it('when the bank accounts card says a confirmed symbol brought donations, then the summary and the payments load again without the loading line', async () => {
    await respond(emptySummary(), emptyDonations());
    const card = fixture.debugElement.query(By.directive(BankAccountsCard)).componentInstance as BankAccountsCard;

    card.donationsChanged.emit();
    await settle();

    expect(element('.dashboard-loading')).toBeNull();
    expect(element('.stats-grid')).not.toBeNull();
    await respond(twoYearSummary(), twoYearDonations());
    expect(texts('.stat-value')).toEqual(['1 750 Kč', '3', '15. 03. 2026']);
    expect(texts('.payments-card tbody tr')).toHaveLength(twoYearDonations().items.length);
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

  it('when the session has ended, then the donor is sent home to sign in instead of being offered a retry', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    http.expectOne('/api/donations/me').flush(twoYearDonations());
    http.expectOne('/api/donations/me/summary').flush(
      { type: 'https://nfnn.cz/problems/auth/unauthenticated', title: 'Přihlaste se', status: 401 },
      { status: 401, statusText: 'Unauthorized' },
    );
    await settle();

    expect(element('[role="alert"]')).toBeNull();
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('when the session was forgotten while the donations were loading, then the donor is sent home to sign in', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const sessionLost = { type: 'https://nfnn.cz/problems/auth/invalid-refresh-token', title: 'Přihlaste se znovu', status: 401 };
    store.refresh().subscribe({ error: () => undefined });
    http.expectOne('/api/donors/auth/refresh').flush(sessionLost, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/donations/me').flush(twoYearDonations());
    http.expectOne('/api/donations/me/summary').flush(sessionLost, { status: 401, statusText: 'Unauthorized' });
    await settle();

    expect(store.signedIn()).toBe(false);
    expect(element('[role="alert"]')).toBeNull();
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/');
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
