import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import {
  foundDonor,
  pairedDonation,
  paymentList,
  unpairedPayment,
} from '../testing/admin-fixtures';
import { AdminPayments } from './admin-payments';

const PAYMENTS_URL = '/api/admin/donations/payments';
const DONORS_URL = '/api/admin/donations/donors';
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

describe('Given an administrator on the bank payments page', () => {
  let fixture: ComponentFixture<AdminPayments>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminPayments],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(AuthStore);
    store.login('admin@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminPayments);
    fixture.detectChanges();
  });

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

  async function listResponds(body: object, params = 'pairing=unpaired'): Promise<void> {
    http.expectOne(`${PAYMENTS_URL}?${params}`).flush(body);
    await settle();
  }

  it('when the page opens, then it asks for the unpaired payments with the token and says it is loading', () => {
    const request = http.expectOne(`${PAYMENTS_URL}?pairing=unpaired`);

    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(text('h1')).toBe('Platby z banky');
    expect(text('[role="status"]')).toBe('Načítáme platby…');
    request.flush(paymentList([]));
  });

  it('when there is nothing unpaired, then the page says so', async () => {
    await listResponds(paymentList([]));

    expect(text('.admin-empty')).toContain('Všechny platby z banky jsou přiřazené.');
  });

  it('when unpaired payments arrive, then each row shows date, amount, sender, symbol and message with a pairing button', async () => {
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
      '10. 10. 2026 500 Kč Nováková Jana 2900233333/2010 1111111111 Dar pro fond Přiřadit dárci',
      '12. 10. 2026 jen ručně 250,50 Kč — bez VS Přiřadit dárci',
    ]);
  });

  it('when the list cannot be loaded, then an alert offers a retry that asks again', async () => {
    http
      .expectOne(`${PAYMENTS_URL}?pairing=unpaired`)
      .flush({}, { status: 500, statusText: 'Error' });
    await settle();

    expect(text('[role="alert"]')).toContain('Platby se nepodařilo načíst.');

    button('Zkusit znovu').click();
    await listResponds(paymentList([]));

    expect(text('.admin-empty')).toContain('Všechny platby z banky jsou přiřazené.');
  });

  it('when the role was taken away, then the administrator lands on the donor overview', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const refused = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');
    http.expectOne(`${PAYMENTS_URL}?pairing=unpaired`).flush(refused.body, refused.options);
    await settle();

    expect(navigate).toHaveBeenCalledWith('/donor/prehled');
  });

  describe('when the administrator switches to the paired payments', () => {
    beforeEach(async () => {
      await listResponds(paymentList([unpairedPayment()]));
      button('Spárované').click();
      await settle();
    });

    it('then the newest year is shown with donor, method and receipt, other years can be chosen', async () => {
      await listResponds(
        paymentList(
          [
            unpairedPayment({
              donation: pairedDonation({ receiptIssued: true }),
            }),
            unpairedPayment({
              id: 'p2',
              bankTransactionId: 1002,
              bookedOn: '2026-09-01',
              donation: pairedDonation({ id: 'd2', donorName: null, pairedBy: 'MANUAL' }),
            }),
          ],
          { year: 2026, availableYears: [2026, 2025] },
        ),
        'pairing=paired',
      );

      expect(text('#payments-title')).toBe('Spárované platby 2026');
      expect(rows()[0]).toContain('Jana Nováková podle variabilního symbolu potvrzení vystaveno');
      expect(rows()[0]).toContain('Nelze zrušit, k daru je vystavené potvrzení.');
      expect(rows()[1]).toContain('dárce bez záznamu ručně správcem');
      expect(rows()[1]).toContain('Zrušit přiřazení');
      const years = Array.from(
        fixture.nativeElement.querySelectorAll(
          '.admin-year option',
        ) as NodeListOf<HTMLOptionElement>,
      ).map((option) => option.textContent?.trim());
      expect(years).toEqual(['2026', '2025']);

      const select = element<HTMLSelectElement>('.admin-year select');
      select.value = '2025';
      select.dispatchEvent(new Event('change'));
      await settle();
      await listResponds(
        paymentList([], { year: 2025, availableYears: [2026, 2025] }),
        'pairing=paired&year=2025',
      );

      expect(text('#payments-title')).toBe('Spárované platby 2025');
      expect(text('.admin-empty')).toBe('Zatím není přiřazena žádná platba.');
    });

    it('then unpairing asks for a confirmation, posts once confirmed, reports the yearly receipt and reloads', async () => {
      await listResponds(
        paymentList([unpairedPayment({ donation: pairedDonation() })], {
          year: 2026,
          availableYears: [2026],
        }),
        'pairing=paired',
      );

      button('Zrušit přiřazení').click();
      await settle();
      expect(text('.confirm')).toContain('Opravdu zrušit?');
      http.expectNone(`/api/admin/donations/payments/${PAYMENT_ID}/unpair`);

      button('Ne').click();
      await settle();
      expect(fixture.nativeElement.querySelector('.confirm')).toBeNull();

      button('Zrušit přiřazení').click();
      await settle();
      button('Ano, zrušit').click();
      await settle();
      const request = http.expectOne(`/api/admin/donations/payments/${PAYMENT_ID}/unpair`);
      expect(request.request.method).toBe('POST');
      request.flush({ changedYearlyReceipts: [2026] });
      await settle();
      await listResponds(paymentList([], { year: null, availableYears: [] }), 'pairing=paired');

      expect(text('[role="status"]')).toBe(
        'Platba 500 Kč z 10. 10. 2026 už není přiřazena. Automatické párování ji přeskočí; najdete ji mezi nespárovanými. Dárce si už stáhl roční potvrzení za 2026; při dalším stažení dostane nové. Dejte mu prosím vědět.',
      );
    });

    it('then a refused unpairing shows the backend reason as an alert', async () => {
      await listResponds(
        paymentList([unpairedPayment({ donation: pairedDonation() })], {
          year: 2026,
          availableYears: [2026],
        }),
        'pairing=paired',
      );
      button('Zrušit přiřazení').click();
      await settle();
      button('Ano, zrušit').click();
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

      expect(text('[role="alert"]')).toBe(
        'K daru už bylo vystaveno potvrzení. Dar s vystaveným potvrzením odpárovat nelze.',
      );
    });
  });

  describe('when the administrator opens the pairing dialog for a payment', () => {
    beforeEach(async () => {
      await listResponds(paymentList([unpairedPayment()]));
      const opener = button('Přiřadit dárci');
      opener.focus();
      opener.click();
      await settle();
    });

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

    it('then the dialog names the payment, focuses the search and offers nothing before typing', () => {
      expect(dialog().textContent).toContain('500 Kč z 10. 10. 2026');
      expect(dialog().textContent).toContain('Nováková Jana');
      expect(document.activeElement?.id).toBe('pair-search');
      expect(dialog().querySelector('.pair-results')).toBeNull();
      expect((button('Přiřadit') as HTMLButtonElement).disabled).toBe(true);
      http.expectNone((request) => request.url.startsWith(DONORS_URL));
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

      const results = Array.from(dialog().querySelectorAll('.pair-result')).map(rowText);
      expect(results).toEqual([
        'Jana Nováková VS 4821937560',
        'Acme s.r.o. VS 7310945528 · IČO 25596641',
      ]);
      expect((button('Přiřadit') as HTMLButtonElement).disabled).toBe(true);

      (dialog().querySelectorAll('input[type="radio"]')[0] as HTMLInputElement).click();
      await settle();
      expect((button('Přiřadit') as HTMLButtonElement).disabled).toBe(false);

      button('Přiřadit').click();
      await settle();
      const pairing = http.expectOne(`/api/admin/donations/payments/${PAYMENT_ID}/pair`);
      expect(pairing.request.body).toEqual({ donorId: '01a18e56-bdb0-775a-bd0a-a60756831369' });
      expect(button('Přiřazujeme…').disabled).toBe(true);
      pairing.flush({ donationId: 'd1', changedYearlyReceipts: [] });
      await settle();
      await listResponds(paymentList([]));

      expect(document.querySelector('dialog')).toBeNull();
      expect(text('[role="status"]')).toBe(
        'Platba 500 Kč z 10. 10. 2026 je přiřazena dárci Jana Nováková.',
      );
    });

    it('then an empty search result says so and a refused pairing stays in the dialog with the reason', async () => {
      search('xyz');
      http.expectOne(`${DONORS_URL}?query=xyz`).flush({ items: [] });
      await settle();
      expect(dialog().querySelector('[role="status"]')?.textContent?.trim()).toBe(
        'Žádný dárce neodpovídá.',
      );

      search('jana');
      http.expectOne(`${DONORS_URL}?query=jana`).flush({ items: [foundDonor()] });
      await settle();
      (dialog().querySelector('input[type="radio"]') as HTMLInputElement).click();
      await settle();
      button('Přiřadit').click();
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
      expect(dialog().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        'Platba už je přiřazená. Obnovte prosím seznam.',
      );
    });

    it('then closing the dialog returns focus to the pairing button', async () => {
      button('Zavřít').click();
      await settle();

      expect(document.querySelector('dialog')).toBeNull();
      expect(document.activeElement?.textContent?.trim()).toBe('Přiřadit dárci');
    });
  });
});
