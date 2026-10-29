import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { DonationListResponse, DonationSummaryResponse } from '../../donations/donations-api';
import { BankAccountItem } from '../../donations/bank-accounts-api';
import { bankAccount, symbolOffer } from '../../donations/testing/bank-account-fixtures';
import {
  donationItem,
  emptyDonations,
  emptySummary,
  twoYearDonations,
  twoYearSummary,
} from '../../donations/testing/donation-fixtures';
import { donorsRoutes } from '../donors.routes';
import { BankAccountsCard } from './bank-accounts-card/bank-accounts-card';

const OBJECT_URL = 'blob:http://localhost/receipt';
const BANK_CHECK_URL = '/api/donations/me/bank-check';
const BANK_ACCOUNTS_URL = '/api/donations/me/bank-accounts';
const PASSKEYS_URL = '/api/donors/me/passkeys';
const EARLIER = '2026-10-18T08:05:30Z';
const LATER = '2026-10-18T08:07:10Z';

describe('Given a signed-in donor in the donor area', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let store: AuthStore;
  let savedFiles: { fileName: string; href: string }[];
  let createObjectURL: ReturnType<typeof vi.fn>;
  let bankCheck: TestRequest;
  let areaAccounts: BankAccountItem[];
  let sectionAccountRequests: TestRequest[];

  beforeEach(async () => {
    localStorage.clear();
    areaAccounts = [];
    savedFiles = [];
    createObjectURL = vi.fn(() => OBJECT_URL);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      savedFiles.push({ fileName: this.download, href: this.href });
    });
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'darce', children: donorsRoutes },
          { path: '', children: [] },
        ]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ variableSymbol: '9876543210' })));
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  async function open(url: string): Promise<void> {
    await harness.navigateByUrl(url);
    bankCheck = http.expectOne({ method: 'POST', url: BANK_CHECK_URL });
    const [areaRequest, ...sectionRequests] = http.match({ method: 'GET', url: BANK_ACCOUNTS_URL });
    areaRequest.flush({ items: areaAccounts });
    sectionAccountRequests = sectionRequests;
    await settle();
  }

  async function go(url: string): Promise<void> {
    await harness.navigateByUrl(url);
    await settle();
  }

  async function openBankAccounts(): Promise<void> {
    await open('/darce/ucty');
    flushSectionAccounts([]);
  }

  function flushSectionAccounts(items: BankAccountItem[]): void {
    expect(sectionAccountRequests).toHaveLength(1);
    sectionAccountRequests[0].flush({ items });
  }

  async function respond(
    summary: DonationSummaryResponse,
    list: DonationListResponse,
  ): Promise<void> {
    http.expectOne('/api/donations/me/summary').flush(summary);
    http.expectOne('/api/donations/me').flush(list);
    await settle();
  }

  async function settle(): Promise<void> {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  async function settleBlobFailure(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
  }

  function root(): HTMLElement {
    return harness.fixture.nativeElement as HTMLElement;
  }

  function element(selector: string): HTMLElement | null {
    return root().querySelector(selector);
  }

  function text(selector: string): string {
    return normalized(element(selector)?.textContent ?? '');
  }

  function texts(selector: string): string[] {
    return [...root().querySelectorAll<HTMLElement>(selector)].map((node) =>
      normalized(node.textContent ?? ''),
    );
  }

  function blockOrder(): string[] {
    const blocks = [
      'receipt-ready',
      'last-gift',
      'first-gift',
      'symbol-card',
      'overview-stats',
      'recent-card',
    ];
    return [
      ...root().querySelectorAll<HTMLElement>(blocks.map((name) => `.${name}`).join(', ')),
    ].map((node) => blocks.find((name) => node.classList.contains(name)) ?? '');
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

  function yearRow(year: number): HTMLElement {
    return [...root().querySelectorAll<HTMLElement>('.year-row')].find(
      (row) => normalized(row.querySelector('.year')?.textContent ?? '') === String(year),
    )!;
  }

  function yearRows(): string[][] {
    return [...root().querySelectorAll<HTMLElement>('.year-row')].map((row) =>
      [...row.children].map((cell) => normalized(cell.textContent ?? '')),
    );
  }

  async function downloadYear(year: number): Promise<void> {
    (yearRow(year).querySelector('.yearly-pdf') as HTMLButtonElement).click();
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
    return new Blob(
      [JSON.stringify({ type: `https://nfnn.cz/problems/${type}`, title, detail: '', status })],
      { type: 'application/problem+json' },
    );
  }

  function summaryWithReceiptsFrom2026(): DonationSummaryResponse {
    return { ...twoYearSummary(), receiptsAvailableFrom: 2026 };
  }

  function donationsWithoutReceiptsBefore2026(): DonationListResponse {
    const list = twoYearDonations();
    return {
      ...list,
      items: list.items.map((item) =>
        item.receivedAt < '2026-01-01' ? { ...item, receiptAvailable: false } : item,
      ),
    };
  }

  const yearlyUrl = (year: number): string => `/api/donations/me/receipts/yearly?year=${year}`;
  const yearSection = (year: number): string =>
    `.payments-card section[aria-labelledby="gifts-year-${year}"]`;
  const secondRowButton = `${yearSection(2026)} tbody tr:nth-child(2) .download-btn`;
  const thirdRowButton = `${yearSection(2025)} tbody tr:nth-child(1) .download-btn`;

  describe('when bank accounts carry questions about an older symbol', () => {
    function questions(count: number): BankAccountItem[] {
      return Array.from({ length: count }, (_, index) =>
        bankAccount({ id: `question-${index}`, symbolOffer: symbolOffer() }),
      );
    }

    function badge(container: Element | null): string {
      return normalized(container?.querySelector('.side-nav-badge')?.textContent ?? '');
    }

    function hidden(container: Element | null): string {
      return normalized(container?.querySelector('.visually-hidden')?.textContent ?? '');
    }

    function bankAccountsLink(): HTMLAnchorElement | null {
      return element('nav a[href="/darce/ucty"]') as HTMLAnchorElement | null;
    }

    it('then Bankovní účty in the side panel and the menu button show how many wait for an answer', async () => {
      areaAccounts = [bankAccount(), ...questions(1)];
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      expect(badge(bankAccountsLink())).toBe('1');
      expect(hidden(bankAccountsLink())).toBe('1 otázka čeká na odpověď');
      expect(badge(element('.side-nav-toggle'))).toBe('1');
      expect(hidden(element('.side-nav-toggle'))).toBe('1 otázka čeká na odpověď');
      expect(texts('nav .side-nav-badge')).toHaveLength(1);
    });

    it('then the description takes the Czech plural forms', async () => {
      areaAccounts = questions(2);
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());
      expect(hidden(bankAccountsLink())).toBe('2 otázky čekají na odpověď');
    });

    it('then five questions take the form for many', async () => {
      areaAccounts = questions(5);
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());
      expect(hidden(bankAccountsLink())).toBe('5 otázek čeká na odpověď');
    });

    it('then no badge shows while no account carries a question', async () => {
      areaAccounts = [bankAccount()];
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      expect(element('.side-nav-badge')).toBeNull();
    });

    it('then the bank accounts section keeps the menu button free of it and its own list updates the badge', async () => {
      areaAccounts = questions(1);
      await open('/darce/ucty');
      flushSectionAccounts(questions(1));
      await respond(twoYearSummary(), twoYearDonations());

      expect(badge(bankAccountsLink())).toBe('1');
      expect(element('.side-nav-toggle .side-nav-badge')).toBeNull();

      (
        harness.fixture.debugElement.query(By.directive(BankAccountsCard))
          .componentInstance as BankAccountsCard
      ).reload();
      http.expectOne({ method: 'GET', url: BANK_ACCOUNTS_URL }).flush({ items: [bankAccount()] });
      await settle();

      expect(element('.side-nav-badge')).toBeNull();
    });
  });

  describe('when the area opens', () => {
    it('then it asks the bank for new payments while the donations load', async () => {
      await open('/darce/prehled');

      expect(bankCheck.request.method).toBe('POST');
      expect(bankCheck.request.headers.get('Authorization')).toBe('Bearer token-1');
      await respond(twoYearSummary(), twoYearDonations());
    });

    it('then the address without a section opens the overview', async () => {
      await open('/darce');
      await respond(twoYearSummary(), twoYearDonations());

      expect(TestBed.inject(Router).url).toBe('/darce/prehled');
      expect(text('h1')).toBe('Můj přehled');
    });

    it('then the top bar shows the name of the donor without a greeting and a way back to the home page', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.topbar-donor')).toBe('Jana Nováková');
      const back = element('.topbar a.topbar-home') as HTMLAnchorElement;
      expect(normalized(back.querySelector('.topbar-home-label')?.textContent ?? '')).toBe(
        'Hlavní stránka',
      );
      expect(normalized(back.querySelector('.topbar-home-label-short')?.textContent ?? '')).toBe(
        'Domů',
      );
      expect(back.getAttribute('href')).toBe('/');
    });

    it('then the help line keeps a space before the e-mail address', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.contact-line')).toBe('Máte dotaz k platbě? Napište nám na info@nfnn.cz');
    });

    it('then the donations cannot be loaded, an alert offers to try again and a retry asks for both again and shows them', async () => {
      await open('/darce/prehled');
      http.expectOne('/api/donations/me').flush(twoYearDonations());
      http
        .expectOne('/api/donations/me/summary')
        .flush({ title: 'Chyba' }, { status: 500, statusText: 'Internal Server Error' });
      await settle();

      expect(text('[role="alert"]')).toContain('Přehled darů se nepodařilo načíst.');
      expect(element('.overview-stats')).toBeNull();
      expect(text('.symbol-value')).toBe('9876543210');

      await click('.dashboard-error button');
      expect(text('.dashboard-loading')).toBe('Načítáme vaše dary…');
      await respond(twoYearSummary(), twoYearDonations());

      expect(element('[role="alert"]')).toBeNull();
      expect(texts('.stat-value')).toEqual(['1 750 Kč', '3', '1 500 Kč']);
    });

    it('then a session that has ended sends the donor home to sign in instead of offering a retry', async () => {
      await open('/darce/prehled');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      http.expectOne('/api/donations/me').flush(twoYearDonations());
      http.expectOne('/api/donations/me/summary').flush(
        {
          type: 'https://nfnn.cz/problems/auth/unauthenticated',
          title: 'Přihlaste se',
          status: 401,
        },
        { status: 401, statusText: 'Unauthorized' },
      );
      await settle();

      expect(element('[role="alert"]')).toBeNull();
      expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('then a session forgotten while the donations were loading sends the donor home to sign in', async () => {
      await open('/darce/prehled');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const sessionLost = {
        type: 'https://nfnn.cz/problems/auth/invalid-refresh-token',
        title: 'Přihlaste se znovu',
        status: 401,
      };
      store.refresh().subscribe({ error: () => undefined });
      http
        .expectOne('/api/donors/auth/refresh')
        .flush(sessionLost, { status: 401, statusText: 'Unauthorized' });
      http.expectOne('/api/donations/me').flush(twoYearDonations());
      http
        .expectOne('/api/donations/me/summary')
        .flush(sessionLost, { status: 401, statusText: 'Unauthorized' });
      await settle();

      expect(store.signedIn()).toBe(false);
      expect(element('[role="alert"]')).toBeNull();
      expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('then signing out ends the session and opens the home page', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      button('.topbar-logout').click();
      http
        .expectOne('/api/donors/auth/logout')
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(store.signedIn()).toBe(false);
      expect(navigate).toHaveBeenCalledWith('/');
    });
  });

  describe('when the donor moves between the sections', () => {
    it('then the side panel names every section and marks the open one as the current page', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      const nav = element('nav[aria-label="Můj účet"]')!;
      const links = [...nav.querySelectorAll<HTMLAnchorElement>('a')];
      expect(
        links.map((link) => [normalized(link.textContent ?? ''), link.getAttribute('href')]),
      ).toEqual([
        ['Přehled', '/darce/prehled'],
        ['Moje dary', '/darce/dary'],
        ['Potvrzení o daru', '/darce/potvrzeni'],
        ['Bankovní účty', '/darce/ucty'],
        ['Údaje a zabezpečení', '/darce/udaje'],
      ]);
      expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([
        'page',
        null,
        null,
        null,
        null,
      ]);

      links[2].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await harness.fixture.whenStable();
      await settle();

      expect(TestBed.inject(Router).url).toBe('/darce/potvrzeni');
      expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([
        null,
        null,
        'page',
        null,
        null,
      ]);
      expect(text('.side-nav-toggle')).toBe('Menu účtu');
    });

    it('then every section has one level-one heading that takes the focus', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());
      const headings: string[] = [];

      for (const url of ['/darce/prehled', '/darce/dary', '/darce/potvrzeni', '/darce/udaje']) {
        await go(url);
        if (url === '/darce/udaje') {
          http.expectOne(PASSKEYS_URL).flush({ items: [] });
          await settle();
        }
        expect(root().querySelectorAll('h1')).toHaveLength(1);
        expect(document.activeElement).toBe(element('h1'));
        headings.push(text('h1'));
      }
      await go('/darce/ucty');
      http.expectOne(BANK_ACCOUNTS_URL).flush({ items: [] });
      await settle();
      headings.push(text('h1'));

      expect(headings).toEqual([
        'Můj přehled',
        'Moje dary',
        'Potvrzení o daru',
        'Údaje a zabezpečení',
        'Bankovní účty',
      ]);
    });

    it('then the donations and the bank are not asked again', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      await go('/darce/dary');
      await go('/darce/potvrzeni');
      await go('/darce/prehled');

      http.expectNone('/api/donations/me/summary');
      http.expectNone({ method: 'POST', url: BANK_CHECK_URL });
      expect(texts('.stat-value')).toEqual(['1 750 Kč', '3', '1 500 Kč']);
    });
  });

  describe('when the overview opens', () => {
    it('then the variable symbol can be copied and the donor can give again with it', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.symbol-value')).toBe('9876543210');
      expect(text('.symbol-card app-copy-button button')).toBe('Kopírovat variabilní symbol');
      const giveAgain = element('.symbol-card a.give-again') as HTMLAnchorElement;
      expect(normalized(giveAgain.textContent ?? '')).toBe('Přispět znovu');
      expect(giveAgain.getAttribute('href')).toBe('/#prispet');
    });

    it('then while the donations load a loading line stands where the stat cards go and the symbol stays visible', async () => {
      await open('/darce/prehled');

      expect(text('.dashboard-loading')).toBe('Načítáme vaše dary…');
      expect(element('.overview-stats')).toBeNull();
      expect(text('.symbol-value')).toBe('9876543210');
      expect(text('.symbol-card a.give-again')).toBe('Přispět');

      await respond(twoYearSummary(), twoYearDonations());

      expect(element('.dashboard-loading')).toBeNull();
    });

    it('then one row of stats shows the total, the count and the sum of the current year from the summary', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(texts('.overview-stats dt')).toEqual([
        'Celkem darováno',
        'Počet darů',
        'Darováno v roce 2026',
      ]);
      expect(texts('.overview-stats dd')).toEqual(['1 750 Kč', '3', '1 500 Kč']);
    });

    it('then a current year without a gift shows zero in its stat', async () => {
      const summary = twoYearSummary();
      summary.byYear = summary.byYear.filter((entry) => entry.year !== 2026);
      await open('/darce/prehled');
      await respond(summary, twoYearDonations());

      expect(texts('.overview-stats dd')[2]).toBe('0 Kč');
    });

    it('then the last gift comes first with its date, amount and state, then the symbol, the stats and the recent gifts', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.last-gift h2')).toBe('Poslední dar');
      expect(text('.last-gift-amount')).toBe('500 Kč');
      expect(text('.last-gift-date')).toBe('15. 03. 2026');
      expect(text('.last-gift-status')).toBe('Přijato');
      expect(blockOrder()).toEqual([
        'receipt-ready',
        'last-gift',
        'symbol-card',
        'overview-stats',
        'recent-card',
      ]);
    });

    it('then a refunded last gift says so', async () => {
      const list = twoYearDonations();
      list.items = [donationItem({ id: 'd-5', status: 'REFUNDED', receiptAvailable: false })];
      await open('/darce/prehled');
      await respond(twoYearSummary(), list);

      expect(text('.last-gift-status')).toBe('Vráceno');
    });

    it('then the yearly receipt of the last completed year with a gift is offered for download', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.receipt-ready h2')).toBe('Potvrzení o darech za rok 2025 je připravené');
      expect(text('.receipt-ready-pdf')).toBe('Stáhnout potvrzení za rok 2025 (PDF)');
      await click('.receipt-ready-pdf');
      expect(text('.receipt-ready-pdf')).toBe('Připravujeme PDF…');
      http.expectOne(yearlyUrl(2025)).flush(pdf(), attachment('potvrzeni-o-darech-2025.pdf'));
      await settle();

      expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-darech-2025.pdf', href: OBJECT_URL }]);
    });

    it('then no yearly receipt is offered when the donor gave nothing in the last completed year', async () => {
      const summary = twoYearSummary();
      summary.byYear = summary.byYear.filter((entry) => entry.year !== 2025);
      await open('/darce/prehled');
      await respond(summary, twoYearDonations());

      expect(element('.receipt-ready')).toBeNull();
    });

    it('then no yearly receipt is offered for a year before the first receipt year', async () => {
      await open('/darce/prehled');
      await respond(summaryWithReceiptsFrom2026(), twoYearDonations());

      expect(element('.receipt-ready')).toBeNull();
    });

    it('then a bank account with a question about an older symbol is announced with a link to answer it', async () => {
      areaAccounts = [
        bankAccount(),
        bankAccount({
          id: 'other',
          accountNumber: '19-2000145399/0800',
          symbolOffer: symbolOffer(),
        }),
      ];
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(texts('.overview-question')).toEqual([
        'Máme na vás otázku k platbám z účtu 19-2000145399/0800. Odpovědět',
      ]);
      expect(element('.overview-question a')?.getAttribute('href')).toBe('/darce/ucty');
    });

    it('then no question is announced while no bank account carries one', async () => {
      areaAccounts = [bankAccount()];
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(element('.overview-question')).toBeNull();
    });

    it('then the last gift says how fresh the bank data is and how long a payment takes', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());
      expect(text('.last-gift [role="status"]')).toBe('Kontrolujeme nové platby v bance…');

      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: false },
        { status: 202, statusText: 'Accepted' },
      );
      await settle();

      expect(text('.last-gift [role="status"]')).toBe('Údaje z banky k 18. 10. 2026 10:05');
      expect(text('.last-gift .recent-hint')).toContain(
        'běžný převod z jiné banky do dalšího pracovního dne',
      );
    });

    it('then the last five donations show without receipts and a link leads to all of them', async () => {
      const list = twoYearDonations();
      list.items = [
        ...list.items,
        donationItem({ id: 'd-0', receivedAt: '2025-06-01', amountMinor: 10000 }),
        donationItem({ id: 'd-00', receivedAt: '2025-05-01', amountMinor: 10000 }),
      ];
      await open('/darce/prehled');
      await respond(twoYearSummary(), list);

      expect(text('.recent-card h2')).toBe('Poslední dary');
      expect(texts('.recent-card tbody tr')).toHaveLength(5);
      expect(texts('.recent-card th')).toEqual(['Datum', 'Částka', 'Účel', 'Stav']);
      expect(element('.recent-card .download-btn')).toBeNull();
      const all = element('.recent-card a.recent-all') as HTMLAnchorElement;
      expect(normalized(all.textContent ?? '')).toBe('Všechny dary');
      expect(all.getAttribute('href')).toBe('/darce/dary');
    });

    it('then a donor with no donations yet reads how to send the first gift instead of zeros', async () => {
      await open('/darce/prehled');
      await respond(emptySummary(), emptyDonations());

      expect(element('.overview-stats')).toBeNull();
      expect(element('.last-gift')).toBeNull();
      expect(element('.recent-card')).toBeNull();
      expect(element('.receipt-ready')).toBeNull();
      expect(blockOrder()).toEqual(['first-gift', 'symbol-card']);
      expect(text('.first-gift h2')).toBe('Jak poslat první dar');
      expect(texts('.first-gift-steps li')).toEqual([
        'Pošlete dar na účet nadačního fondu. Číslo účtu a QR kód najdete na hlavní stránce v části Přispět.',
        'Do platby uveďte svůj variabilní symbol 9876543210. QR kód na hlavní stránce ho už obsahuje.',
        'Jakmile platba dorazí, dar se tu objeví sám.',
      ]);
      const links = [...root().querySelectorAll<HTMLAnchorElement>('.first-gift-actions a')];
      expect(
        links.map((link) => [normalized(link.textContent ?? ''), link.getAttribute('href')]),
      ).toEqual([
        ['Zobrazit číslo účtu a QR kód', '/#prispet'],
        ['Posíláte trvalým příkazem?', '/darce/ucty'],
      ]);
      expect(text('.first-gift .recent-hint')).toContain('Okamžitá platba');
      expect(text('.symbol-card a.give-again')).toBe('Přispět');
    });
  });

  describe('when the donations page opens', () => {
    it('then the payments table lists every donation newest first with date, amount, purpose and status', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      const rows = [...root().querySelectorAll<HTMLElement>('.payments-card tbody tr')].map((row) =>
        [...row.querySelectorAll('td')]
          .slice(0, 4)
          .map((cell) => normalized(cell.textContent ?? '')),
      );
      expect(rows).toEqual([
        ['15. 03. 2026', '500 Kč', 'Obecný příspěvek', 'Přijato'],
        ['10. 01. 2026', '1 000 Kč', 'Obecný příspěvek', 'Přijato'],
        ['05. 11. 2025', '250 Kč', 'Obecný příspěvek', 'Přijato'],
        ['20. 08. 2025', '2 000 Kč', 'Obecný příspěvek', 'Vráceno'],
      ]);
    });

    it('then the donations are grouped by year, newest first, each under a heading with the count and the sum from the summary', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      expect(texts('.gift-year-title')).toEqual(['2026', '2025']);
      expect(texts('.gift-year-sum')).toEqual(['2 dary · 1 500 Kč', '1 dar · 250 Kč']);
      expect(
        [...root().querySelectorAll<HTMLElement>('.gift-year')].map(
          (year) => year.querySelectorAll('tbody tr').length,
        ),
      ).toEqual([2, 2]);
      expect(text('#payments-title')).toBe('Všechny dary');
    });

    it('then every year table is named by the heading of its year', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      const tables = [...root().querySelectorAll<HTMLElement>('.payments-card table')];
      expect(tables.map((table) => table.getAttribute('aria-labelledby'))).toEqual([
        'gifts-year-2026',
        'gifts-year-2025',
      ]);
      expect(text('#gifts-year-2026')).toBe('2026');
      expect(element(yearSection(2025))?.getAttribute('aria-labelledby')).toBe('gifts-year-2025');
    });

    it('then a year the API counts as completed offers its yearly receipt and the current year says it comes after the year ends', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text(`${yearSection(2025)} .yearly-pdf`)).toBe('Stáhnout potvrzení za rok 2025 (PDF)');
      expect(element(`${yearSection(2026)} .yearly-pdf`)).toBeNull();
      expect(text(`${yearSection(2026)} .gift-year-note`)).toBe(
        'Roční potvrzení za rok 2026 stáhnete po skončení roku, od 1. ledna 2027.',
      );
    });

    it('then the yearly receipt offered at a year heading is saved', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      await click(`${yearSection(2025)} .yearly-pdf`);
      expect(text(`${yearSection(2025)} .yearly-pdf`)).toBe('Připravujeme PDF…');
      http.expectOne(yearlyUrl(2025)).flush(pdf(), attachment('potvrzeni-o-darech-2025.pdf'));
      await settle();

      expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-darech-2025.pdf', href: OBJECT_URL }]);
    });

    it('then a yearly receipt the server refuses shows the reason on the donations page', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      await click(`${yearSection(2025)} .yearly-pdf`);
      http
        .expectOne(yearlyUrl(2025))
        .flush(problemBlob('donations/yearly-receipt-not-available', 'Za rok 2025 nic', 404), {
          status: 404,
          statusText: 'Not Found',
        });
      await settleBlobFailure();

      expect(text('.payments-card [role="alert"]')).toBe('Za rok 2025 nic');
    });

    it('then a year before the first receipt year offers no yearly receipt at its heading', async () => {
      await open('/darce/dary');
      await respond(summaryWithReceiptsFrom2026(), donationsWithoutReceiptsBefore2026());

      expect(element(`${yearSection(2025)} .yearly-pdf`)).toBeNull();
      expect(element(`${yearSection(2025)} .gift-year-note`)).toBeNull();
    });

    it('then the year comes from what the API says is completed, not from the clock of the device', async () => {
      const summary = { ...twoYearSummary(), yearlyReceiptsAvailableThrough: 2026 };
      await open('/darce/dary');
      await respond(summary, twoYearDonations());

      expect(texts('.yearly-pdf')).toEqual([
        'Stáhnout potvrzení za rok 2026 (PDF)',
        'Stáhnout potvrzení za rok 2025 (PDF)',
      ]);
    });

    it('then every cell names its column so a phone can show the rows as cards', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      const labels = [
        ...root().querySelectorAll<HTMLElement>(`${yearSection(2026)} tbody tr:first-child td`),
      ].map((cell) => cell.dataset['label']);
      expect(labels).toEqual(['Datum', 'Částka', 'Účel', 'Stav', 'Potvrzení']);
    });

    it('then a donation with hellers shows two decimals', async () => {
      const list = twoYearDonations();
      list.items[0] = donationItem({ id: 'd-4', receivedAt: '2026-03-15', amountMinor: 100050 });
      await open('/darce/dary');
      await respond(twoYearSummary(), list);

      expect(text('.payments-card tbody tr:first-child td.amount')).toBe('1 000,50 Kč');
    });

    it('then a donation paired by the sender account carries a tag naming the end of that account', async () => {
      const list = twoYearDonations();
      list.items[0] = donationItem({
        id: 'd-4',
        pairedBy: 'SENDER_ACCOUNT',
        senderAccount: '2900233333/2010',
      });
      list.items[1] = donationItem({
        id: 'd-3',
        pairedBy: 'SENDER_ACCOUNT',
        senderAccount: '19-2000145399/0800',
      });
      await open('/darce/dary');
      await respond(twoYearSummary(), list);

      const tag = element('.payments-card tbody tr:first-child .pairing-tag');
      expect(tag?.hasAttribute('title')).toBe(false);
      expect(normalized(tag?.querySelector('[aria-hidden="true"]')?.textContent ?? '')).toBe(
        'bez symbolu · účet …3333/2010',
      );
      expect(normalized(tag?.querySelector('.visually-hidden')?.textContent ?? '')).toBe(
        'Přiřazeno podle účtu 2900233333/2010, platba přišla bez variabilního symbolu',
      );
      expect(text('.payments-card tbody tr:nth-child(2) .pairing-tag [aria-hidden="true"]')).toBe(
        'bez symbolu · účet …5399/0800',
      );
    });

    it('then a donation paired by a symbol the donor confirmed carries a tag naming that symbol and the end of the account', async () => {
      const list = twoYearDonations();
      list.items[0] = donationItem({
        id: 'd-4',
        pairedBy: 'CONFIRMED_SYMBOL',
        senderAccount: '19-2000145399/0800',
        confirmedSymbol: '6123456789',
      });
      await open('/darce/dary');
      await respond(twoYearSummary(), list);

      const tag = element('.payments-card tbody tr:first-child .pairing-tag');
      const sentence =
        'Přiřazeno podle účtu 19-2000145399/0800 a variabilního symbolu 6123456789, který jste u účtu potvrdili jako svůj';
      expect(tag?.hasAttribute('title')).toBe(false);
      expect(normalized(tag?.querySelector('[aria-hidden="true"]')?.textContent ?? '')).toBe(
        'symbol 6123456789 · účet …5399/0800',
      );
      expect(normalized(tag?.querySelector('.visually-hidden')?.textContent ?? '')).toBe(sentence);
      expect(texts('.pairing-tag')).toHaveLength(1);
    });

    it('then donations paired by the variable symbol or by hand carry no tag', async () => {
      const list = twoYearDonations();
      list.items[0] = donationItem({ id: 'd-4', pairedBy: null, source: 'MANUAL' });
      await open('/darce/dary');
      await respond(twoYearSummary(), list);

      expect(element('.pairing-tag')).toBeNull();
    });

    it('then a note says how often the bank is checked and how long a payment takes to appear', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.bank-hint')).toContain('Okamžitá platba se tu obvykle objeví do minuty');
      expect(text('.bank-hint')).toContain('každou hodinu');
    });

    it('then a donor with no donations yet reads that there is no payment and how a standing order is paired', async () => {
      await open('/darce/dary');
      await respond(emptySummary(), emptyDonations());

      expect(element('.payments-card table')).toBeNull();
      expect(text('.payments-empty')).toBe(
        'Zatím tu není žádná platba. Posíláte trvalým příkazem?',
      );
      expect(element('.payments-empty a')?.getAttribute('href')).toBe('/darce/ucty');
    });

    it('then the bank was checked recently, the time of the bank data shows and the donations are not loaded again', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: false },
        { status: 202, statusText: 'Accepted' },
      );
      await settle();

      expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:05');
      expect(button('.bank-check-btn').disabled).toBe(false);
      http.expectNone('/api/donations/me/summary');
    });

    it('then while the bank is being checked the page says so and loads the donations again once new bank data arrived', async () => {
      vi.useFakeTimers();
      await open('/darce/dary');
      await respond(emptySummary(), emptyDonations());

      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: true },
        { status: 202, statusText: 'Accepted' },
      );
      await settle();

      expect(text('.bank-check-status')).toBe('Kontrolujeme nové platby v bance…');
      expect(button('.bank-check-btn').disabled).toBe(true);

      await vi.advanceTimersByTimeAsync(2000);
      http
        .expectOne({ method: 'GET', url: BANK_CHECK_URL })
        .flush({ bankDataAsOf: EARLIER, checking: true });
      await vi.advanceTimersByTimeAsync(2000);
      http
        .expectOne({ method: 'GET', url: BANK_CHECK_URL })
        .flush({ bankDataAsOf: LATER, checking: false });
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:07');
      expect(button('.bank-check-btn').disabled).toBe(false);
      expect(texts('.payments-card tbody tr')).toHaveLength(twoYearDonations().items.length);
    });

    it('then a check that ends without new bank data does not load the donations again', async () => {
      vi.useFakeTimers();
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: true },
        { status: 202, statusText: 'Accepted' },
      );
      await vi.advanceTimersByTimeAsync(2000);
      http
        .expectOne({ method: 'GET', url: BANK_CHECK_URL })
        .flush({ bankDataAsOf: EARLIER, checking: false });
      await settle();

      http.expectNone('/api/donations/me/summary');
      expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:05');
    });

    it('then pressing Zkontrolovat nové platby asks the bank again and loads the donations again even without new bank data', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());
      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: false },
        { status: 202, statusText: 'Accepted' },
      );
      await settle();

      await click('.bank-check-btn');
      http
        .expectOne({ method: 'POST', url: BANK_CHECK_URL })
        .flush({ bankDataAsOf: EARLIER, checking: false });

      await respond(twoYearSummary(), twoYearDonations());
      expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:05');
    });

    it('then a failed bank check shows no bank time and the donor can try again', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      bankCheck.flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(element('.bank-check-status')).toBeNull();
      expect(button('.bank-check-btn').disabled).toBe(false);
    });

    it('then the receipt of one payment is saved under the name the server gives', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      await click(secondRowButton);
      const request = http.expectOne('/api/donations/me/d-3/receipt');
      expect(request.request.responseType).toBe('blob');
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
      const file = pdf();
      request.flush(file, attachment('potvrzeni-o-daru-2026-000017.pdf'));
      await settle();

      expect(createObjectURL).toHaveBeenCalledWith(file);
      expect(savedFiles).toEqual([
        { fileName: 'potvrzeni-o-daru-2026-000017.pdf', href: OBJECT_URL },
      ]);
      expect(element('[role="alert"]')).toBeNull();
    });

    it('then a refunded payment offers no receipt download and no line says from when receipts are issued', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      const rows = [...root().querySelectorAll<HTMLElement>('.payments-card tbody tr')];
      expect(rows.map((row) => row.querySelector('.download-btn') !== null)).toEqual([
        true,
        true,
        true,
        false,
      ]);
      expect(text(`${yearSection(2025)} tbody tr:nth-child(2) .receipt-note`)).toBe(
        'Vrácený dar potvrzení nemá',
      );
      expect(element('.receipts-from')).toBeNull();
    });

    it('then donations received before the first receipt year offer no download and a line says from when receipts are issued', async () => {
      await open('/darce/dary');
      await respond(summaryWithReceiptsFrom2026(), donationsWithoutReceiptsBefore2026());

      const rows = [...root().querySelectorAll<HTMLElement>('.payments-card tbody tr')];
      expect(rows.map((row) => row.querySelector('.download-btn') !== null)).toEqual([
        true,
        true,
        false,
        false,
      ]);
      expect(
        rows.map((row) => row.querySelector('td.receipt')!.classList.contains('is-empty')),
      ).toEqual([false, false, false, false]);
      expect(texts('.payments-card .receipt-note')).toEqual([
        'Potvrzení vystavujeme od roku 2026',
        'Vrácený dar potvrzení nemá',
      ]);
      expect(text('.payments-card .receipts-from')).toBe(
        'Potvrzení o daru tu vystavujeme za dary přijaté od 1. ledna 2026, u starších darů proto tlačítko „Stáhnout PDF“ chybí.',
      );
    });

    it('then a running download disables its button and says the PDF is being prepared until it arrives', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      await click(secondRowButton);
      expect(button(secondRowButton).disabled).toBe(true);
      expect(text(secondRowButton)).toBe('Připravujeme PDF…');
      expect(text('.payments-card tbody tr:first-child .download-btn')).toBe(
        'Stáhnout PDF, dar z 15. 03. 2026, 500 Kč',
      );

      http
        .expectOne('/api/donations/me/d-3/receipt')
        .flush(pdf(), attachment('potvrzeni-o-daru-2026-000017.pdf'));
      await settle();
      expect(button(secondRowButton).disabled).toBe(false);
      expect(text(secondRowButton)).toBe('Stáhnout PDF, dar z 10. 01. 2026, 1 000 Kč');
    });

    it('then a receipt no longer available shows the problem title and loads the payments again', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      await click(secondRowButton);
      http
        .expectOne('/api/donations/me/d-3/receipt')
        .flush(
          problemBlob(
            'donations/receipt-not-available',
            'Potvrzení k tomuto daru nelze vystavit',
            404,
          ),
          { status: 404, statusText: 'Not Found' },
        );
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

    it('then a payment from before the first receipt year shows the problem title and loads the payments again', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      await click(thirdRowButton);
      http
        .expectOne('/api/donations/me/d-2/receipt')
        .flush(
          problemBlob(
            'donations/receipt-before-first-year',
            'Za dary z této doby potvrzení na webu nevystavujeme',
            400,
          ),
          { status: 400, statusText: 'Bad Request' },
        );
      await settleBlobFailure();
      await respond(summaryWithReceiptsFrom2026(), donationsWithoutReceiptsBefore2026());

      expect(text('.payments-card [role="alert"]')).toBe(
        'Za dary z této doby potvrzení na webu nevystavujeme',
      );
      expect(element(thirdRowButton)).toBeNull();
      expect(text('.receipts-from')).toContain('od 1. ledna 2026');
      expect(savedFiles).toEqual([]);
    });

    it('then a download failing for any other reason asks to try again and a successful retry clears it', async () => {
      const scrolled: Element[] = [];
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value(this: HTMLElement) {
          scrolled.push(this);
        },
      });
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      await click(secondRowButton);
      http
        .expectOne('/api/donations/me/d-3/receipt')
        .flush(new Blob(['Bad Gateway'], { type: 'text/html' }), {
          status: 502,
          statusText: 'Bad Gateway',
        });
      await settleBlobFailure();

      expect(text('.payments-card [role="alert"]')).toBe(
        'Potvrzení se nepodařilo stáhnout. Zkuste to prosím znovu.',
      );
      expect(scrolled).toEqual([element('.payments-card [role="alert"]')]);
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');

      await click(secondRowButton);
      http
        .expectOne('/api/donations/me/d-3/receipt')
        .flush(pdf(), attachment('potvrzeni-o-daru-2026-000017.pdf'));
      await settle();

      expect(element('[role="alert"]')).toBeNull();
      expect(savedFiles).toHaveLength(1);
    });

    it('then a download refused because the session has ended sends the donor home to sign in and back to this page after it', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      await click(secondRowButton);
      http
        .expectOne('/api/donations/me/d-3/receipt')
        .flush(problemBlob('auth/unauthenticated', 'Přihlaste se', 401), {
          status: 401,
          statusText: 'Unauthorized',
        });
      await settleBlobFailure();

      expect(element('[role="alert"]')).toBeNull();
      expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);
      expect(navigate).toHaveBeenCalledWith('/');

      TestBed.inject(LoginDialogService).signedIn();

      expect(navigate).toHaveBeenLastCalledWith('/darce/dary');
    });
  });

  describe('when the receipts page opens', () => {
    it('then every year shows its count, its total and what can be done with its receipt', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      expect(yearRows()).toEqual([
        ['2026', '2 dary', '1 500 Kč', 'Ke stažení od 1. ledna 2027'],
        ['2025', '1 dar', '250 Kč', 'Stáhnout potvrzení za rok 2025 (PDF)'],
      ]);
      expect(element('.yearly-hint')).toBeNull();
    });

    it('then a year with five or more donations uses the plural for many', async () => {
      const summary = twoYearSummary();
      summary.byYear[0] = { year: 2026, count: 5, totalAmountMinor: 150000 };
      await open('/darce/potvrzeni');
      await respond(summary, twoYearDonations());

      expect(yearRows()[0][1]).toBe('5 darů');
    });

    it('then the receipt of a completed year is saved', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      await downloadYear(2025);
      http.expectOne(yearlyUrl(2025)).flush(pdf(), attachment('potvrzeni-o-darech-2025.pdf'));
      await settle();

      expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-darech-2025.pdf', href: OBJECT_URL }]);
    });

    it('then a year before the first receipt year offers no PDF and a line says from which year receipts are issued', async () => {
      await open('/darce/potvrzeni');
      await respond(summaryWithReceiptsFrom2026(), donationsWithoutReceiptsBefore2026());

      expect(yearRow(2025).querySelector('.yearly-pdf')).toBeNull();
      expect(normalized(yearRow(2025).querySelector('.year-note')?.textContent ?? '')).toBe(
        'Za tento rok potvrzení na webu nevystavujeme. Potřebujete ho? Napište nám na info@nfnn.cz.',
      );
      expect(yearRow(2025).querySelector('.year-note a')?.getAttribute('href')).toBe(
        'mailto:info@nfnn.cz',
      );
      expect(text('.yearly-hint')).toBe('Potvrzení za rok tu vystavujeme za dary od roku 2026.');
    });

    it('then a running download disables its button and says the PDF is being prepared until it arrives', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      await downloadYear(2025);
      expect(button('.yearly-pdf').disabled).toBe(true);
      expect(text('.yearly-pdf')).toBe('Připravujeme PDF…');

      http.expectOne(yearlyUrl(2025)).flush(pdf(), attachment('potvrzeni-o-darech-2025.pdf'));
      await settle();
      expect(button('.yearly-pdf').disabled).toBe(false);
      expect(text('.yearly-pdf')).toBe('Stáhnout potvrzení za rok 2025 (PDF)');
    });

    it('then a server saying the year is not completed yet shows the title of that problem', async () => {
      const summary = twoYearSummary();
      summary.yearlyReceiptsAvailableThrough = 2026;
      await open('/darce/potvrzeni');
      await respond(summary, twoYearDonations());

      await downloadYear(2026);
      http
        .expectOne(yearlyUrl(2026))
        .flush(problemBlob('donations/year-not-yet-completed', 'Rok ještě neskončil', 400), {
          status: 400,
          statusText: 'Bad Request',
        });
      await settleBlobFailure();

      expect(text('.yearly-card [role="alert"]')).toBe('Rok ještě neskončil');
      expect(savedFiles).toEqual([]);
    });

    it('then a server with no donations of that year to confirm shows the title of that problem', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      await downloadYear(2025);
      http
        .expectOne(yearlyUrl(2025))
        .flush(
          problemBlob(
            'donations/yearly-receipt-not-available',
            'Za tento rok nemáme žádný dar',
            404,
          ),
          { status: 404, statusText: 'Not Found' },
        );
      await settleBlobFailure();

      expect(text('.yearly-card [role="alert"]')).toBe('Za tento rok nemáme žádný dar');
    });

    it('then a server issuing no receipts for that year shows the title of that problem', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      await downloadYear(2025);
      http
        .expectOne(yearlyUrl(2025))
        .flush(
          problemBlob(
            'donations/receipt-before-first-year',
            'Za dary z této doby potvrzení na webu nevystavujeme',
            400,
          ),
          { status: 400, statusText: 'Bad Request' },
        );
      await settleBlobFailure();

      expect(text('.yearly-card [role="alert"]')).toBe(
        'Za dary z této doby potvrzení na webu nevystavujeme',
      );
      expect(savedFiles).toEqual([]);
    });

    it('then an access token that expires during a download is refreshed and the PDF is still saved', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      await downloadYear(2025);
      http
        .expectOne(yearlyUrl(2025))
        .flush(problemBlob('auth/expired-token', 'Platnost přihlášení vypršela', 401), {
          status: 401,
          statusText: 'Unauthorized',
        });
      await settleBlobFailure();
      http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-2'));
      const retried = http.expectOne(yearlyUrl(2025));
      expect(retried.request.headers.get('Authorization')).toBe('Bearer token-2');
      retried.flush(pdf(), attachment('potvrzeni-o-darech-2025.pdf'));
      await settle();

      expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-darech-2025.pdf', href: OBJECT_URL }]);
      expect(element('[role="alert"]')).toBeNull();
    });

    it('then a line says that the receipt of a single gift is on the donations page', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.single-card h2')).toBe('Potvrzení k jednotlivému daru');
      expect(element('.single-card a')?.getAttribute('href')).toBe('/darce/dary');
    });

    it('then a donor with no donations yet reads how a gift appears, with a link to the bank accounts', async () => {
      await open('/darce/potvrzeni');
      await respond(emptySummary(), emptyDonations());

      expect(element('.year-row')).toBeNull();
      expect(text('.yearly-empty')).toBe(
        'Zatím tu nemáme žádný váš dar. Jakmile dorazí platba s vaším variabilním symbolem, objeví se tady. Posíláte trvalým příkazem?',
      );
      expect(element('.yearly-empty a')?.getAttribute('href')).toBe('/darce/ucty');
    });
  });

  describe('when the bank accounts page opens', () => {
    function card(): BankAccountsCard {
      return harness.fixture.debugElement.query(By.directive(BankAccountsCard))
        .componentInstance as BankAccountsCard;
    }

    it('then the bank accounts card shows with the variable symbol for adding one', async () => {
      await openBankAccounts();
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('app-bank-accounts-card h2')).toBe('Moje bankovní účty');
      expect(text('.page-intro')).toContain('i bez variabilního symbolu');
    });

    it('then new bank data from the check of the area loads the accounts again', async () => {
      vi.useFakeTimers();
      await openBankAccounts();
      await respond(twoYearSummary(), twoYearDonations());

      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: true },
        { status: 202, statusText: 'Accepted' },
      );
      await settle();
      http.expectNone(BANK_ACCOUNTS_URL);
      await vi.advanceTimersByTimeAsync(2000);
      http
        .expectOne({ method: 'GET', url: BANK_CHECK_URL })
        .flush({ bankDataAsOf: LATER, checking: false });
      await settle();
      http.expectOne(BANK_ACCOUNTS_URL).flush({ items: [bankAccount()] });
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('app-bank-accounts-card .account-number')).toBe('2900233333/2010');
    });

    it('then the add account dialog checking the bank with new data loads the donations again', async () => {
      await openBankAccounts();
      await respond(twoYearSummary(), twoYearDonations());
      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: false },
        { status: 202, statusText: 'Accepted' },
      );
      await settle();

      card().bankChecked.emit({ bankDataAsOf: EARLIER, checking: false });
      await settle();
      http.expectNone('/api/donations/me/summary');

      card().bankChecked.emit({ bankDataAsOf: LATER, checking: false });
      await respond(twoYearSummary(), twoYearDonations());

      await go('/darce/dary');
      expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:07');
    });

    it('then a confirmed symbol bringing donations loads the summary and the payments again without the loading line', async () => {
      await openBankAccounts();
      await respond(emptySummary(), emptyDonations());

      card().donationsChanged.emit();
      await settle();
      await respond(twoYearSummary(), twoYearDonations());

      await go('/darce/prehled');
      expect(element('.dashboard-loading')).toBeNull();
      expect(texts('.stat-value')).toEqual(['1 750 Kč', '3', '1 500 Kč']);
    });
  });

  describe('when the details page opens', () => {
    it('then the details on the receipt and one card for sign-in and security show, without connected applications for a donor', async () => {
      await open('/darce/udaje');
      http.expectOne(PASSKEYS_URL).flush({ items: [] });
      await respond(twoYearSummary(), twoYearDonations());

      expect(texts('h2')).toEqual(['Údaje na potvrzení o daru', 'Přihlášení a zabezpečení']);
      expect(texts('app-account-card .account-row dt')).toEqual([
        'E-mail',
        'Heslo',
        'Dvoufaktorové ověření',
        'Přístupové klíče',
      ]);
      expect(element('app-connected-apps-card')).toBeNull();
      http.expectNone('/api/donors/me/connections');
    });
  });
});
