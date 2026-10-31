import type { MockInstance } from 'vitest';
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
import { AdminAccessRefusal } from '../../../core/auth/admin-access-refusal';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { DonationListResponse, DonationSummaryResponse } from '../../donations/donations-api';
import { PaymentQrResponse } from '../../donations/payment-qr-api';
import { checkerboard } from '../../../shared/ui/qr-code/testing/qr-matrices';
import { BankAccountItem } from '../../donations/bank-accounts-api';
import { bankAccount, symbolOffer } from '../../donations/testing/bank-account-fixtures';
import {
  accountVerificationItem,
  donationItem,
  emptyDonations,
  emptySummary,
  twoYearDonations,
  twoYearSummary,
} from '../../donations/testing/donation-fixtures';
import { IssuedReceipt, ReceiptSubject } from '../../donations/receipt-pdf/frozen-receipt';
import { ReceiptStyleRefused } from '../../donations/receipt-pdf/receipt-style';
import { PdfDelivery } from '../../donations/receipt-pdf/pdf-delivery';
import { RECEIPT_PDF_ENVIRONMENT } from '../../donations/receipt-pdf/receipt-pdf';
import { ReceiptRestart } from '../../donations/receipt-pdf/receipt-restart';
import { FakeReceiptPdfEnvironment } from '../../donations/receipt-pdf/testing/fake-receipt-worker';
import {
  frozenCase,
  SINGLE_PERSON_CS,
  YEARLY_120,
  YEARLY_ONE,
} from '../../donations/receipt-pdf/testing/receipt-fixtures';
import { donorsRoutes } from '../donors.routes';
import { BankAccountsCard } from './bank-accounts-card/bank-accounts-card';

const OBJECT_URL = 'blob:http://localhost/receipt';
const RECEIPTS_URL = '/api/donations/me/receipts';
const BANK_CHECK_URL = '/api/donations/me/bank-check';
const BANK_ACCOUNTS_URL = '/api/donations/me/bank-accounts';
const PASSKEYS_URL = '/api/donors/me/passkeys';
const PAYMENT_QR_URL = '/api/donations/payment-qr';
const EARLIER = '2026-10-18T08:05:30Z';
const LATER = '2026-10-18T08:07:10Z';

const PAYMENT_QR_URL_MATCH = (request: { url: string }): boolean => request.url === PAYMENT_QR_URL;

function paymentQr(request: TestRequest): PaymentQrResponse {
  const amount = request.request.params.get('amount') ?? '500';
  return {
    spayd: `SPD*1.0*ACC:CZ2620100000005544332217*AM:${amount}.00*CC:CZK`,
    qrCode: checkerboard(25),
    bankAccount: {
      accountNumber: '5544332217/2010',
      iban: 'CZ2620100000005544332217',
      recipientName: 'Nadační fond Nová naděje',
    },
  };
}

describe('Given a signed-in donor in the donor area', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let store: AuthStore;
  let savedFiles: { fileName: string; href: string }[];
  let createObjectURL: ReturnType<typeof vi.fn>;
  let bankCheck: TestRequest;
  let areaAccounts: BankAccountItem[];
  let sectionAccountRequests: TestRequest[];
  let qrRequests: string[];
  let receiptEnvironment: FakeReceiptPdfEnvironment;

  beforeEach(async () => {
    receiptEnvironment = new FakeReceiptPdfEnvironment();
    receiptEnvironment.autoDraw = true;
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
        { provide: RECEIPT_PDF_ENVIRONMENT, useValue: receiptEnvironment },
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
    for (let round = 0; round < 3; round++) {
      http.match(PAYMENT_QR_URL_MATCH).forEach((request) => request.flush(paymentQr(request)));
    }
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
    if (url.startsWith('/darce/prehled')) {
      qrRequests = await answerPaymentQr();
    }
  }

  async function answerPaymentQr(): Promise<string[]> {
    const asked: string[] = [];
    for (let round = 0; round < 3; round++) {
      const requests = http.match(PAYMENT_QR_URL_MATCH);
      if (requests.length === 0) {
        break;
      }
      for (const request of requests) {
        asked.push(request.request.urlWithParams);
        request.flush(paymentQr(request));
      }
      await settle();
    }
    return asked;
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
      'send-gift',
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

  function issued(receipt: IssuedReceipt['receipt']): IssuedReceipt {
    return {
      id: `r-${receipt.number}`,
      status: 'ACTIVE',
      kind: receipt.kind,
      number: receipt.number,
      donationId: receipt.kind === 'SINGLE' ? 'd-1' : null,
      year: receipt.year,
      issuedAt: '2027-01-15T09:30:00Z',
      supersededAt: null,
      receipt,
    };
  }

  function issuedYearly(year: number): IssuedReceipt {
    return issued({ ...frozenCase(YEARLY_ONE), year, number: `${year + 1}-000001` });
  }

  function issuedSingle(number: string): IssuedReceipt {
    return issued({ ...frozenCase(SINGLE_PERSON_CS), number });
  }

  function receiptRequest(subject: ReceiptSubject): TestRequest {
    const request = http.expectOne({ method: 'POST', url: RECEIPTS_URL });
    expect(request.request.body).toEqual(subject);
    return request;
  }

  function problemBody(type: string, title: string, status: number): object {
    return { type: `https://nfnn.cz/problems/${type}`, title, detail: '', status };
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

  function expectMissingGiftIn(container: string): void {
    const block = `${container} .missing-gift`;
    expect(text(`${block} h3`)).toBe('Poslali jste dar a nevidíte ho?');
    expect(text(`${block} .missing-gift-text`)).toBe(
      'Platbu bez vašeho variabilního symbolu, s jiným symbolem nebo z doby před založením účtu vám zatím přiřadit neumíme. ' +
        'Ověřte účet, ze kterého jste platili, platbou 1 Kč a dřívější dary z něj vám obvykle přiřadíme také.',
    );
    const link = element(`${block} a`) as HTMLAnchorElement;
    expect(normalized(link.textContent ?? '')).toBe('Přidat účet, ze kterého jste platili');
    expect(link.getAttribute('href')).toBe('/darce/ucty?pridat=ucet');
  }

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

  describe('when the administration sent the donor here', () => {
    it('then a donor without the role reads that the account has no administration and whom to ask', async () => {
      TestBed.inject(AdminAccessRefusal).refuse('not-administrator');
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.admin-refusal')).toBe(
        'Tento účet nemá přístup do správy. Pokud ho potřebujete, požádejte jiného správce, aby vám ho přidělil.',
      );
      expect(element('.admin-refusal')?.closest('[role="status"]')).not.toBeNull();
    });

    it('then an administrator without the second factor reads how to open the administration, with a link to turn it on', async () => {
      TestBed.inject(AdminAccessRefusal).refuse('second-factor');
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.admin-refusal')).toBe(
        'Správa se vám otevře, až se přihlásíte přístupovým klíčem nebo kódem z aplikace. Kód z aplikace si zapnete v části Údaje a zabezpečení.',
      );
      expect(element('.admin-refusal a')?.getAttribute('href')).toBe('/darce/udaje');
    });

    it('then the sentence is gone once the donor leaves the overview', async () => {
      TestBed.inject(AdminAccessRefusal).refuse('not-administrator');
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      await harness.navigateByUrl('/darce/dary');

      expect(TestBed.inject(AdminAccessRefusal).reason()).toBeNull();
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
      expect(text('.send-gift h2')).toBe('Poslat dar');

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

  describe('when the donor moves between the sections after the check of the area ended', () => {
    async function openAfterAreaCheck(url: string): Promise<void> {
      vi.useFakeTimers();
      await open(url);
      await respond(twoYearSummary(), twoYearDonations());
      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: false },
        { status: 202, statusText: 'Accepted' },
      );
      await settle();
      await respond(twoYearSummary(), twoYearDonations());
    }

    async function checkedOnOpening(url: string): Promise<void> {
      await go(url);
      await answerPaymentQr();
      const check = http.expectOne({ method: 'POST', url: BANK_CHECK_URL });
      expect(check.request.headers.get('Authorization')).toBe('Bearer token-1');
      check.flush({ bankDataAsOf: LATER, checking: false });
      await settle();
      await respond(twoYearSummary(), twoYearDonations());
    }

    it('and opens Přehled more than half a minute later, then the bank is asked again and the time of the new bank data shows', async () => {
      await openAfterAreaCheck('/darce/dary');
      await vi.advanceTimersByTimeAsync(31_000);

      await checkedOnOpening('/darce/prehled');

      expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:07');
    });

    it('and opens Moje dary more than half a minute later, then the bank is asked again and the donations load again', async () => {
      await openAfterAreaCheck('/darce/prehled');
      await vi.advanceTimersByTimeAsync(31_000);

      await checkedOnOpening('/darce/dary');

      expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:07');
      expect(texts('.payments-card tbody tr')).toHaveLength(twoYearDonations().items.length);
    });

    it('and opens Přehled within half a minute, then the bank is not asked again', async () => {
      await openAfterAreaCheck('/darce/dary');
      await vi.advanceTimersByTimeAsync(29_000);

      await go('/darce/prehled');
      await answerPaymentQr();

      http.expectNone({ method: 'POST', url: BANK_CHECK_URL });
      http.expectNone('/api/donations/me/summary');
    });

    it('and opens Potvrzení o daru more than half a minute later, then the bank is not asked again', async () => {
      await openAfterAreaCheck('/darce/prehled');
      await vi.advanceTimersByTimeAsync(31_000);

      await go('/darce/potvrzeni');

      http.expectNone({ method: 'POST', url: BANK_CHECK_URL });
    });

    it('and a check started on opening a section ended, then the next half minute starts no other one', async () => {
      await openAfterAreaCheck('/darce/dary');
      await vi.advanceTimersByTimeAsync(31_000);
      await checkedOnOpening('/darce/prehled');
      await vi.advanceTimersByTimeAsync(20_000);

      await go('/darce/dary');

      http.expectNone({ method: 'POST', url: BANK_CHECK_URL });
    });
  });

  describe('when the overview opens', () => {
    it('then an amount chosen in the card Poslat dar stays chosen after the donor leaves the overview and comes back', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());
      [...root().querySelectorAll<HTMLButtonElement>('.send-gift .amount-option')][0].click();
      await settle();
      await answerPaymentQr();

      await go('/darce/dary');
      await go('/darce/prehled');
      const asked = await answerPaymentQr();

      expect(asked[0]).toBe(`${PAYMENT_QR_URL}?amount=1000&variableSymbol=9876543210`);
      const thousand = [
        ...root().querySelectorAll<HTMLButtonElement>('.send-gift .amount-option'),
      ][0];
      expect(thousand.getAttribute('aria-pressed')).toBe('true');
      expect(texts('.send-gift .bank-value')[1]).toBe('1 000 Kč');
    });

    it('then the standing order guide stands in the card Poslat dar right after the bank details and before the QR code', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      const guide = element('.send-gift app-standing-order') as HTMLElement;
      expect(element('.send-gift .bank')!.compareDocumentPosition(guide)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(guide.compareDocumentPosition(element('.send-gift .qr')!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it('then a card Poslat dar offers the amounts, the account, the variable symbol and the IBAN with copy buttons and a QR carrying the symbol', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.send-gift h2')).toBe('Poslat dar');
      expect(text('.send-gift .send-gift-lead')).toBe(
        'Variabilní symbol je v údajích i v QR kódu už vyplněný. Uveďte ho u každé platby, dar se tak přiřadí k vašemu účtu a objeví se v tomto přehledu.',
      );
      expect(texts('.send-gift .amount-option')).toEqual([
        '1 000 Kč',
        '500 Kč',
        '100 Kč',
        'Jiná částka',
      ]);
      expect(texts('.send-gift .bank-key')).toEqual([
        'Číslo účtu',
        'Částka',
        'Variabilní symbol',
        'IBAN',
      ]);
      expect(texts('.send-gift .bank-value')).toEqual([
        '5544332217/2010',
        '500 Kč',
        '9876543210',
        'CZ26 2010 0000 0055 4433 2217',
      ]);
      expect(texts('.send-gift .bank-row app-copy-button button')).toEqual([
        'Kopírovat číslo účtu',
        'Kopírovat částku',
        'Kopírovat variabilní symbol',
        'Kopírovat IBAN',
      ]);
      expect(element('.send-gift app-qr-code')).not.toBeNull();
      expect(text('.send-gift .qr-save')).toBe('Uložit QR kód');
      expect(qrRequests[0]).toBe(`${PAYMENT_QR_URL}?amount=500&variableSymbol=9876543210`);
      expect(qrRequests.every((asked) => asked.includes('variableSymbol=9876543210'))).toBe(true);
    });

    it('then choosing another amount there shows that amount in the bank details at once', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      const thousand = [
        ...root().querySelectorAll<HTMLButtonElement>('.send-gift .amount-option'),
      ][0];
      thousand.click();
      await settle();

      expect(thousand.getAttribute('aria-pressed')).toBe('true');
      expect(texts('.send-gift .bank-value')[1]).toBe('1 000 Kč');
    });

    it('then the standing order guide in the card takes the account from the same answer and asks for nothing more', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      await click('.send-gift app-standing-order .standing-toggle');

      expect(texts('.send-gift .standing-details dd .standing-value').slice(0, 2)).toEqual([
        '5544332217/2010',
        '9876543210',
      ]);
      http.expectNone(PAYMENT_QR_URL_MATCH);
      expect(qrRequests.some((asked) => !asked.includes('variableSymbol'))).toBe(false);
    });

    it('then the standing order guide in the card names the amount chosen there', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      [...root().querySelectorAll<HTMLButtonElement>('.send-gift .amount-option')][0].click();
      await settle();
      await answerPaymentQr();
      await click('.send-gift app-standing-order .standing-toggle');

      expect(texts('.send-gift .standing-details dd .standing-value')[2]).toBe(
        '1 000 Kč, nebo jiná, kterou chcete posílat',
      );
    });

    it('then no link on the overview sends the donor to the home page for the bank details', async () => {
      await open('/darce/prehled');
      await respond(emptySummary(), emptyDonations());

      expect(element('a[href="/#prispet"]')).toBeNull();
    });

    it('then while the donations load a loading line stands where the stat cards go and the card Poslat dar is ready', async () => {
      await open('/darce/prehled');

      expect(text('.dashboard-loading')).toBe('Načítáme vaše dary…');
      expect(element('.overview-stats')).toBeNull();
      expect(text('.send-gift h2')).toBe('Poslat dar');

      await respond(twoYearSummary(), twoYearDonations());

      expect(element('.dashboard-loading')).toBeNull();
      http.expectNone(PAYMENT_QR_URL_MATCH);
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

    it('then the count of gifts names account verifications apart while their amounts stay in the sums', async () => {
      const list = twoYearDonations();
      list.items = [accountVerificationItem({ receivedAt: '2026-03-20' }), ...list.items];
      const summary = twoYearSummary();
      summary.count = 4;
      summary.totalAmountMinor = 175100;
      summary.byYear[0] = { year: 2026, count: 3, totalAmountMinor: 150100 };
      await open('/darce/prehled');
      await respond(summary, list);

      expect(texts('.overview-stats dd')).toEqual(['1 751 Kč', '3 a ověření účtu', '1 501 Kč']);
    });

    it('then a current year without a gift shows zero in its stat', async () => {
      const summary = twoYearSummary();
      summary.byYear = summary.byYear.filter((entry) => entry.year !== 2026);
      await open('/darce/prehled');
      await respond(summary, twoYearDonations());

      expect(texts('.overview-stats dd')[2]).toBe('0 Kč');
    });

    it('then the last gift comes first with its date, amount and state, then the card Poslat dar, the stats and the recent gifts', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.last-gift h2')).toBe('Poslední dar');
      expect(text('.last-gift-amount')).toBe('500 Kč');
      expect(text('.last-gift-date')).toBe('15. 03. 2026');
      expect(text('.last-gift-status')).toBe('Přijato');
      expect(blockOrder()).toEqual([
        'receipt-ready',
        'last-gift',
        'send-gift',
        'overview-stats',
        'recent-card',
      ]);
    });

    it('then a payment that verified an account never becomes the last gift: the newest gift does', async () => {
      const list = twoYearDonations();
      list.items = [accountVerificationItem({ receivedAt: '2026-03-20' }), ...list.items];
      await open('/darce/prehled');
      await respond(twoYearSummary(), list);

      expect(text('.last-gift-amount')).toBe('500 Kč');
      expect(text('.last-gift-date')).toBe('15. 03. 2026');
      expect(texts('.recent-card tbody tr td:nth-child(3)')[0]).toBe('Ověření účtu');
    });

    it('then a donor whose only payment verified an account reads how to send the first gift', async () => {
      const list = emptyDonations();
      list.items = [accountVerificationItem()];
      await open('/darce/prehled');
      await respond(emptySummary(), list);

      expect(element('.last-gift')).toBeNull();
      expect(element('.recent-card')).toBeNull();
      expect(text('.first-gift h2')).toBe('Jak poslat první dar');
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
      expect(text('.receipt-ready .receipt-saved')).toBe('');
      await click('.receipt-ready-pdf');
      expect(text('.receipt-ready-pdf')).toBe('Připravujeme PDF…');
      receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
      await settle();

      expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-darech-2025.pdf', href: OBJECT_URL }]);
      expect(text('.receipt-ready .receipt-saved')).toBe(
        'Potvrzení potvrzeni-o-darech-2025.pdf je stažené. Najdete ho ve stažených souborech.',
      );
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
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.last-gift [role="status"]')).toBe('Údaje z banky k 18. 10. 2026 10:05');
      expect(text('.last-gift .recent-hint')).toContain(
        'běžný převod z jiné banky do dalšího pracovního dne',
      );
    });

    it('then a donor waiting for the first gift sees it replace Jak poslat první dar as soon as the check of the area ends', async () => {
      await open('/darce/prehled');
      await respond(emptySummary(), emptyDonations());
      expect(text('.first-gift h2')).toBe('Jak poslat první dar');

      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: false },
        { status: 202, statusText: 'Accepted' },
      );
      await respond(twoYearSummary(), twoYearDonations());

      expect(element('.first-gift')).toBeNull();
      expect(text('.last-gift .last-gift-amount')).toBe('500 Kč');
    });

    it('then the donor waiting for the first gift can check for new payments from the overview and reads the outcome', async () => {
      await open('/darce/prehled');
      await respond(emptySummary(), emptyDonations());
      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: false },
        { status: 202, statusText: 'Accepted' },
      );
      await respond(emptySummary(), emptyDonations());

      await click('.first-gift .bank-check-btn');
      expect(text('.first-gift .bank-check-status')).toBe('Kontrolujeme nové platby v bance…');
      http
        .expectOne({ method: 'POST', url: BANK_CHECK_URL })
        .flush({ bankDataAsOf: EARLIER, checking: false });
      await respond(emptySummary(), emptyDonations());

      expect(text('.first-gift .bank-check-status')).toBe(
        'Žádný nový dar zatím nepřišel. Banky se ptáme nejvýš jednou za 30 sekund, zkuste to proto za chvíli znovu. Údaje z banky k 18. 10. 2026 10:05',
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
      expect(blockOrder()).toEqual(['first-gift', 'send-gift']);
      expect(text('.first-gift h2')).toBe('Jak poslat první dar');
      expect(texts('.first-gift-steps li')).toEqual([
        'Zvolte částku v kartě Poslat dar níže a pošlete dar na účet nadačního fondu, převodem nebo QR kódem.',
        'Do platby uveďte svůj variabilní symbol 9876543210. Údaje i QR kód v kartě Poslat dar ho už obsahují.',
        'Jakmile platba dorazí, dar se tu objeví sám.',
      ]);
      expect(element('.first-gift-steps a')).toBeNull();
      expect(text('.send-gift app-standing-order .standing-toggle')).toBe(
        'Jak nastavit trvalý příkaz',
      );
      expect(text('.first-gift .recent-hint')).toContain('Okamžitá platba');
    });

    it('then a donor with no donations yet who sent a gift without the symbol finds the way to add the account it came from', async () => {
      await open('/darce/prehled');
      await respond(emptySummary(), emptyDonations());

      expectMissingGiftIn('.first-gift');
      expect(element('.send-gift .missing-gift')).toBeNull();
      const card = element('.first-gift')!;
      const order = [...card.querySelectorAll('h2, .missing-gift, .first-gift-steps')].map(
        (node) => node.className || node.tagName,
      );
      expect(order).toEqual([
        'ui-card__title ui-card__title--large',
        'missing-gift',
        'first-gift-steps',
      ]);
    });

    it('then a donor with gifts can still open the standing order guide in the card Poslat dar', async () => {
      await open('/darce/prehled');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.send-gift app-standing-order .standing-toggle')).toBe(
        'Jak nastavit trvalý příkaz',
      );
      expect(element('.missing-gift')).toBeNull();
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

    it('then one plain line says which receipt can be downloaded when and that only one kind goes into the tax return', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.payments-card .gifts-tax-note')).toBe(
        'Potvrzení k jednotlivým darům stáhnete hned, roční potvrzení za celý rok od 1. ledna dalšího roku a do daňového přiznání přiložíte buď jednotlivá, nebo roční, ne obojí, protože roční obsahuje všechny dary roku.',
      );
    });

    it('then a donor without donations reads no line about the tax return', async () => {
      await open('/darce/dary');
      await respond(emptySummary(), emptyDonations());

      expect(element('.gifts-tax-note')).toBeNull();
    });

    it('then an account verification is named apart from the gifts in the line of its year while its amount stays in the sum', async () => {
      const list = twoYearDonations();
      list.items = [accountVerificationItem({ receivedAt: '2026-03-20' }), ...list.items];
      const summary = twoYearSummary();
      summary.byYear[0] = { year: 2026, count: 3, totalAmountMinor: 150100 };
      await open('/darce/dary');
      await respond(summary, list);

      expect(texts('.gift-year-sum')).toEqual([
        '2 dary a ověření účtu · 1 501 Kč',
        '1 dar · 250 Kč',
      ]);
    });

    it('then two account verifications in a year are counted as such', async () => {
      const list = twoYearDonations();
      list.items = [
        accountVerificationItem({ id: 'v-1', receivedAt: '2026-03-20' }),
        accountVerificationItem({ id: 'v-2', receivedAt: '2026-03-18' }),
        ...list.items,
      ];
      const summary = twoYearSummary();
      summary.byYear[0] = { year: 2026, count: 4, totalAmountMinor: 150200 };
      await open('/darce/dary');
      await respond(summary, list);

      expect(texts('.gift-year-sum')[0]).toBe('2 dary a 2 ověření účtu · 1 502 Kč');
    });

    it('then a year with only an account verification names just that', async () => {
      const list = {
        ...emptyDonations(),
        items: [accountVerificationItem({ receivedAt: '2026-10-30' })],
      };
      const summary = {
        ...emptySummary(),
        count: 1,
        totalAmountMinor: 100,
        byYear: [{ year: 2026, count: 1, totalAmountMinor: 100 }],
      };
      await open('/darce/dary');
      await respond(summary, list);

      expect(texts('.gift-year-sum')).toEqual(['Ověření účtu · 1 Kč']);
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
      receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
      await settle();

      expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-darech-2025.pdf', href: OBJECT_URL }]);
      expect(text(`${yearSection(2025)} .gift-year-head .receipt-saved`)).toBe(
        'Potvrzení potvrzeni-o-darech-2025.pdf je stažené. Najdete ho ve stažených souborech.',
      );
    });

    it('then a single receipt started while the yearly one is drawn keeps its own line, and neither takes the other one away', async () => {
      receiptEnvironment.autoDraw = false;
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());
      const yearlyLine = `${yearSection(2025)} .gift-year-head .receipt-saved`;
      const singleLine = `${yearSection(2026)} tbody tr:nth-child(2) .receipt-saved`;

      await click(`${yearSection(2025)} .yearly-pdf`);
      receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
      await settle();
      const yearly = receiptEnvironment.last();
      yearly.say({ kind: 'ready' });
      yearly.say({ kind: 'page', page: 1 });
      await settle();
      await click(secondRowButton);

      expect(text(yearlyLine)).toBe('Vytváříme PDF, strana 1…');
      expect(text(singleLine)).toBe('Připravujeme údaje potvrzení…');
      receiptRequest({ donationId: 'd-3' }).flush(issuedSingle('2026-000017'));
      await settle();
      receiptEnvironment.last().drawAll();
      await settle();

      expect(text(singleLine)).toBe(
        'Potvrzení potvrzeni-o-daru-2026-000017.pdf je stažené. Najdete ho ve stažených souborech.',
      );
      expect(text(yearlyLine)).toBe('Vytváříme PDF, strana 1…');
      yearly.drawAll();
      await settle();
      expect(text(yearlyLine)).toBe(
        'Potvrzení potvrzeni-o-darech-2025.pdf je stažené. Najdete ho ve stažených souborech.',
      );
    });

    it('then on an iPhone the receipt of one payment is opened by a second tap on the button of its row', async () => {
      vi.spyOn(PdfDelivery.prototype, 'needsSecondTap').mockReturnValue(true);
      const share = vi.spyOn(PdfDelivery.prototype, 'share').mockResolvedValue('shared');
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      await click(secondRowButton);
      receiptRequest({ donationId: 'd-3' }).flush(issuedSingle('2026-000017'));
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(text(secondRowButton)).toBe('Otevřít PDF, dar z 10. 01. 2026, 1 000 Kč');
      expect(text(`${yearSection(2026)} tbody tr:nth-child(2) .receipt-saved`)).toBe(
        'Potvrzení potvrzeni-o-daru-2026-000017.pdf je připravené. Otevřete ho tlačítkem Otevřít PDF.',
      );
      expect(document.activeElement).toBe(element(secondRowButton));
      await click(secondRowButton);
      await settleBlobFailure();

      http.expectNone({ method: 'POST', url: RECEIPTS_URL });
      expect(share).toHaveBeenCalledTimes(1);
      expect(text(secondRowButton)).toBe('Stáhnout PDF, dar z 10. 01. 2026, 1 000 Kč');
    });

    it('then a yearly receipt the server refuses shows the reason on the donations page', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      await click(`${yearSection(2025)} .yearly-pdf`);
      receiptRequest({ year: 2025 }).flush(
        problemBody('donations/yearly-receipt-not-available', 'Za rok 2025 nic', 404),
        {
          status: 404,
          statusText: 'Not Found',
        },
      );
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

    it('then a donor with no donations yet reads that there is no payment, finds the way to add the account of a missing gift and the standing order guide', async () => {
      await open('/darce/dary');
      await respond(emptySummary(), emptyDonations());

      expect(element('.payments-card table')).toBeNull();
      expect(text('.payments-empty')).toBe('Zatím tu není žádná platba.');
      expectMissingGiftIn('.payments-card');
      expect(text('.payments-card app-standing-order .standing-toggle')).toBe(
        'Jak nastavit trvalý příkaz',
      );
    });

    it('then a donor with gifts can still open the standing order guide and is not asked about a missing gift', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.payments-card app-standing-order .standing-toggle')).toBe(
        'Jak nastavit trvalý příkaz',
      );
      expect(element('.missing-gift')).toBeNull();
    });

    it('then the bank was checked recently, the donations load again when the check ends and the time of the bank data shows without an outcome', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: false },
        { status: 202, statusText: 'Accepted' },
      );
      await settle();
      expect(text('.bank-check-status')).toBe('Kontrolujeme nové platby v bance…');
      await respond(twoYearSummary(), twoYearDonations());

      expect(element('.bank-check-status')?.getAttribute('role')).toBe('status');
      expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:05');
      expect(button('.bank-check-btn').disabled).toBe(false);
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

    it('then a check that ends without new bank data still loads the donations again, so a gift imported meanwhile shows', async () => {
      vi.useFakeTimers();
      await open('/darce/dary');
      await respond(emptySummary(), emptyDonations());

      bankCheck.flush(
        { bankDataAsOf: EARLIER, checking: true },
        { status: 202, statusText: 'Accepted' },
      );
      await vi.advanceTimersByTimeAsync(2000);
      http
        .expectOne({ method: 'GET', url: BANK_CHECK_URL })
        .flush({ bankDataAsOf: EARLIER, checking: false });
      await respond(twoYearSummary(), twoYearDonations());

      expect(texts('.payments-card tbody tr')).toHaveLength(twoYearDonations().items.length);
      expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:05');
    });

    describe('when the donor presses Zkontrolovat nové platby', () => {
      async function pressAfterAreaCheck(list = twoYearDonations()): Promise<void> {
        await open('/darce/dary');
        await respond(twoYearSummary(), list);
        bankCheck.flush(
          { bankDataAsOf: EARLIER, checking: false },
          { status: 202, statusText: 'Accepted' },
        );
        await settle();
        await respond(twoYearSummary(), list);
        await click('.bank-check-btn');
      }

      it('then the bank is asked again, the page says so until the donations are loaded again, and then that no gift is new', async () => {
        await pressAfterAreaCheck();
        expect(text('.bank-check-status')).toBe('Kontrolujeme nové platby v bance…');
        expect(button('.bank-check-btn').disabled).toBe(true);

        http
          .expectOne({ method: 'POST', url: BANK_CHECK_URL })
          .flush({ bankDataAsOf: EARLIER, checking: false });
        await settle();
        expect(text('.bank-check-status')).toBe('Kontrolujeme nové platby v bance…');
        await respond(twoYearSummary(), twoYearDonations());

        expect(text('.bank-check-status')).toBe(
          'Žádný nový dar zatím nepřišel. Banky se ptáme nejvýš jednou za 30 sekund, zkuste to proto za chvíli znovu. Údaje z banky k 18. 10. 2026 10:05',
        );
        expect(button('.bank-check-btn').disabled).toBe(false);
      });

      it('and one gift arrives, then the outcome says one new gift was added', async () => {
        const list = twoYearDonations();
        await pressAfterAreaCheck({ ...list, items: list.items.slice(1) });

        http
          .expectOne({ method: 'POST', url: BANK_CHECK_URL })
          .flush({ bankDataAsOf: LATER, checking: false });
        await respond(twoYearSummary(), list);

        expect(text('.bank-check-status')).toBe(
          'Přibyl 1 nový dar. Údaje z banky k 18. 10. 2026 10:07',
        );
      });

      it('and three gifts arrive, then the outcome uses the Czech few form', async () => {
        const list = twoYearDonations();
        await pressAfterAreaCheck({ ...list, items: list.items.slice(3) });

        http
          .expectOne({ method: 'POST', url: BANK_CHECK_URL })
          .flush({ bankDataAsOf: LATER, checking: false });
        await respond(twoYearSummary(), list);

        expect(text('.bank-check-status')).toBe(
          'Přibyly 3 nové dary. Údaje z banky k 18. 10. 2026 10:07',
        );
      });

      it('and five gifts arrive, then the outcome uses the form for many', async () => {
        const list = twoYearDonations();
        const more = {
          ...list,
          items: [
            donationItem({ id: 'd-6', receivedAt: '2026-05-01' }),
            donationItem({ id: 'd-5', receivedAt: '2026-04-01' }),
            ...list.items,
          ],
        };
        await pressAfterAreaCheck(emptyDonations());

        http
          .expectOne({ method: 'POST', url: BANK_CHECK_URL })
          .flush({ bankDataAsOf: LATER, checking: false });
        await respond(twoYearSummary(), more);

        expect(text('.bank-check-status')).toBe(
          'Přibylo 5 nových darů. Údaje z banky k 18. 10. 2026 10:07',
        );
      });

      it('and the check fails, then an alert asks to try again in a while', async () => {
        await pressAfterAreaCheck();

        http
          .expectOne({ method: 'POST', url: BANK_CHECK_URL })
          .flush(null, { status: 500, statusText: 'Server Error' });
        await settle();

        expect(text('.bank-check-error')).toBe(
          'Nové platby se nepodařilo zkontrolovat. Zkuste to prosím za chvíli znovu.',
        );
        expect(element('.bank-check-error')?.getAttribute('role')).toBe('alert');
        expect(button('.bank-check-btn').disabled).toBe(false);
      });

      it('and the bank is still busy after the last poll, then the donations load again and the outcome says to try again later', async () => {
        vi.useFakeTimers();
        await pressAfterAreaCheck();
        http
          .expectOne({ method: 'POST', url: BANK_CHECK_URL })
          .flush({ bankDataAsOf: EARLIER, checking: true });
        for (let poll = 0; poll < 45; poll++) {
          await vi.advanceTimersByTimeAsync(2000);
          http
            .expectOne({ method: 'GET', url: BANK_CHECK_URL })
            .flush({ bankDataAsOf: EARLIER, checking: true });
        }
        await vi.advanceTimersByTimeAsync(2000);
        http.expectNone({ method: 'GET', url: BANK_CHECK_URL });
        await respond(twoYearSummary(), twoYearDonations());

        expect(text('.bank-check-status')).toBe(
          'Banka zatím neodpověděla. Zkuste to prosím za chvíli znovu. Údaje z banky k 18. 10. 2026 10:05',
        );
      });

      it('and then moves to another section and back, then the outcome is gone', async () => {
        await pressAfterAreaCheck();
        http
          .expectOne({ method: 'POST', url: BANK_CHECK_URL })
          .flush({ bankDataAsOf: EARLIER, checking: false });
        await respond(twoYearSummary(), twoYearDonations());

        await go('/darce/potvrzeni');
        await go('/darce/dary');

        expect(text('.bank-check-status')).toBe('Údaje z banky k 18. 10. 2026 10:05');
      });
    });

    it('then a failed bank check shows no bank time and the donor can try again', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      bankCheck.flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text('.bank-check-status')).toBe('');
      expect(element('.bank-check-error')).toBeNull();
      expect(button('.bank-check-btn').disabled).toBe(false);
    });

    it('then the receipt of one payment is saved under the name the server gives', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      await click(secondRowButton);
      const request = receiptRequest({ donationId: 'd-3' });
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
      request.flush(issuedSingle('2026-000017'));
      await settle();

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe('application/pdf');
      expect(savedFiles).toEqual([
        { fileName: 'potvrzeni-o-daru-2026-000017.pdf', href: OBJECT_URL },
      ]);
      expect(element('[role="alert"]')).toBeNull();
    });

    it('then a saved receipt of one payment is named in a status line at its row', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());
      const row = `${yearSection(2026)} tbody tr:nth-child(2)`;
      expect(element(`${row} .receipt-saved [role="status"]`)).not.toBeNull();
      expect(text(`${row} .receipt-saved`)).toBe('');

      await click(secondRowButton);
      receiptRequest({ donationId: 'd-3' }).flush(issuedSingle('2026-000017'));
      await settle();

      expect(text(`${row} .receipt-saved`)).toBe(
        'Potvrzení potvrzeni-o-daru-2026-000017.pdf je stažené. Najdete ho ve stažených souborech.',
      );
      expect(texts('.payments-card .receipt-saved').filter((line) => line !== '')).toHaveLength(1);
    });

    it('then a new download takes the saved line away from the earlier one', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());
      await click(secondRowButton);
      receiptRequest({ donationId: 'd-3' }).flush(issuedSingle('2026-000017'));
      await settle();

      await click(thirdRowButton);

      expect(texts('.payments-card .receipt-saved').filter((line) => line !== '')).toEqual([
        'Připravujeme údaje potvrzení…',
      ]);
      receiptRequest({ donationId: 'd-2' }).flush(issuedSingle('2025-000003'));
      await settle();
      expect(text(`${yearSection(2025)} tbody tr:nth-child(1) .receipt-saved`)).toBe(
        'Potvrzení potvrzeni-o-daru-2025-000003.pdf je stažené. Najdete ho ve stažených souborech.',
      );
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

    it('then a payment that verified an account reads as a verification, offers no PDF and says it counts in the yearly receipt', async () => {
      const list = twoYearDonations();
      list.items = [accountVerificationItem({ receivedAt: '2026-03-20' }), ...list.items];
      await open('/darce/dary');
      await respond(twoYearSummary(), list);

      const first = element(`${yearSection(2026)} tbody tr:nth-child(1)`)!;
      expect(
        [...first.querySelectorAll('td')].map((cell) => normalized(cell.textContent ?? '')),
      ).toEqual([
        '20. 03. 2026',
        '1 Kč',
        'Ověření účtu',
        'Přijato',
        'Započítá se do ročního potvrzení',
      ]);
      expect(first.querySelector('.download-btn')).toBeNull();
      expect(element('.receipts-from')).toBeNull();
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

      receiptRequest({ donationId: 'd-3' }).flush(issuedSingle('2026-000017'));
      await settle();
      expect(button(secondRowButton).disabled).toBe(false);
      expect(text(secondRowButton)).toBe('Stáhnout PDF, dar z 10. 01. 2026, 1 000 Kč');
    });

    it('then a receipt no longer available shows the problem title and loads the payments again', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());

      await click(secondRowButton);
      receiptRequest({ donationId: 'd-3' }).flush(
        problemBody(
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
      receiptRequest({ donationId: 'd-2' }).flush(
        problemBody(
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
      receiptRequest({ donationId: 'd-3' }).flush('Bad Gateway', {
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
      receiptRequest({ donationId: 'd-3' }).flush(issuedSingle('2026-000017'));
      await settle();

      expect(element('[role="alert"]')).toBeNull();
      expect(savedFiles).toHaveLength(1);
    });

    it('then a download refused because the session has ended sends the donor home to sign in and back to this page after it', async () => {
      await open('/darce/dary');
      await respond(twoYearSummary(), twoYearDonations());
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      await click(secondRowButton);
      receiptRequest({ donationId: 'd-3' }).flush(
        problemBody('auth/unauthenticated', 'Přihlaste se', 401),
        {
          status: 401,
          statusText: 'Unauthorized',
        },
      );
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

    it('then a donor without a year before the first receipt year still reads from which year receipts are issued here and whom to write for earlier gifts', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.yearly-earlier')).toBe(
        'Potvrzení tu vystavujeme za dary od roku 2025. Za dřívější dary nám napište na info@nfnn.cz.',
      );
      expect(element('.yearly-earlier a')?.getAttribute('href')).toBe('mailto:info@nfnn.cz');
    });

    it('then a donor with a year before the first receipt year reads the line about it only once', async () => {
      await open('/darce/potvrzeni');
      await respond(summaryWithReceiptsFrom2026(), donationsWithoutReceiptsBefore2026());

      expect(element('.yearly-earlier')).toBeNull();
    });

    it('then account verifications are named apart from the gifts of their year while the total keeps their amount', async () => {
      const list = twoYearDonations();
      list.items = [
        accountVerificationItem({ id: 'v-1', receivedAt: '2026-03-20' }),
        accountVerificationItem({ id: 'v-2', receivedAt: '2025-12-01' }),
        ...list.items,
      ];
      const summary = twoYearSummary();
      summary.byYear = [
        { year: 2026, count: 3, totalAmountMinor: 150100 },
        { year: 2025, count: 2, totalAmountMinor: 25100 },
      ];
      await open('/darce/potvrzeni');
      await respond(summary, list);

      expect(yearRows().map((row) => row.slice(0, 3))).toEqual([
        ['2026', '2 dary a ověření účtu', '1 501 Kč'],
        ['2025', '1 dar a ověření účtu', '251 Kč'],
      ]);
    });

    it('then a year with only an account verification names just that', async () => {
      const list = {
        ...emptyDonations(),
        items: [accountVerificationItem({ receivedAt: '2026-10-30' })],
      };
      const summary = {
        ...emptySummary(),
        count: 1,
        totalAmountMinor: 100,
        byYear: [{ year: 2026, count: 1, totalAmountMinor: 100 }],
      };
      await open('/darce/potvrzeni');
      await respond(summary, list);

      expect(yearRows()[0].slice(0, 3)).toEqual(['2026', 'Ověření účtu', '1 Kč']);
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
      receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
      await settle();

      expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-darech-2025.pdf', href: OBJECT_URL }]);
      expect(yearRow(2025).querySelector('.receipt-saved [role="status"]')).not.toBeNull();
      expect(normalized(yearRow(2025).querySelector('.receipt-saved')?.textContent ?? '')).toBe(
        'Potvrzení potvrzeni-o-darech-2025.pdf je stažené. Najdete ho ve stažených souborech.',
      );
    });

    describe('and the receipt is drawn in the browser', () => {
      const line = (year: number): string =>
        normalized(yearRow(year).querySelector('.receipt-saved')?.textContent ?? '');

      beforeEach(async () => {
        receiptEnvironment.autoDraw = false;
        await open('/darce/potvrzeni');
        await respond(twoYearSummary(), twoYearDonations());
      });

      it('then the line at the button names each phase with a progress bar until the PDF is saved', async () => {
        await downloadYear(2025);
        expect(line(2025)).toBe('Připravujeme údaje potvrzení…');
        expect(yearRow(2025).querySelector('progress')?.getAttribute('value')).toBe('1');

        receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
        await settle();
        expect(line(2025)).toBe('Načítáme nástroje pro PDF…');

        receiptEnvironment.last().say({ kind: 'ready' });
        receiptEnvironment.last().say({ kind: 'page', page: 1 });
        receiptEnvironment.last().say({ kind: 'page', page: 2 });
        await settle();
        expect(line(2025)).toBe('Vytváříme PDF, strana 2…');
        expect(yearRow(2025).querySelector('progress')?.getAttribute('value')).toBe('3');
        expect(yearRow(2025).querySelector('progress')?.getAttribute('max')).toBe('4');

        receiptEnvironment.last().drawAll();
        await settle();
        expect(line(2025)).toBe(
          'Potvrzení potvrzeni-o-darech-2025.pdf je stažené. Najdete ho ve stažených souborech.',
        );
        expect(yearRow(2025).querySelector('progress')).toBeNull();
        expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-darech-2025.pdf', href: OBJECT_URL }]);
      });

      it('then each page drawn moves the bar on, against the pages a year of that many gifts takes', async () => {
        await downloadYear(2025);
        receiptRequest({ year: 2025 }).flush(
          issued({ ...frozenCase(YEARLY_120), year: 2025, number: '2026-000001' }),
        );
        await settle();
        receiptEnvironment.last().say({ kind: 'ready' });
        const bar = (): string[] => {
          const progress = yearRow(2025).querySelector('progress');
          return [progress?.getAttribute('value') ?? '', progress?.getAttribute('max') ?? ''];
        };

        receiptEnvironment.last().say({ kind: 'page', page: 1 });
        await settle();
        expect(bar()).toEqual(['3', '8']);
        receiptEnvironment.last().say({ kind: 'page', page: 3 });
        await settle();
        expect(bar()).toEqual(['5', '8']);
        receiptEnvironment.last().say({ kind: 'page', page: 7 });
        await settle();
        expect(bar()).toEqual(['7', '8']);
      });

      it('then a drawing that takes longer than eight seconds can be cancelled, which stops it and frees the button', async () => {
        vi.useFakeTimers();
        await downloadYear(2025);
        receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
        await settle();
        expect(yearRow(2025).querySelector('.download-progress-cancel')).toBeNull();

        await vi.advanceTimersByTimeAsync(8000);
        await settle();
        (yearRow(2025).querySelector('.download-progress-cancel') as HTMLButtonElement).click();
        await settle();

        expect(receiptEnvironment.last().terminated).toBe(true);
        expect(line(2025)).toBe('Přípravu potvrzení jste zrušili.');
        expect(button('.yearly-pdf').disabled).toBe(false);
        expect(savedFiles).toEqual([]);
        await vi.advanceTimersByTimeAsync(0);
        expect(document.activeElement).toBe(yearRow(2025).querySelector('.yearly-pdf'));
      });

      it('then a drawing that fails says what to do next', async () => {
        await downloadYear(2025);
        receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
        await settle();
        receiptEnvironment.last().say({ kind: 'ready' });
        receiptEnvironment.last().say({ kind: 'failed', reason: 'drawing' });
        await settle();

        expect(text('.yearly-card [role="alert"]')).toBe(
          'PDF se v prohlížeči nepodařilo vytvořit. Zkuste to prosím znovu; když to nepomůže, zkuste jiný prohlížeč nebo nám napište na info@nfnn.cz.',
        );
        expect(button('.yearly-pdf').disabled).toBe(false);
      });

      it('then a theme whose receipt colours would not show stops the drawing with a line that says whom to tell', async () => {
        vi.spyOn(receiptEnvironment, 'style').mockImplementation(() => {
          throw new ReceiptStyleRefused('--receipt-color-text has too little contrast');
        });
        await downloadYear(2025);
        receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
        await settle();
        receiptEnvironment.last().say({ kind: 'ready' });
        await settle();

        expect(text('.yearly-card [role="alert"]')).toBe(
          'PDF teď kvůli chybě na webu nejde vytvořit. Napište nám prosím na info@nfnn.cz, opravíme ji.',
        );
        expect(button('.yearly-pdf').disabled).toBe(false);
      });

      it('then drawing tools missing after a new release reload the page once to finish the download', async () => {
        const restart = vi.spyOn(ReceiptRestart.prototype, 'tryRestart').mockReturnValue(true);
        await downloadYear(2025);
        receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
        await settle();
        receiptEnvironment.last().fail();
        await settle();

        expect(restart).toHaveBeenCalledWith('rok-2025');
        expect(element('.yearly-card [role="alert"]')?.textContent?.trim() ?? '').toBe('');
      });

      it('then drawing tools still missing after that reload ask the donor to reload the page', async () => {
        vi.spyOn(ReceiptRestart.prototype, 'tryRestart').mockReturnValue(false);
        await downloadYear(2025);
        receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
        await settle();
        receiptEnvironment.last().fail();
        await settle();

        expect(text('.yearly-card [role="alert"]')).toBe(
          'Web se mezitím aktualizoval. Obnovte prosím stránku a stáhněte potvrzení znovu.',
        );
      });

      describe('and it is finished on an iPhone, where the PDF waits for a second tap', () => {
        let share: MockInstance<PdfDelivery['share']>;

        beforeEach(async () => {
          vi.spyOn(PdfDelivery.prototype, 'needsSecondTap').mockReturnValue(true);
          share = vi.spyOn(PdfDelivery.prototype, 'share').mockResolvedValue('shared');
          await downloadYear(2025);
          receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
          await settle();
          receiptEnvironment.last().drawAll();
          await settle();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        it('then nothing is saved yet, the line says it is ready and the same button now opens it, with the focus on it', () => {
          expect(savedFiles).toEqual([]);
          expect(line(2025)).toBe(
            'Potvrzení potvrzeni-o-darech-2025.pdf je připravené. Otevřete ho tlačítkem Otevřít potvrzení.',
          );
          const open = yearRow(2025).querySelector('.yearly-pdf') as HTMLButtonElement;
          expect(normalized(open.textContent ?? '')).toBe('Otevřít potvrzení za rok 2025 (PDF)');
          expect(open.disabled).toBe(false);
          expect(document.activeElement).toBe(open);
          expect(yearRow(2025).querySelectorAll('button')).toHaveLength(1);
        });

        it('then the second tap on that button opens the share sheet and issues nothing again', async () => {
          await downloadYear(2025);
          await settleBlobFailure();

          http.expectNone({ method: 'POST', url: RECEIPTS_URL });
          expect(share).toHaveBeenCalledTimes(1);
          expect(share).toHaveBeenCalledWith(
            expect.objectContaining({ fileName: 'potvrzeni-o-darech-2025.pdf' }),
          );
          expect(receiptEnvironment.workers).toHaveLength(1);
          expect(line(2025)).toBe(
            'Potvrzení potvrzeni-o-darech-2025.pdf jste předali z nabídky sdílení.',
          );
          expect(normalized(yearRow(2025).querySelector('.yearly-pdf')?.textContent ?? '')).toBe(
            'Stáhnout potvrzení za rok 2025 (PDF)',
          );
        });

        it('then a share sheet the browser cannot open saves the file and says it is saved', async () => {
          share.mockResolvedValue('saved');

          await downloadYear(2025);
          await settleBlobFailure();

          expect(line(2025)).toBe(
            'Potvrzení potvrzeni-o-darech-2025.pdf je stažené. Najdete ho ve stažených souborech.',
          );
        });

        it('then a share sheet the donor closes keeps the file ready for another tap', async () => {
          share.mockResolvedValue('dismissed');

          await downloadYear(2025);
          await settleBlobFailure();

          expect(normalized(yearRow(2025).querySelector('.yearly-pdf')?.textContent ?? '')).toBe(
            'Otevřít potvrzení za rok 2025 (PDF)',
          );
        });
      });
    });

    it('then an address naming a download that no reload of this tab asked for issues nothing and drops it from the address', async () => {
      sessionStorage.clear();
      vi.spyOn(ReceiptRestart.prototype, 'finished');
      await open('/darce/potvrzeni?stahnout=rok-2025');
      await respond(twoYearSummary(), twoYearDonations());
      await settle();

      http.expectNone({ method: 'POST', url: RECEIPTS_URL });
      expect(savedFiles).toEqual([]);
      expect(TestBed.inject(Router).url).toBe('/darce/potvrzeni');
      expect(ReceiptRestart.prototype.finished).toHaveBeenCalled();
    });

    it('then an address naming a download after a reload starts it once the gifts are loaded and drops it from the address', async () => {
      sessionStorage.setItem('nfnn.receipt-restart', 'rok-2025');
      vi.spyOn(ReceiptRestart.prototype, 'finished');
      await open('/darce/potvrzeni?stahnout=rok-2025');
      await respond(twoYearSummary(), twoYearDonations());

      receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
      await settleBlobFailure();
      await settle();

      expect(savedFiles).toEqual([{ fileName: 'potvrzeni-o-darech-2025.pdf', href: OBJECT_URL }]);
      expect(TestBed.inject(Router).url).toBe('/darce/potvrzeni');
      expect(ReceiptRestart.prototype.finished).toHaveBeenCalled();
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

      receiptRequest({ year: 2025 }).flush(issuedYearly(2025));
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
      receiptRequest({ year: 2026 }).flush(
        problemBody('donations/year-not-yet-completed', 'Rok ještě neskončil', 400),
        {
          status: 400,
          statusText: 'Bad Request',
        },
      );
      await settleBlobFailure();

      expect(text('.yearly-card [role="alert"]')).toBe('Rok ještě neskončil');
      expect(savedFiles).toEqual([]);
    });

    it('then a server with no donations of that year to confirm shows the title of that problem', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      await downloadYear(2025);
      receiptRequest({ year: 2025 }).flush(
        problemBody('donations/yearly-receipt-not-available', 'Za tento rok nemáme žádný dar', 404),
        { status: 404, statusText: 'Not Found' },
      );
      await settleBlobFailure();

      expect(text('.yearly-card [role="alert"]')).toBe('Za tento rok nemáme žádný dar');
    });

    it('then a server issuing no receipts for that year shows the title of that problem', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      await downloadYear(2025);
      receiptRequest({ year: 2025 }).flush(
        problemBody(
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

    it('then a receipt the server cannot print shows the title and detail of that problem, which say whom to write to', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      await downloadYear(2025);
      receiptRequest({ year: 2025 }).flush(
        {
          ...problemBody(
            'donations/receipt-unprintable',
            'Potvrzení s těmito údaji nejde vytisknout',
            409,
          ),
          detail: 'Napište nám prosím na info@nfnn.cz.',
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settleBlobFailure();

      expect(text('.yearly-card [role="alert"]')).toBe(
        'Potvrzení s těmito údaji nejde vytisknout. Napište nám prosím na info@nfnn.cz.',
      );
      expect(savedFiles).toEqual([]);
    });

    it('then an issued receipt with a character no receipt can print asks the donor to write to the foundation, not to try another browser', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      await downloadYear(2025);
      const receipt = issuedYearly(2025);
      receiptRequest({ year: 2025 }).flush({
        ...receipt,
        receipt: { ...receipt.receipt, donor: { ...receipt.receipt.donor, name: 'Jana 中' } },
      });
      await settle();

      expect(text('.yearly-card [role="alert"]')).toBe(
        'Údaje potvrzení obsahují znak, který v PDF neumíme vytisknout, a tak jsme PDF nevytvořili. Napište nám prosím na info@nfnn.cz.',
      );
      expect(receiptEnvironment.workers).toHaveLength(0);
    });

    it('then an access token that expires during a download is refreshed and the PDF is still saved', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      await downloadYear(2025);
      receiptRequest({ year: 2025 }).flush(
        problemBody('auth/expired-token', 'Platnost přihlášení vypršela', 401),
        {
          status: 401,
          statusText: 'Unauthorized',
        },
      );
      await settleBlobFailure();
      http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-2'));
      const retried = receiptRequest({ year: 2025 });
      expect(retried.request.headers.get('Authorization')).toBe('Bearer token-2');
      retried.flush(issuedYearly(2025));
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

    it('then the gifts of the running year are listed there, each with the download of its receipt', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      const rows = [...root().querySelectorAll<HTMLElement>('.single-card tbody tr')];
      expect(rows.map((row) => normalized(row.querySelector('.date')?.textContent ?? ''))).toEqual([
        '15. 03. 2026',
        '10. 01. 2026',
      ]);
      expect(
        rows.map((row) => normalized(row.querySelector('.download-btn')?.textContent ?? '')),
      ).toEqual([
        'Stáhnout PDF, dar z 15. 03. 2026, 500 Kč',
        'Stáhnout PDF, dar z 10. 01. 2026, 1 000 Kč',
      ]);
      expect(text('.single-card .yearly-sub')).toBe(
        'Potvrzení k letošním darům stáhnete tady hned po jejich připsání, ke starším darům v části Moje dary.',
      );
    });

    it('then the receipt of a gift of the running year is saved from there and named at its row', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      const row = root().querySelectorAll<HTMLElement>('.single-card tbody tr')[1];
      (row.querySelector('.download-btn') as HTMLButtonElement).click();
      await settle();
      receiptRequest({ donationId: 'd-3' }).flush(issuedSingle('2026-000017'));
      await settle();

      expect(savedFiles).toEqual([
        { fileName: 'potvrzeni-o-daru-2026-000017.pdf', href: OBJECT_URL },
      ]);
      expect(normalized(row.querySelector('.receipt-saved')?.textContent ?? '')).toBe(
        'Potvrzení potvrzeni-o-daru-2026-000017.pdf je stažené. Najdete ho ve stažených souborech.',
      );
    });

    it('then a failed download of a gift receipt is told in the card of single gifts', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      (root().querySelector('.single-card .download-btn') as HTMLButtonElement).click();
      await settle();
      receiptRequest({ donationId: 'd-4' }).flush(null, {
        status: 500,
        statusText: 'Server Error',
      });
      await settleBlobFailure();

      expect(text('.single-card [role="alert"]')).toBe(
        'Potvrzení se nepodařilo stáhnout. Zkuste to prosím znovu.',
      );
      expect(element('.yearly-card [role="alert"]')).toBeNull();
    });

    it('and the yearly receipt of every year with gifts is already out, then the card only points to the donations page', async () => {
      const summary = twoYearSummary();
      summary.yearlyReceiptsAvailableThrough = 2026;
      await open('/darce/potvrzeni');
      await respond(summary, twoYearDonations());

      expect(element('.single-card table')).toBeNull();
      expect(text('.single-card .yearly-sub')).toBe(
        'Potvrzení ke každému přijatému daru zvlášť stáhnete hned po jeho připsání v části Moje dary.',
      );
    });

    it('then a donor with no donations yet reads how a gift appears and finds the way to add the account of a missing gift', async () => {
      await open('/darce/potvrzeni');
      await respond(emptySummary(), emptyDonations());

      expect(element('.year-row')).toBeNull();
      expect(text('.yearly-empty')).toBe(
        'Zatím tu nemáme žádný váš dar. Jakmile dorazí platba s vaším variabilním symbolem, objeví se tady.',
      );
      expectMissingGiftIn('.yearly-card');
    });

    it('then one plain line says to use either the yearly receipt or those of single gifts, and that a new download after a change of name or address replaces the earlier one', async () => {
      await open('/darce/potvrzeni');
      await respond(twoYearSummary(), twoYearDonations());

      expect(text('.receipts-intro')).toBe(
        'Potvrzení k jednotlivým darům stáhnete hned, roční potvrzení za celý rok od 1. ledna dalšího roku a do daňového přiznání přiložíte buď jednotlivá, nebo roční, ne obojí, protože roční obsahuje všechny dary roku. ' +
          'Když změníte jméno nebo adresu, nově stažené potvrzení dostane nové číslo a nahradí to dřívější.',
      );
    });
  });

  describe('when the bank accounts page opens', () => {
    function card(): BankAccountsCard {
      return harness.fixture.debugElement.query(By.directive(BankAccountsCard))
        .componentInstance as BankAccountsCard;
    }

    it('then the link of a missing gift opens Přidat účet at once, leaves no trace in the address and closing returns the focus to Přidat účet', async () => {
      await open('/darce/ucty?pridat=ucet');
      sectionAccountRequests.forEach((request) => request.flush({ items: [] }));
      await respond(emptySummary(), emptyDonations());
      await settle();

      http
        .expectOne((request) => request.url === '/api/donations/payment-qr')
        .flush({
          spayd: 'SPD*1.0',
          qrCode: { size: 1, modules: '1' },
          bankAccount: {
            accountNumber: '5544332217/2010',
            iban: 'CZ2620100000005544332217',
            recipientName: 'Nadační fond Nová naděje',
          },
        });
      await settle();

      expect((element('dialog') as HTMLDialogElement).open).toBe(true);
      expect(TestBed.inject(Router).url).toBe('/darce/ucty');
      await click('.add-account-close');
      expect(document.activeElement).toBe(element('.accounts-add'));
    });

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
      await respond(twoYearSummary(), twoYearDonations());

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

      expect(texts('h2')).toEqual([
        'Údaje na potvrzení o daru',
        'Přihlášení a zabezpečení',
        'Smazání účtu',
      ]);
      expect(texts('app-account-card .account-row dt')).toEqual([
        'E-mail',
        'Heslo',
        'Dvoufaktorové ověření',
        'Přístupové klíče',
      ]);
      expect(element('app-connected-apps-card')).toBeNull();
      http.expectNone('/api/donors/me/connections');
    });

    it('then a last section says how to ask for deleting the account, what goes and what stays', async () => {
      await open('/darce/udaje');
      http.expectOne(PASSKEYS_URL).flush({ items: [] });
      await respond(twoYearSummary(), twoYearDonations());

      expect(element('.account-deletion')?.getAttribute('aria-labelledby')).toBe(
        'account-deletion-title',
      );
      expect(texts('.account-deletion p')).toEqual([
        'Účet si sami smazat nemůžete. Napište nám na info@nfnn.cz, nejlépe z adresy, kterou se přihlašujete, že chcete účet smazat.',
        'Smažeme vaše jméno, adresu, e‑mail a přihlašovací údaje a pošleme vám o tom e‑mail. Záznamy o darech a vystavená potvrzení si musíme ponechat kvůli účetnictví.',
        'Potvrzení o daru, která budete potřebovat, si stáhněte předem. Po smazání se do účtu už nepřihlásíte.',
      ]);
      const mail = element('.account-deletion a') as HTMLAnchorElement;
      expect(mail.getAttribute('href')).toBe(
        'mailto:info@nfnn.cz?subject=Sma%C5%BE%C3%A1n%C3%AD%20%C3%BA%C4%8Dtu',
      );
      expect(normalized(mail.textContent ?? '')).toBe('info@nfnn.cz');
    });
  });
});
