import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import {
  adminBankAccount,
  adminReceipt,
  donorAccount,
  donorDetail,
} from '../testing/admin-fixtures';
import { AdminDonorDetail } from './admin-donor-detail';

const DONOR_ID = '01a18e56-bdb0-775a-bd0a-a60756831369';
const LINK_ID = '0192f0c4-0000-7000-8000-000000000001';
const ACCOUNT_URL = `/api/admin/donors/${DONOR_ID}`;
const DETAIL_URL = `/api/admin/donations/donors/${DONOR_ID}`;
const LINK_URL = `${DETAIL_URL}/bank-accounts/${LINK_ID}`;

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

describe('Given an administrator on a donor card', () => {
  let fixture: ComponentFixture<AdminDonorDetail>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminDonorDetail],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: DONOR_ID }) } },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminDonorDetail);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function texts(selector: string): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>,
    ).map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  function section(title: string): HTMLElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll('section.admin-card') as NodeListOf<HTMLElement>,
    ).find((candidate) => candidate.querySelector('h2')?.textContent?.trim() === title);
    if (found === undefined) {
      throw new Error(`No card "${title}"`);
    }
    return found;
  }

  function sectionText(title: string): string {
    return (section(title).textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function accountFacts(): string {
    return Array.from(section('Účet dárce').querySelectorAll('dl > div'))
      .map((row) =>
        Array.from(row.children)
          .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
          .join(' '),
      )
      .join(' | ');
  }

  function button(root: HTMLElement, name: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );
    if (found === undefined) {
      throw new Error(`No button "${name}" in "${root.textContent?.replace(/\s+/g, ' ').trim()}"`);
    }
    return found;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function loaded(account = donorAccount(), detail = donorDetail()): Promise<void> {
    http.expectOne(ACCOUNT_URL).flush(account);
    http.expectOne(DETAIL_URL).flush(detail);
    await settle();
  }

  it('when both parts arrive, then the name heads the page and the account card shows every fact', async () => {
    expect(texts('[role="status"]')).toEqual([
      'Načítáme účet…',
      'Načítáme účty, dary a potvrzení…',
    ]);

    await loaded(donorAccount({ administrator: true, secondFactorEnabled: true }));

    expect(text('h1')).toBe('Jana Nováková');
    const account = accountFacts();
    expect(account).toContain('Typ Osoba');
    expect(account).toContain('E-mail jana@example.cz ověřen');
    expect(account).toContain('Adresa Dlouhá 12, 400 01 Ústí nad Labem');
    expect(account).toContain('Variabilní symbol 4821937560');
    expect(account).toContain('Jazyk čeština');
    expect(account).toContain('Registrace 17. 10. 2026 10:00');
    expect(account).toContain('Role správce');
    expect(account).toContain('Dvoufaktorové ověření zapnuté');
    expect(button(section('Účet dárce'), 'Vypnout dvoufaktorové ověření')).toBeTruthy();
  });

  it('when the donor is a company without the second factor, then the card names the company and offers no reset', async () => {
    await loaded(
      donorAccount({
        type: 'COMPANY',
        name: 'Stavby Novák s.r.o.',
        companyIdentifier: '45274649',
        emailVerified: false,
      }),
    );

    const account = accountFacts();
    expect(account).toContain('Typ Firma · IČO 45274649');
    expect(account).toContain('neověřen');
    expect(account).toContain('Role dárce');
    expect(account).toContain('Dvoufaktorové ověření vypnuté');
    expect(section('Účet dárce').querySelectorAll('button')).toHaveLength(0);
  });

  it('when the donations part arrives, then the bank accounts, donations and receipts cards list it', async () => {
    await loaded();

    const accounts = section('Bankovní účty');
    const accountRow = accounts.querySelector('tbody tr') as HTMLElement;
    const accountText = (accountRow.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(accountText).toContain('2900233333/2010');
    expect(accountText).toContain('Páruje platby');
    expect(accountText).toContain('ověřen 17. 10. 2026');
    expect(accountText).toContain('2 dary');
    expect(accountText).toContain('celkem 500 Kč');
    expect(accountText).toContain('poslední 12. 10. 2026');
    expect(button(accountRow, 'Vypnout párování')).toBeTruthy();
    expect(button(accountRow, 'Odebrat účet')).toBeTruthy();

    const donations = sectionText('Dary');
    expect(donations).toContain('Celkem 2 dary za 800 Kč.');
    expect(donations).toContain('12. 10. 2026');
    expect(donations).toContain('300 Kč');
    expect(donations).toContain('podle účtu 2900233333/2010');
    expect(donations).toContain('zatím žádné');
    expect(donations).toContain('podle variabilního symbolu');
    expect(donations).toContain('2026-000001');

    const receipts = sectionText('Vydaná potvrzení');
    expect(receipts).toContain('2026-000001');
    expect(receipts).toContain('Dar z 10. 10. 2026');
    expect(receipts).toContain('17. 10. 2026 11:00 CZ');
    expect(receipts).toContain('platné');
  });

  it('when the donor has no accounts, donations or receipts, then each card says so', async () => {
    await loaded(
      donorAccount(),
      donorDetail({
        bankAccounts: [],
        donations: { items: [], totalAmountMinor: 0, currency: 'CZK', count: 0 },
        receipts: [],
      }),
    );

    expect(sectionText('Bankovní účty')).toContain(
      'Z žádného účtu zatím nepřišla platba s variabilním symbolem dárce.',
    );
    expect(sectionText('Dary')).toContain('Dárce zatím nemá žádný přiřazený dar.');
    expect(sectionText('Vydaná potvrzení')).toContain('Dárce si zatím žádné potvrzení nestáhl.');
  });

  it('when a yearly receipt was replaced, then the receipts card names the year and the replacement', async () => {
    await loaded(
      donorAccount(),
      donorDetail({
        receipts: [
          adminReceipt({
            kind: 'YEARLY',
            donationId: null,
            donationReceivedOn: null,
            year: 2025,
            locale: 'en',
            active: false,
          }),
        ],
      }),
    );

    const receipts = sectionText('Vydaná potvrzení');
    expect(receipts).toContain('Rok 2025');
    expect(receipts).toContain('EN');
    expect(receipts).toContain('nahrazeno novějším');
  });

  it('when the second factor is turned off after the confirmation, then the account reloads and the status says what happened', async () => {
    await loaded(donorAccount({ secondFactorEnabled: true }));

    button(section('Účet dárce'), 'Vypnout dvoufaktorové ověření').click();
    fixture.detectChanges();
    expect(sectionText('Účet dárce')).toContain('Dárce se pak přihlásí jen heslem');
    button(section('Účet dárce'), 'Ano, vypnout').click();
    fixture.detectChanges();

    const request = http.expectOne(`/api/admin/donors/${DONOR_ID}/second-factor/reset`);
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(text('.admin-notice--status')).toBe(
      'Dvoufaktorové ověření u Jana Nováková je vypnuté a všechna přihlášení jsme ukončili. Dárce dostal e-mail; po přihlášení heslem si ho může zapnout znovu.',
    );
    http.expectOne(ACCOUNT_URL).flush(donorAccount());
    await settle();
    expect(accountFacts()).toContain('Dvoufaktorové ověření vypnuté');
    expect(section('Účet dárce').querySelectorAll('button')).toHaveLength(0);
  });

  it('when the pairing is turned off and on again, then each asks for a confirmation, posts and reloads the donations part', async () => {
    await loaded();
    const accounts = section('Bankovní účty');

    button(accounts, 'Vypnout párování').click();
    fixture.detectChanges();
    expect(sectionText('Bankovní účty')).toContain('Dosavadní dary zůstanou');
    button(accounts, 'Ano, vypnout').click();
    fixture.detectChanges();
    const disconnect = http.expectOne(`${LINK_URL}/disconnect`);
    expect(disconnect.request.method).toBe('POST');
    disconnect.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(text('.admin-notice--status')).toBe(
      'Párování z účtu 2900233333/2010 je vypnuté: platby bez symbolu z něj už dárci nepřiřadíme, dosavadní dary zůstávají.',
    );
    http.expectOne(DETAIL_URL).flush(
      donorDetail({
        bankAccounts: [adminBankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-10-22' })],
      }),
    );
    await settle();
    expect(sectionText('Bankovní účty')).toContain('Párování vypnuté');
    expect(sectionText('Bankovní účty')).toContain('vypnuto 22. 10. 2026');

    button(section('Bankovní účty'), 'Zapnout párování').click();
    fixture.detectChanges();
    button(section('Bankovní účty'), 'Ano, zapnout').click();
    fixture.detectChanges();
    const reconnect = http.expectOne(`${LINK_URL}/reconnect`);
    expect(reconnect.request.method).toBe('POST');
    reconnect.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(text('.admin-notice--status')).toBe(
      'Párování z účtu 2900233333/2010 zase zapneme, jakmile z něj přijde platba s variabilním symbolem dárce.',
    );
    http.expectOne(DETAIL_URL).flush(donorDetail());
    await settle();
  });

  it('when the account is removed after the confirmation, then the request is a DELETE and the status names the deleted donations', async () => {
    await loaded();

    button(section('Bankovní účty'), 'Odebrat účet').click();
    fixture.detectChanges();
    expect(sectionText('Bankovní účty')).toContain(
      'Smažeme 2 dary přiřazené přes tento účet i odpovědi o starších symbolech; platby zůstanou nespárované. Odebrat?',
    );
    button(section('Bankovní účty'), 'Ano, odebrat').click();
    fixture.detectChanges();

    const request = http.expectOne(LINK_URL);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(text('.admin-notice--status')).toBe(
      'Účet 2900233333/2010 jsme dárci odebrali: 2 dary přiřazené přes něj jsme smazali a platby jsou zase nespárované.',
    );
    http.expectOne(DETAIL_URL).flush(donorDetail({ bankAccounts: [] }));
    await settle();
    expect(sectionText('Bankovní účty')).toContain('Z žádného účtu zatím nepřišla platba');
  });

  it('when "Ne" answers a confirmation, then nothing is sent and the buttons come back', async () => {
    await loaded();

    button(section('Bankovní účty'), 'Odebrat účet').click();
    fixture.detectChanges();
    button(section('Bankovní účty'), 'Ne').click();
    fixture.detectChanges();

    expect(sectionText('Bankovní účty')).not.toContain('Odebrat?');
    expect(button(section('Bankovní účty'), 'Odebrat účet')).toBeTruthy();
    http.expectNone(LINK_URL);
  });

  it('when the removal is refused because of a receipt, then the alert shows the backend title and detail and the account stays', async () => {
    await loaded();

    button(section('Bankovní účty'), 'Odebrat účet').click();
    fixture.detectChanges();
    button(section('Bankovní účty'), 'Ano, odebrat').click();
    fixture.detectChanges();
    const refusal = problem(
      409,
      'donations/bank-account-has-receipt',
      'Na dary z tohoto účtu odkazuje vydané potvrzení',
      'Účet nejde odebrat.',
    );
    http.expectOne(LINK_URL).flush(refusal.body, refusal.options);
    fixture.detectChanges();

    expect(text('.admin-notice--alert')).toBe(
      'Na dary z tohoto účtu odkazuje vydané potvrzení. Účet nejde odebrat.',
    );
    expect(button(section('Bankovní účty'), 'Odebrat účet')).toBeTruthy();
  });

  it('when the donor does not exist, then the account card says so and the donations card says the record is missing', async () => {
    const missing = problem(404, 'donors/donor-not-found', 'Dárce nenalezen', 'Není.');
    http.expectOne(ACCOUNT_URL).flush(missing.body, missing.options);
    const noRecord = problem(404, 'donations/donor-not-found', 'Dárce nenalezen', 'Není.');
    http.expectOne(DETAIL_URL).flush(noRecord.body, noRecord.options);
    await settle();

    expect(text('h1')).toBe('Dárce');
    expect(sectionText('Účet dárce')).toContain('Takový dárce není.');
    expect(sectionText('Bankovní účty')).toContain('Dárce nemá záznam v evidenci darů');
    expect(fixture.nativeElement.querySelectorAll('section.admin-card')).toHaveLength(2);
  });

  it('when a part cannot be loaded, then its card offers a retry that loads it again', async () => {
    http.expectOne(ACCOUNT_URL).flush(null, { status: 500, statusText: 'Error' });
    http.expectOne(DETAIL_URL).flush(donorDetail());
    await settle();

    expect(sectionText('Účet dárce')).toContain('Účet se nepodařilo načíst.');
    button(section('Účet dárce'), 'Zkusit znovu').click();
    fixture.detectChanges();
    http.expectOne(ACCOUNT_URL).flush(donorAccount());
    await settle();

    expect(text('h1')).toBe('Jana Nováková');
  });

  it('when the role was taken away meanwhile, then the page goes to the overview', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');

    http.expectOne(ACCOUNT_URL).flush(refusal.body, refusal.options);
    http.expectOne(DETAIL_URL).flush(refusal.body, refusal.options);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });
});
