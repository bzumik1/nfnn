import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import {
  donorAccount,
  foundDonor,
  pairedDonation,
  paymentList,
  unpairedPayment,
} from '../testing/admin-fixtures';
import { AdminPayments, PAIRING_WAIT_MS } from './admin-payments';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { LiveUpdates } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/live-fixtures';
import { Connectivity } from '../../../core/connectivity/connectivity';
import { ShownAnswers } from '../../../core/connectivity/shown-answers';
import type { AccountStore, CopyContents } from '../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import { AdministrationCopyDownload } from '../device-copy/administration-copy-download';
import { FORCED_REFRESH_GAP_MS } from '../device-copy/administration-reads';

const PAYMENTS_URL = '/api/admin/donations/payments';
const DONORS_URL = '/api/admin/donations/donors';
const ACCOUNTS_URL = '/api/admin/donors';
const PAYMENT_ID = '019a1c00-0000-7000-8000-000000001001';

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

const FIRST_PAGE = 'pairing=unpaired&limit=50';
const PAIRED_PAGE = 'pairing=paired&limit=50';

describe('Given an administrator on the bank payments page', () => {
  let fixture: ComponentFixture<unknown>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminPayments],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: 'sprava/platby', component: AdminPayments }]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(AuthStore);
    store.login('admin@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
  });

  async function open(url = '/sprava/platby'): Promise<void> {
    const harness = await RouterTestingHarness.create(url);
    fixture = harness.fixture;
    await settle();
  }

  function url(): string {
    return TestBed.inject(Router).url;
  }

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

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

  function joinedText(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    return Array.from(node.childNodes).map(joinedText).join(' ');
  }

  function rowText(element: Element): string {
    return joinedText(element).replace(/\s+/g, ' ').trim();
  }

  function rows(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>,
    ).map(rowText);
  }

  function button(name: string): HTMLButtonElement {
    const buttons = Array.from(
      document.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    );
    const found = buttons.find((candidate) => candidate.textContent?.trim() === name);
    if (!found) {
      throw new Error(`No button "${name}" among ${buttons.map((b) => b.textContent?.trim())}`);
    }
    return found;
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function listResponds(body: object, params = FIRST_PAGE): Promise<void> {
    http.expectOne(`${PAYMENTS_URL}?${params}`).flush(body);
    await settle();
  }

  it('when the page opens, then it asks for the first 50 unpaired payments with the token and says it is loading', async () => {
    await open();
    const request = http.expectOne(`${PAYMENTS_URL}?${FIRST_PAGE}`);

    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(text('h1')).toBe('Platby z banky');
    expect(text('[role="status"]:not(:empty)')).toBe('Načítáme platby…');
    request.flush(paymentList([]));
  });

  it('when there is nothing unpaired, then the page says so', async () => {
    await open();
    await listResponds(paymentList([]));

    expect(text('.ui-card__empty')).toContain('Všechny platby z banky jsou přiřazené.');
  });

  it('when unpaired payments arrive, then each row shows date, amount, sender, symbol and message with a pairing button', async () => {
    await open();
    await listResponds(
      paymentList([
        unpairedPayment(),
        unpairedPayment({
          id: 'p2',
          bankTransactionId: 1003,
          bookedOn: '2026-10-12',
          amountMinor: 25050,
          variableSymbol: null,
          counterpartyName: null,
          counterpartyAccount: null,
          messageForRecipient: null,
          unpairedByAdminAt: '2026-10-18T08:00:00Z',
        }),
      ]),
    );

    expect(rows()).toEqual([
      '10. 10. 2026 500 Kč Nováková Jana 2900233333/2010 · Fio banka 1111111111 Dar pro fond Přiřadit dárci',
      '12. 10. 2026 jen ručně Správce zrušil přiřazení, web ji proto sám nepřiřadí. 250,50 Kč — bez VS Přiřadit dárci',
    ]);
    expect(fixture.nativeElement.querySelector('.held-tag')?.getAttribute('title')).toBeNull();
    expect(text('.admin-tabs')).toBe('Čekají na přiřazení (2) Přiřazené');
    expect(text('#payments-title')).toBe('Platby čekající na přiřazení');
  });

  it('when a 1 Kč account verification waits, then its row is marked as an account verification', async () => {
    await open();
    await listResponds(
      paymentList([
        unpairedPayment({
          amountMinor: 100,
          variableSymbol: null,
          messageForRecipient: 'Ověření účtu Nadační fond Nová naděje',
          accountVerification: true,
        }),
        unpairedPayment({ id: 'p2' }),
      ]),
    );

    expect(rows()[0]).toContain('1 Kč Ověření účtu');
    expect(rows()[1]).not.toContain('Ověření účtu');
  });

  it('when the list cannot be loaded, then an alert offers a retry that asks again', async () => {
    await open();
    http.expectOne(`${PAYMENTS_URL}?${FIRST_PAGE}`).flush({}, { status: 500, statusText: 'Error' });
    await settle();

    expect(text('[role="alert"]:not(:empty)')).toContain('Platby se nepodařilo načíst.');

    button('Zkusit znovu').click();
    await listResponds(paymentList([]));

    expect(text('.ui-card__empty')).toContain('Všechny platby z banky jsou přiřazené.');
  });

  it('when the role was taken away, then the administrator lands on the donor overview', async () => {
    await open();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const refused = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');
    http.expectOne(`${PAYMENTS_URL}?${FIRST_PAGE}`).flush(refused.body, refused.options);
    await settle();

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });

  describe('when the administrator switches to the paired payments', () => {
    beforeEach(async () => {
      await open();
      await listResponds(paymentList([unpairedPayment()]));
      button('Přiřazené').click();
      await settle();
    });

    it('then every year is listed newest first with donor, method and receipt, and the tab is kept in the address', async () => {
      await listResponds(
        paymentList(
          [
            unpairedPayment({
              donation: pairedDonation({ receiptIssued: true }),
            }),
            unpairedPayment({
              id: 'p2',
              bankTransactionId: 1002,
              bookedOn: '2025-09-01',
              donation: pairedDonation({
                id: 'd2',
                donorName: null,
                pairedBy: 'MANUAL',
                status: 'REFUNDED',
              }),
            }),
          ],
          { availableYears: [2026, 2025] },
        ),
        PAIRED_PAGE,
      );

      expect(url()).toBe('/sprava/platby?stav=prirazene');
      expect(text('#payments-title')).toBe('Přiřazené platby');
      expect(fixture.nativeElement.querySelector('select')).toBeNull();
      expect(rows()[0]).toContain('Jana Nováková podle variabilního symbolu potvrzení vystaveno');
      expect(rows()[0]).toContain('Nelze zrušit, k daru je vystavené potvrzení.');
      expect(
        fixture.nativeElement.querySelector('tbody tr .donor-name a')?.getAttribute('href'),
      ).toBe('/sprava/darci/01a18e56-bdb0-775a-bd0a-a60756831369');
      expect(rows()[1]).toContain('1. 9. 2025');
      expect(rows()[1]).toContain('dárce bez záznamu ručně správcem vráceno');
      expect(rows()[1]).toContain('Zrušit přiřazení');
    });

    it('then unpairing asks for a confirmation, posts once confirmed, reports the yearly receipt and reloads', async () => {
      await listResponds(
        paymentList([unpairedPayment({ donation: pairedDonation() })], {
          availableYears: [2026],
        }),
        PAIRED_PAGE,
      );

      button('Zrušit přiřazení').click();
      await settle();
      expect(text('.confirm')).toContain(
        'Dar 500 Kč zmizí z přehledu dárce Jana Nováková a platba se vrátí mezi čekající na přiřazení; web ji sám znovu nepřiřadí. Zrušit přiřazení?',
      );
      expect(element('.confirm').getAttribute('aria-label')).toBe(
        'Zrušit přiřazení platby 500\u00a0Kč z 10. 10. 2026?',
      );
      expect(document.activeElement).toBe(button('Ponechat'));
      http.expectNone(`/api/admin/donations/payments/${PAYMENT_ID}/unpair`);

      button('Ponechat').click();
      await settle();
      expect(fixture.nativeElement.querySelector('.confirm')).toBeNull();
      expect(document.activeElement).toBe(button('Zrušit přiřazení'));

      button('Zrušit přiřazení').click();
      await settle();
      element('.confirm .ui-button--danger').click();
      await settle();
      const request = http.expectOne(`/api/admin/donations/payments/${PAYMENT_ID}/unpair`);
      expect(request.request.method).toBe('POST');
      request.flush({ changedYearlyReceipts: [2026] });
      await settle();
      await listResponds(paymentList([], { availableYears: [] }), PAIRED_PAGE);

      expect(text('[role="status"]:not(:empty)')).toBe(
        'Platba 500 Kč z 10. 10. 2026 už není přiřazena. Web ji sám znovu nepřiřadí; najdete ji mezi platbami čekajícími na přiřazení. Roční potvrzení za 2026, na kterém dar byl, je teď zrušené; ověření ukáže, že platilo ke dni vystavení. Zbyly-li dárci za ten rok další dary, může si stáhnout nové. Dejte mu prosím vědět.',
      );
      expect(document.activeElement).toBe(element('app-live-notice'));
      const donorLink = element<HTMLAnchorElement>('.donor-link a');
      expect(donorLink.textContent?.trim()).toBe('Otevřít kartu dárce Jana Nováková');
      expect(donorLink.getAttribute('href')).toBe(
        '/sprava/darci/01a18e56-bdb0-775a-bd0a-a60756831369',
      );
      expect(text('.admin-tabs')).toBe('Čekají na přiřazení (2) Přiřazené');
    });

    it('then an unpairing names the version read and, when the payment changed meanwhile, the sheet offers to read it again', async () => {
      await listResponds(
        paymentList([unpairedPayment({ donation: pairedDonation() })], {
          availableYears: [2026],
        }),
        PAIRED_PAGE,
      );
      button('Zrušit přiřazení').click();
      await settle();
      element('.confirm .ui-button--danger').click();
      await settle();

      const request = http.expectOne(`/api/admin/donations/payments/${PAYMENT_ID}/unpair`);
      expect(request.request.headers.get('If-Match')).toBe(`"${unpairedPayment().version}"`);
      const refused = problem(
        409,
        'donations/changed-meanwhile',
        'Mezitím se to změnilo',
        'Platbu mezitím změnil někdo jiný.',
      );
      request.flush(
        { ...refused.body, version: '1b2c3d4e5f607182', current: { id: PAYMENT_ID } },
        refused.options,
      );
      await settle();

      expect(document.querySelector('dialog')?.textContent).toContain(
        'automatické párování plateb z banky',
      );
      button('Načíst aktuální stav').click();
      await settle();
      await listResponds(paymentList([], { availableYears: [] }), PAIRED_PAGE);

      expect(document.querySelector('dialog')).toBeNull();
      expect(text('[role="status"]:not(:empty)')).toBe(
        'Načetli jsme aktuální stav plateb. Zkontrolujte platbu a rozhodněte znovu.',
      );
    });

    it('then a refused unpairing shows the backend reason as an alert', async () => {
      await listResponds(
        paymentList([unpairedPayment({ donation: pairedDonation() })], {
          availableYears: [2026],
        }),
        PAIRED_PAGE,
      );
      button('Zrušit přiřazení').click();
      await settle();
      element('.confirm .ui-button--danger').click();
      await settle();

      const refused = problem(
        409,
        'donations/donation-has-receipt',
        'K daru už bylo vystaveno potvrzení',
        'Dar s vystaveným potvrzením odpárovat nelze.',
      );
      http
        .expectOne(`/api/admin/donations/payments/${PAYMENT_ID}/unpair`)
        .flush(refused.body, refused.options);
      await settle();

      expect(text('[role="alert"]:not(:empty)')).toBe(
        'K daru už bylo vystaveno potvrzení. Dar s vystaveným potvrzením odpárovat nelze.',
      );
      expect(document.activeElement).toBe(button('Zrušit přiřazení'));
    });
  });

  describe('when the live stream says the payments changed', () => {
    let live: FakeLiveUpdates;
    const shown = unpairedPayment();
    const arrived = (index: number) =>
      unpairedPayment({
        id: `019a1c00-0000-7000-8000-00000000200${index}`,
        bankTransactionId: 2000 + index,
        bookedOn: '2026-10-20',
        counterpartyName: `Odesílatel ${index}`,
      });

    beforeEach(async () => {
      live = TestBed.inject(LiveUpdates) as unknown as FakeLiveUpdates;
      await open();
      await listResponds(paymentList([shown]));
    });

    function incoming(): string {
      return text('.payments-incoming');
    }

    it('then a new payment waits behind a button in the status line, the tab counts it, and the list stays put until the administrator asks', async () => {
      live.hint('payments');
      await listResponds(paymentList([arrived(1), shown]));

      expect(rows()).toHaveLength(1);
      expect(incoming()).toBe('Zobrazit 1 novou platbu');
      expect(element('.payments-incoming').closest('[role="status"]')).not.toBeNull();
      expect(text('.admin-tab')).toBe('Čekají na přiřazení (2)');

      element<HTMLButtonElement>('.payments-incoming').click();
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(rows()).toHaveLength(2);
      expect(rows()[0]).toContain('Odesílatel 1');
      expect(incoming()).toBe('');
      expect(text('.admin-tab')).toBe('Čekají na přiřazení (2)');
      expect(document.activeElement).toBe(element('#payments-title'));
    });

    it('then the button takes the Czech plural forms', async () => {
      live.hint('payments');
      await listResponds(paymentList([arrived(1), arrived(2), shown]));
      expect(incoming()).toBe('Zobrazit 2 nové platby');

      live.hint('payments');
      await listResponds(paymentList([1, 2, 3, 4, 5].map(arrived).concat(shown)));
      expect(incoming()).toBe('Zobrazit 5 nových plateb');
    });

    it('then a payment that moves up into the page from below the shown ones, as when one of a longer list leaves, joins them without a button, because nothing arrived', async () => {
      const older = unpairedPayment({
        id: '019a1c00-0000-7000-8000-000000000999',
        bankTransactionId: 999,
        bookedOn: '2026-09-01',
        counterpartyName: 'Starší odesílatel',
      });

      live.hint('payments');
      await listResponds(paymentList([shown, older]));

      expect(incoming()).toBe('');
      expect(rows()).toHaveLength(2);
      expect(rows()[1]).toContain('Starší odesílatel');
    });

    it('then a payment that someone else paired leaves the list at once and no button shows', async () => {
      live.hint('payments');
      await listResponds(paymentList([]));

      expect(rows()).toHaveLength(0);
      expect(incoming()).toBe('');
    });

    it('then the list is not read while the pairing dialog is open, and is read once it closes', async () => {
      button('Přiřadit dárci').click();
      await settle();
      http.expectOne((request) => request.url === DONORS_URL).flush({ items: [] });
      http
        .expectOne((request) => request.url === ACCOUNTS_URL)
        .flush({ items: [], hasMore: false });
      await settle();

      live.hint('payments');
      http.expectNone(`${PAYMENTS_URL}?${FIRST_PAGE}`);

      button('Zavřít').click();
      await settle();
      await listResponds(paymentList([arrived(1), shown]));

      expect(incoming()).toBe('Zobrazit 1 novou platbu');
    });

    it('then a stream that comes back after a gap reads the list again', async () => {
      live.resync();
      await listResponds(paymentList([shown]));

      expect(rows()).toHaveLength(1);
      expect(incoming()).toBe('');
    });
  });

  describe('when the administrator presses the pairing button', () => {
    const svoboda = unpairedPayment({
      id: '019a1c00-0000-7000-8000-000000001002',
      bankTransactionId: 1002,
      counterpartyName: 'Svoboda Petr',
    });
    const withoutName = unpairedPayment({
      id: '019a1c00-0000-7000-8000-000000001003',
      bankTransactionId: 1003,
      counterpartyName: null,
    });

    beforeEach(async () => {
      await open();
      await listResponds(paymentList([unpairedPayment(), svoboda, withoutName]));
    });

    function press(row = 0): void {
      Array.from(document.querySelectorAll('button'))
        .filter((candidate) => candidate.textContent?.trim() === 'Přiřadit dárci')
        [row].click();
      fixture.detectChanges();
    }

    function donorsAnswer(query: string, donors: object[]): void {
      http.expectOne(`${DONORS_URL}?query=${encodeURIComponent(query)}`).flush({ items: donors });
    }

    function accountsAnswer(query: string, accounts: object[]): void {
      http
        .expectOne(`${ACCOUNTS_URL}?query=${encodeURIComponent(query)}&limit=100`)
        .flush({ items: accounts, hasMore: false });
    }

    function lateAnswers(query: string): void {
      http
        .match((request) => request.params.get('query') === query)
        .filter((request) => !request.cancelled)
        .forEach((request) =>
          request.flush(
            request.request.url === DONORS_URL
              ? { items: [foundDonor()] }
              : { items: [donorAccount()], hasMore: false },
          ),
        );
    }

    it('then the dialog waits for the donors found and their e-mails and opens with both in it', async () => {
      press();
      donorsAnswer('Nováková', [foundDonor()]);
      await settle();
      expect(document.querySelector('dialog')).toBeNull();

      accountsAnswer('Nováková', [donorAccount()]);
      await settle();

      expect(Array.from(document.querySelectorAll('dialog .pair-result')).map(rowText)).toEqual([
        'Jana Nováková VS 4821937560 · jana@example.cz',
      ]);
    });

    it('then a slow search opens the dialog after the longest wait and its donors follow', async () => {
      vi.useFakeTimers();
      press();
      vi.advanceTimersByTime(PAIRING_WAIT_MS - 1);
      fixture.detectChanges();
      expect(document.querySelector('dialog')).toBeNull();

      vi.advanceTimersByTime(1);
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
      await settle();

      expect(document.querySelector('dialog')).not.toBeNull();
      donorsAnswer('Nováková', [foundDonor()]);
      accountsAnswer('Nováková', []);
      await settle();
      expect(document.querySelectorAll('dialog .pair-result')).toHaveLength(1);
    });

    it('then a payment without a sender to search for opens the dialog at once and searches nothing', async () => {
      press(2);

      expect(document.querySelector('dialog')).not.toBeNull();
      http.expectNone((request) => request.url === DONORS_URL);
    });

    it("then pressing another payment while the first waits opens the dialog for the second, without the first one's donors", async () => {
      press(0);
      press(1);
      donorsAnswer('Svoboda', []);
      accountsAnswer('Svoboda', []);
      await settle();
      lateAnswers('Nováková');
      await settle();

      expect(document.querySelector('dialog')?.textContent).toContain('Svoboda Petr');
      expect(document.querySelectorAll('dialog .pair-result')).toHaveLength(0);
    });

    it('then pressing the same payment again while it waits searches once', async () => {
      press();
      press();
      donorsAnswer('Nováková', [foundDonor()]);
      accountsAnswer('Nováková', []);
      await settle();

      expect(document.querySelectorAll('dialog .pair-result')).toHaveLength(1);
    });

    it('then switching to the paired payments while it waits keeps the dialog closed', async () => {
      press();
      button('Přiřazené').click();
      await settle();
      await listResponds(paymentList([]), PAIRED_PAGE);
      lateAnswers('Nováková');
      await settle();

      expect(document.querySelector('dialog')).toBeNull();
    });
  });

  describe('when the administrator opens the pairing dialog for a payment', () => {
    beforeEach(async () => {
      await open();
      await listResponds(paymentList([unpairedPayment()]));
      const opener = button('Přiřadit dárci');
      opener.focus();
      opener.click();
      await settle();
      http.expectOne((request) => request.url === DONORS_URL).flush({ items: [foundDonor()] });
      await settle();
      answerAccounts('Nováková', [donorAccount()]);
      await settle();
    });

    function answerAccounts(query: string, accounts: object[]): void {
      http
        .expectOne(`${ACCOUNTS_URL}?query=${encodeURIComponent(query)}&limit=100`)
        .flush({ items: accounts, hasMore: false });
    }

    function dialog(): HTMLElement {
      const found = document.querySelector('dialog');
      if (!found) {
        throw new Error('No dialog is open');
      }
      return found;
    }

    function search(value: string): void {
      vi.useFakeTimers();
      const input = dialog().querySelector('#pair-search') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(300);
      vi.useRealTimers();
    }

    it("then the dialog names the payment, searches by the first word of the sender's name at once and focuses the search", () => {
      expect(dialog().textContent).toContain('500\u00a0Kč z 10. 10. 2026');
      expect(dialog().textContent).toContain('Nováková Jana');
      expect(rowText(dialog().querySelector('.pair-payment')!)).toContain(
        '2900233333/2010 · Fio banka',
      );
      const input = dialog().querySelector('#pair-search') as HTMLInputElement;
      expect(input.value).toBe('Nováková');
      expect(document.activeElement).toBe(input);
      expect(Array.from(dialog().querySelectorAll('.pair-result')).map(rowText)).toEqual([
        'Jana Nováková VS 4821937560 · jana@example.cz',
      ]);
      expect((button('Přiřadit') as HTMLButtonElement).disabled).toBe(true);
      expect(dialog().textContent).not.toContain('Ověření účtu');
    });

    it('then typing searches once the typing pauses, a chosen donor enables the button and pairing reports success', async () => {
      search('nov');
      const request = http.expectOne(`${DONORS_URL}?query=nov`);
      request.flush({
        items: [
          foundDonor(),
          foundDonor({
            donorId: 'acme',
            name: 'Acme s.r.o.',
            type: 'COMPANY',
            companyIdentifier: '25596641',
            variableSymbol: '7310945528',
          }),
        ],
      });
      await settle();
      http.expectOne(`${ACCOUNTS_URL}?query=nov&limit=100`).flush(
        {},
        {
          status: 500,
          statusText: 'Error',
        },
      );
      await settle();

      const results = Array.from(dialog().querySelectorAll('.pair-result')).map(rowText);
      expect(results).toEqual([
        'Jana Nováková VS 4821937560',
        'Acme s.r.o. VS 7310945528 · IČO 25596641',
      ]);
      expect((button('Přiřadit') as HTMLButtonElement).disabled).toBe(true);

      (dialog().querySelectorAll('input[type="radio"]')[0] as HTMLInputElement).click();
      await settle();
      expect(button('Přiřadit dárci Jana Nováková').disabled).toBe(false);

      button('Přiřadit dárci Jana Nováková').click();
      await settle();
      const pairing = http.expectOne(`/api/admin/donations/payments/${PAYMENT_ID}/pair`);
      expect(pairing.request.body).toEqual({ donorId: '01a18e56-bdb0-775a-bd0a-a60756831369' });
      expect(button('Přiřazujeme…').disabled).toBe(true);
      pairing.flush({ donationId: 'd1', changedYearlyReceipts: [] });
      await settle();
      await listResponds(paymentList([]));

      expect(document.querySelector('dialog')).toBeNull();
      expect(text('[role="status"]:not(:empty)')).toBe(
        'Platba 500 Kč z 10. 10. 2026 je přiřazena dárci Jana Nováková.',
      );
      expect(document.activeElement).toBe(element('app-live-notice'));
      expect(text('.donor-link')).toBe('Otevřít kartu dárce Jana Nováková');
      expect(text('.admin-tabs')).toBe('Čekají na přiřazení Přiřazené');
    });

    it('then an empty search result says so and a refused pairing stays in the dialog with the reason', async () => {
      search('xyz');
      http.expectOne(`${DONORS_URL}?query=xyz`).flush({ items: [] });
      answerAccounts('xyz', []);
      await settle();
      expect(dialog().querySelector('[role="status"]:not(:empty)')?.textContent?.trim()).toBe(
        'Žádný dárce neodpovídá.',
      );

      search('jana');
      http.expectOne(`${DONORS_URL}?query=jana`).flush({ items: [foundDonor()] });
      answerAccounts('jana', [donorAccount()]);
      await settle();
      (dialog().querySelector('input[type="radio"]') as HTMLInputElement).click();
      await settle();
      button('Přiřadit dárci Jana Nováková').click();
      await settle();
      const refused = problem(
        409,
        'donations/bank-payment-already-paired',
        'Platba už je přiřazená',
        'Obnovte prosím seznam.',
      );
      http
        .expectOne(`/api/admin/donations/payments/${PAYMENT_ID}/pair`)
        .flush(refused.body, refused.options);
      await settle();

      expect(document.querySelector('dialog')).not.toBeNull();
      expect(dialog().querySelector('[role="alert"]:not(:empty)')?.textContent?.trim()).toBe(
        'Platba už je přiřazená. Obnovte prosím seznam.',
      );
    });

    it('when someone else changed the payment meanwhile, then the pairing names the version read, the sheet says so and reloading reads the list again', async () => {
      (dialog().querySelector('input[type="radio"]') as HTMLInputElement).click();
      await settle();
      button('Přiřadit dárci Jana Nováková').click();
      await settle();
      const pairing = http.expectOne(`/api/admin/donations/payments/${PAYMENT_ID}/pair`);
      expect(pairing.request.headers.get('If-Match')).toBe(`"${unpairedPayment().version}"`);
      const refused = problem(
        409,
        'donations/changed-meanwhile',
        'Mezitím se to změnilo',
        'Platbu mezitím změnil někdo jiný.',
      );
      pairing.flush(
        { ...refused.body, version: '1b2c3d4e5f607182', current: { id: PAYMENT_ID } },
        refused.options,
      );
      await settle();

      const sheet = document.querySelector('dialog');
      expect(sheet?.querySelector('h2')?.textContent?.trim()).toBe('Mezitím se to změnilo');
      expect(sheet?.textContent).toContain('Vaši změnu jsme proto neprovedli');
      expect(sheet?.querySelector('.pair-result')).toBeNull();

      button('Načíst aktuální stav').click();
      await settle();
      await listResponds(paymentList([]));

      expect(document.querySelector('dialog')).toBeNull();
      expect(text('[role="alert"]:not(:empty)')).toBe('');
      expect(text('[role="status"]:not(:empty)')).toBe(
        'Načetli jsme aktuální stav plateb. Zkontrolujte platbu a rozhodněte znovu.',
      );
      expect(document.activeElement).toBe(element('app-live-notice'));
    });

    it('then two donors of the same name are told apart by their e-mails', async () => {
      search('marko');
      http.expectOne(`${DONORS_URL}?query=marko`).flush({
        items: [
          foundDonor({ donorId: 'd-1', name: 'Lucie Marková', variableSymbol: '4821937560' }),
          foundDonor({ donorId: 'd-2', name: 'Lucie Marková', variableSymbol: '7310945528' }),
        ],
      });
      answerAccounts('marko', [
        donorAccount({ donorId: 'd-2', name: 'Lucie Marková', email: 'lm1958@example.cz' }),
        donorAccount({ donorId: 'd-1', name: 'Lucie Marková', email: 'lucie@example.cz' }),
      ]);
      await settle();

      expect(Array.from(dialog().querySelectorAll('.pair-result')).map(rowText)).toEqual([
        'Lucie Marková VS 4821937560 · lucie@example.cz',
        'Lucie Marková VS 7310945528 · lm1958@example.cz',
      ]);
    });

    it('then closing the dialog returns focus to the pairing button', async () => {
      button('Zavřít').click();
      await settle();

      expect(document.querySelector('dialog')).toBeNull();
      expect(document.activeElement?.textContent?.trim()).toBe('Přiřadit dárci');
    });
  });

  describe('when the administrator opens the pairing dialog for a 1 Kč account verification', () => {
    beforeEach(async () => {
      await open();
      await listResponds(
        paymentList([
          unpairedPayment({
            amountMinor: 100,
            counterpartyName: 'Marková Lucie',
            variableSymbol: null,
            messageForRecipient: 'Ověření účtu Nadační fond Nová naděje',
            accountVerification: true,
          }),
        ]),
      );
      button('Přiřadit dárci').click();
      await settle();
      http.expectOne((request) => request.url === DONORS_URL).flush({ items: [] });
      http
        .expectOne((request) => request.url === ACCOUNTS_URL)
        .flush({ items: [], hasMore: false });
      await settle();
    });

    it('then the dialog says it is an account verification and that pairing it by hand verifies no account', () => {
      const dialog = document.querySelector('dialog') as HTMLElement;

      expect(rowText(dialog.querySelector('.pair-payment dd') as HTMLElement)).toBe(
        '1 Kč z 10. 10. 2026 Ověření účtu',
      );
      expect(rowText(dialog.querySelector('.pair-verification') as HTMLElement)).toBe(
        'Touto platbou si dárce ověřuje bankovní účet. Když ji přiřadíte ručně, dárci se započítá 1 Kč, ale účet ověřený nebude; ten ověří až platba s jeho variabilním symbolem.',
      );
    });
  });

  describe('when the administrator searches and narrows the period', () => {
    function type(selector: string, value: string): void {
      const input = element<HTMLInputElement>(selector);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    function choose(selector: string, value: string): void {
      const input = element<HTMLInputElement>(selector);
      input.value = value;
      input.dispatchEvent(new Event('change'));
    }

    it('then a typed text is asked for once the typing pauses, kept in the address and the count is announced', async () => {
      await open();
      await listResponds(paymentList([unpairedPayment()]));
      expect(text('.payments-count')).toBe('');

      vi.useFakeTimers();
      type('#payments-search', 'nov');
      vi.advanceTimersByTime(299);
      http.expectNone((request) => request.url === PAYMENTS_URL);
      vi.advanceTimersByTime(1);
      vi.useRealTimers();
      await settle();

      await listResponds(
        paymentList([unpairedPayment(), unpairedPayment({ id: 'p2' })], { total: 2 }),
        'pairing=unpaired&query=nov&limit=50',
      );
      expect(url()).toBe('/sprava/platby?q=nov');
      expect(element<HTMLInputElement>('#payments-search').value).toBe('nov');
      expect(element('.payments-count').getAttribute('role')).toBe('status');
      expect(text('.payments-count')).toBe('Nalezeny 2 platby.');
      expect(text('.admin-tabs')).toBe('Čekají na přiřazení (1) Přiřazené');
    });

    it('then the dates bound the list at once and an empty result offers to clear the filter, which lists everything again', async () => {
      await open();
      await listResponds(paymentList([unpairedPayment()]));

      choose('#payments-from', '2026-10-01');
      await settle();
      await listResponds(
        paymentList([unpairedPayment()]),
        'pairing=unpaired&from=2026-10-01&limit=50',
      );
      choose('#payments-to', '2026-10-05');
      await settle();
      await listResponds(
        paymentList([]),
        'pairing=unpaired&from=2026-10-01&to=2026-10-05&limit=50',
      );

      expect(url()).toBe('/sprava/platby?od=2026-10-01&do=2026-10-05');
      expect(text('.payments-count')).toBe('Nenalezena žádná platba.');
      expect(text('.ui-card__empty')).toContain('Žádná platba neodpovídá hledání.');

      button('Zrušit filtr').click();
      await settle();
      await listResponds(paymentList([unpairedPayment()]));

      expect(url()).toBe('/sprava/platby');
      expect(element<HTMLInputElement>('#payments-from').value).toBe('');
      expect(element<HTMLInputElement>('#payments-to').value).toBe('');
      expect(document.activeElement).toBe(element('#payments-search'));
      expect(rows()).toHaveLength(1);
    });

    it('then a shared address opens the same tab, text and period', async () => {
      await open('/sprava/platby?stav=prirazene&q=jana&od=2026-01-01&do=2026-03-31');

      await listResponds(
        paymentList([unpairedPayment({ donation: pairedDonation() })]),
        'pairing=paired&query=jana&from=2026-01-01&to=2026-03-31&limit=50',
      );

      expect(element<HTMLInputElement>('#payments-search').value).toBe('jana');
      expect(element<HTMLInputElement>('#payments-from').value).toBe('2026-01-01');
      expect(element<HTMLInputElement>('#payments-to').value).toBe('2026-03-31');
      expect(element('.admin-tab.is-active').textContent?.trim()).toBe('Přiřazené');
      expect(text('.payments-count')).toBe('Nalezena 1 platba.');
    });
  });

  describe('when more payments match than one page holds', () => {
    beforeEach(async () => {
      await open('/sprava/platby?stav=prirazene');
      await listResponds(
        paymentList(
          Array.from({ length: 50 }, (_, index) =>
            unpairedPayment({ id: `p${index}`, donation: pairedDonation({ id: `d${index}` }) }),
          ),
          { total: 51 },
        ),
        PAIRED_PAGE,
      );
    });

    it('then "Načíst další" asks for the next page, appends it and moves focus to its first row', async () => {
      expect(text('.payments-more')).toContain('Zobrazeno 50 z 51.');

      button('Načíst další').click();
      await settle();
      expect(button('Načítáme další…').disabled).toBe(true);
      await listResponds(
        paymentList(
          [unpairedPayment({ id: 'p50', bookedOn: '2026-01-02', donation: pairedDonation() })],
          { total: 51 },
        ),
        'pairing=paired&offset=50&limit=50',
      );

      expect(rows()).toHaveLength(51);
      expect(document.activeElement).toBe(fixture.nativeElement.querySelectorAll('tbody tr')[50]);
      expect(fixture.nativeElement.querySelector('.payments-more button')).toBeNull();
      expect(text('.payments-more')).toBe('');
    });

    it('then a live change while the next page loads is read only once that page has arrived', async () => {
      const live = TestBed.inject(LiveUpdates) as unknown as FakeLiveUpdates;
      button('Načíst další').click();
      await settle();

      live.hint('payments');
      http.expectNone(`${PAYMENTS_URL}?${PAIRED_PAGE}`);

      await listResponds(
        paymentList(
          [unpairedPayment({ id: 'p50', bookedOn: '2026-01-02', donation: pairedDonation() })],
          { total: 51 },
        ),
        'pairing=paired&offset=50&limit=50',
      );
      http.expectOne(`${PAYMENTS_URL}?${PAIRED_PAGE}`);
    });

    it('then a failed next page says so and keeps the button for another try', async () => {
      button('Načíst další').click();
      await settle();
      http
        .expectOne(`${PAYMENTS_URL}?pairing=paired&offset=50&limit=50`)
        .flush({}, { status: 500, statusText: 'Error' });
      await settle();

      expect(text('.payments-more [role="alert"]')).toBe(
        'Další platby se nepodařilo načíst. Zkuste to prosím znovu.',
      );
      expect(button('Načíst další').disabled).toBe(false);
      expect(rows()).toHaveLength(50);
    });
  });

  describe('when the page opens with one donor from the donor card', () => {
    beforeEach(async () => {
      await open('/sprava/platby?stav=prirazene&darce=01a18e56-bdb0-775a-bd0a-a60756831369');
      await listResponds(
        paymentList([unpairedPayment({ donation: pairedDonation() })]),
        'pairing=paired&donorId=01a18e56-bdb0-775a-bd0a-a60756831369&limit=50',
      );
    });

    it('then only that donor is listed, named, and the donor filter can be dropped', async () => {
      expect(text('.payments-donor')).toContain('Jen platby dárce Jana Nováková.');
      expect(text('.payments-count')).toBe('Nalezena 1 platba.');

      button('Zobrazit platby všech dárců').click();
      await settle();
      await listResponds(paymentList([]), PAIRED_PAGE);

      expect(url()).toBe('/sprava/platby?stav=prirazene');
      expect(fixture.nativeElement.querySelector('.payments-donor')).toBeNull();
    });

    it('then switching to the payments waiting for a donor drops the donor filter', async () => {
      button('Čekají na přiřazení').click();
      await settle();
      await listResponds(paymentList([]));

      expect(url()).toBe('/sprava/platby');
    });
  });
});

describe('Given an administrator on the bank payments page where lists show as rows', () => {
  let fixture: ComponentFixture<unknown>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminPayments],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: 'sprava/platby', component: AdminPayments }]),
        {
          provide: CompactLayout,
          useValue: {
            isCompact: signal(true).asReadonly(),
            listsAsRows: signal(true).asReadonly(),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('admin@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    const harness = await RouterTestingHarness.create('/sprava/platby');
    fixture = harness.fixture;
    await settle();
  });

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function listResponds(body: object, params = FIRST_PAGE): Promise<void> {
    http.expectOne(`${PAYMENTS_URL}?${params}`).flush(body);
    await settle();
  }

  function spaced(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    return Array.from(node.childNodes).map(spaced).join(' ');
  }

  function text(node: Element | null): string {
    return (node === null ? '' : spaced(node)).replace(/\s+/g, ' ').trim();
  }

  function paymentRows(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button.payment-row'));
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(document.querySelectorAll('button')).find(
      (candidate) => text(candidate) === name,
    );
    if (!found) {
      throw new Error(`No button "${name}"`);
    }
    return found;
  }

  function sheet(): HTMLDialogElement {
    const found = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (!found) {
      throw new Error('No open dialog');
    }
    return found;
  }

  it('when unpaired payments arrive, then they stand as rows under the heading of their month, newest first, with no table', async () => {
    await listResponds(
      paymentList([
        unpairedPayment({
          id: 'p1',
          bookedOn: '2026-10-12',
          unpairedByAdminAt: '2026-10-18T08:00:00Z',
        }),
        unpairedPayment({ id: 'p2', counterpartyName: null, variableSymbol: null }),
        unpairedPayment({
          id: 'p3',
          bookedOn: '2026-09-30',
          amountMinor: 25050,
          accountVerification: true,
        }),
      ]),
    );

    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    const months = Array.from(
      fixture.nativeElement.querySelectorAll('.payments-month') as NodeListOf<HTMLElement>,
    );
    expect(months.map((month) => text(month.querySelector('h3')))).toEqual([
      'Říjen 2026',
      'Září 2026',
    ]);
    expect(months[0].querySelector('h3')?.id).toBe('payments-month-2026-10');
    expect(paymentRows().map((row) => text(row))).toEqual([
      'Nováková Jana 12. 10. 2026 · VS 1111111111 500 Kč jen ručně',
      'Bez jména odesílatele 10. 10. 2026 · bez VS 500 Kč',
      'Nováková Jana 30. 9. 2026 · VS 1111111111 250,50 Kč Ověření účtu',
    ]);
    expect(paymentRows()[0].getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('when an unpaired row is pressed, then the pairing dialog opens for that payment', async () => {
    await listResponds(paymentList([unpairedPayment()]));

    paymentRows()[0].click();
    await settle();
    http.expectOne((request) => request.url === DONORS_URL).flush({ items: [] });
    http.expectOne((request) => request.url === ACCOUNTS_URL).flush({ items: [], hasMore: false });
    await settle();

    expect(text(sheet().querySelector('h2'))).toBe('Přiřadit platbu dárci');
  });

  describe('when the administrator opens a paired payment', () => {
    async function openPaired(payment = unpairedPayment({ donation: pairedDonation() })) {
      await listResponds(paymentList([unpairedPayment()]));
      button('Přiřazené').click();
      await settle();
      await listResponds(paymentList([payment], { availableYears: [2026] }), PAIRED_PAGE);
      paymentRows()[0].click();
      await settle();
    }

    it('then its row names the donor and a sheet shows the payment, the donor with a link and the method', async () => {
      await listResponds(paymentList([unpairedPayment()]));
      button('Přiřazené').click();
      await settle();
      await listResponds(
        paymentList(
          [
            unpairedPayment({ donation: pairedDonation() }),
            unpairedPayment({
              id: 'p2',
              donation: pairedDonation({ id: 'd2', donorName: null, status: 'REFUNDED' }),
            }),
          ],
          { availableYears: [2026] },
        ),
        PAIRED_PAGE,
      );

      expect(paymentRows().map((row) => text(row))).toEqual([
        'Nováková Jana 10. 10. 2026 · VS 1111111111 · dárce Jana Nováková 500 Kč',
        'Nováková Jana 10. 10. 2026 · VS 1111111111 · dárce bez záznamu 500 Kč vráceno',
      ]);
      paymentRows()[0].click();
      await settle();

      expect(text(sheet().querySelector('h2'))).toBe('Přiřazená platba');
      expect(text(sheet().querySelector('.pair-payment'))).toContain(
        'Dárce Jana Nováková podle variabilního symbolu',
      );
      expect(text(sheet().querySelector('.pair-payment'))).toContain('2900233333/2010 · Fio banka');
      expect(sheet().querySelector('.pair-payment a')?.getAttribute('href')).toBe(
        '/sprava/darci/01a18e56-bdb0-775a-bd0a-a60756831369',
      );
    });

    it('then a gift with an issued receipt cannot be unpaired from the sheet', async () => {
      await openPaired(unpairedPayment({ donation: pairedDonation({ receiptIssued: true }) }));

      expect(text(sheet().querySelector('.sheet-actions'))).toBe(
        'Nelze zrušit, k daru je vystavené potvrzení.',
      );
    });

    it('then unpairing from the sheet asks first, posts once confirmed, closes the sheet and reloads', async () => {
      await openPaired();

      button('Zrušit přiřazení').click();
      await settle();
      expect(text(sheet().querySelector('.confirm-question'))).toContain('Zrušit přiřazení?');
      http.expectNone(`/api/admin/donations/payments/${PAYMENT_ID}/unpair`);

      sheet().querySelector<HTMLButtonElement>('.confirm .ui-button--danger')!.click();
      await settle();
      http
        .expectOne(`/api/admin/donations/payments/${PAYMENT_ID}/unpair`)
        .flush({ changedYearlyReceipts: [] });
      await settle();
      await listResponds(paymentList([], { availableYears: [] }), PAIRED_PAGE);

      expect(document.querySelector('dialog[open]')).toBeNull();
      expect(text(fixture.nativeElement.querySelector('[role="status"]:not(:empty)'))).toContain(
        'Platba 500 Kč z 10. 10. 2026 už není přiřazena.',
      );
    });

    it('then a refused unpairing keeps the sheet open and says why inside it', async () => {
      await openPaired();

      button('Zrušit přiřazení').click();
      await settle();
      sheet().querySelector<HTMLButtonElement>('.confirm .ui-button--danger')!.click();
      await settle();
      http
        .expectOne(`/api/admin/donations/payments/${PAYMENT_ID}/unpair`)
        .flush(null, { status: 500, statusText: 'Error' });
      await settle();

      expect(document.querySelector('dialog[open]')).toBe(sheet());
      expect(text(sheet().querySelector('.sheet-actions [role="alert"]'))).toBe(
        'Přiřazení se nepodařilo zrušit. Zkuste to prosím znovu.',
      );
      expect(sheet().querySelector('.confirm')).toBeNull();
    });

    it('then a live change waits while the sheet is open and is read once it closes', async () => {
      await openPaired();
      const live = TestBed.inject(LiveUpdates) as unknown as FakeLiveUpdates;

      live.hint('payments');
      http.expectNone(`${PAYMENTS_URL}?${PAIRED_PAGE}`);
      sheet().querySelector<HTMLButtonElement>('[aria-label="Zavřít"]')!.click();
      await settle();
      await listResponds(paymentList([], { availableYears: [] }), PAIRED_PAGE);

      expect(document.querySelector('dialog[open]')).toBeNull();
    });
  });
});

describe('Given an administrator on the bank payments page with the administration copy on the device', () => {
  let fixture: ComponentFixture<unknown>;
  let http: HttpTestingController;
  let refresh: ReturnType<typeof vi.fn<(startingNow?: boolean) => Promise<string>>>;
  const payment = unpairedPayment();
  const record = {
    donorId: '01a18e56-bdb0-775a-bd0a-a60756831369',
    name: 'Jana Nováková',
    type: 'PERSON',
    variableSymbol: '4821937560',
    companyIdentifier: null,
    address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
    preferredLocale: 'cs',
    registeredAt: '2026-01-15T10:00:00Z',
    erasedAt: null,
  };
  const paymentRow = Object.fromEntries(
    Object.entries(payment).filter(([field]) => field !== 'donation'),
  );

  async function openPage(deviceOffline: boolean): Promise<void> {
    localStorage.clear();
    refresh = vi.fn<(startingNow?: boolean) => Promise<string>>().mockResolvedValue('unchanged');
    const contents: CopyContents = {
      chunks: [
        { id: 'donations/payments:2026-10', rowsSha256: 'a', rows: [paymentRow] },
        { id: 'donations/donor-records:2026-01', rowsSha256: 'b', rows: [record] },
      ],
      summary: { donations: { today: '2026-10-20', byYear: [], receiptsAvailableFrom: 2026 } },
      storedAt: '2026-10-20T10:30:00.000Z',
    };
    const opened: OpenedCopy = {
      store: {
        copyId: 'copy-1',
        contents: signal(contents).asReadonly(),
      } as unknown as AccountStore,
      reason: 'unlocked',
      account: { email: 'admin@example.cz', userHandle: 'h', administrator: true },
    };
    await TestBed.configureTestingModule({
      imports: [AdminPayments],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: 'sprava/platby', component: AdminPayments }]),
        { provide: DeviceVault, useValue: { administration: signal(opened).asReadonly() } },
        { provide: Connectivity, useValue: { offline: signal(deviceOffline).asReadonly() } },
        {
          provide: AdministrationCopyDownload,
          useValue: {
            refresh,
            checkedAt: signal<string | null>(null).asReadonly(),
            writesAtStart: () => null,
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(AuthStore);
    store.login('admin@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    const harness = await RouterTestingHarness.create('/sprava/platby');
    fixture = harness.fixture;
    await settle();
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  afterEach(() => http.verify());

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(document.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );
    if (!found) {
      throw new Error(`No button "${name}"`);
    }
    return found;
  }

  describe('when the device is offline', () => {
    beforeEach(() => openPage(true));

    it('when the page opens, then it lists the payments of the copy without asking the server and gives the offline label the time of the copy', () => {
      expect(text('tbody tr')).toContain('500 Kč');
      expect(text('tbody tr')).toContain('Nováková Jana');
      expect(TestBed.inject(ShownAnswers).oldest()).toBe(Date.parse('2026-10-20T10:30:00.000Z'));
    });

    it('when a payment is to be paired, then the donor is found in the copy and pairing needs a connection', async () => {
      button('Přiřadit dárci').click();
      await fixture.whenStable();
      fixture.detectChanges();

      const dialog = document.querySelector('dialog[open]') as HTMLDialogElement;
      expect(dialog.querySelector('.pair-result')?.textContent).toContain('Jana Nováková');
      (dialog.querySelector('input[type="radio"]') as HTMLInputElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      const pair = button('Přiřadit dárci Jana Nováková');
      expect(pair.getAttribute('aria-disabled')).toBe('true');
      pair.click();
      http.expectNone((request) => request.url.endsWith('/pair'));
    });
  });

  describe('when the device is online', () => {
    beforeEach(() => openPage(false));
    afterEach(() => vi.restoreAllMocks());

    function halfAMinuteLater(): void {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + FORCED_REFRESH_GAP_MS);
    }

    it('then the page refreshes the copy once and lists the payments from it', () => {
      expect(text('tbody tr')).toContain('Nováková Jana');
      expect(refresh.mock.calls).toEqual([[false]]);
    });

    it('and the live stream says the payments changed, then the copy is refreshed by a refresh that starts after the change', async () => {
      halfAMinuteLater();
      (TestBed.inject(LiveUpdates) as unknown as FakeLiveUpdates).hint('payments');
      await settle();

      expect(refresh.mock.calls).toEqual([[false], [true]]);
    });

    it('and a payment is paired, then the list is read again from a refresh that starts after the pairing', async () => {
      halfAMinuteLater();
      button('Přiřadit dárci').click();
      await settle();
      const dialog = document.querySelector('dialog[open]') as HTMLDialogElement;
      (dialog.querySelector('input[type="radio"]') as HTMLInputElement).click();
      await settle();
      button('Přiřadit dárci Jana Nováková').click();
      http
        .expectOne((request) => request.url.endsWith('/pair'))
        .flush({ donationId: 'd1', changedYearlyReceipts: [] });
      await settle();

      expect(refresh.mock.calls.at(-1)).toEqual([true]);
    });

    it('and a payment is paired less than half a minute after the copy was refreshed, then the list is read again from the server, without another refresh', async () => {
      button('Přiřadit dárci').click();
      await settle();
      const dialog = document.querySelector('dialog[open]') as HTMLDialogElement;
      (dialog.querySelector('input[type="radio"]') as HTMLInputElement).click();
      await settle();
      button('Přiřadit dárci Jana Nováková').click();
      http
        .expectOne((request) => request.url.endsWith('/pair'))
        .flush({ donationId: 'd1', changedYearlyReceipts: [] });
      await settle();
      const fromServer = http.match((request) => request.url === '/api/admin/donations/payments');
      fromServer.forEach((request) =>
        request.flush({ year: null, availableYears: [], items: [], total: 0 }),
      );
      await settle();

      expect(fromServer.length).toBeGreaterThan(0);
      expect(refresh.mock.calls).toEqual([[false]]);
    });

    it('and someone else changed the payment meanwhile, then reloading reads the list from a refresh that starts after the refusal', async () => {
      button('Přiřadit dárci').click();
      await settle();
      const dialog = document.querySelector('dialog[open]') as HTMLDialogElement;
      (dialog.querySelector('input[type="radio"]') as HTMLInputElement).click();
      await settle();
      button('Přiřadit dárci Jana Nováková').click();
      const refused = problem(
        409,
        'donations/changed-meanwhile',
        'Mezitím se to změnilo',
        'Platbu mezitím změnil někdo jiný.',
      );
      http
        .expectOne((request) => request.url.endsWith('/pair'))
        .flush({ ...refused.body, version: '1b2c3d4e5f607182' }, refused.options);
      await settle();
      const callsBefore = refresh.mock.calls.length;
      halfAMinuteLater();

      button('Načíst aktuální stav').click();
      await settle();

      expect(refresh.mock.calls.slice(callsBefore)).toEqual([[true]]);
    });
  });
});
