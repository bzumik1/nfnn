import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import {
  adminBankAccount,
  adminDonation,
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
      fixture.nativeElement.querySelectorAll('section.ui-card') as NodeListOf<HTMLElement>,
    ).find((candidate) => candidate.querySelector('h2')?.textContent?.trim() === title);
    if (found === undefined) {
      throw new Error(`No card "${title}"`);
    }
    return found;
  }

  function sectionText(title: string): string {
    return (section(title).textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function facts(title: string): string {
    return Array.from(section(title).querySelectorAll('dl > div'))
      .map((row) =>
        Array.from(row.children)
          .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
          .join(' '),
      )
      .join(' | ');
  }

  function buttonNames(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll('button')).map(
      (candidate) => candidate.textContent?.trim() ?? '',
    );
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

  function eraseDialog(): HTMLDialogElement | null {
    return fixture.nativeElement.querySelector('dialog');
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
    expect(texts('[role="status"]:not(:empty)')).toEqual([
      'Načítáme účet…',
      'Načítáme účty, dary a potvrzení…',
    ]);

    await loaded(donorAccount({ administrator: true, secondFactorEnabled: true, passkeys: 2 }));

    expect(text('h1')).toBe('Jana Nováková');
    const account = facts('Údaje');
    expect(account).toContain('Typ Osoba');
    expect(account).toContain('E-mail jana@example.cz ověřen');
    expect(account).toContain('Adresa Dlouhá 12, 400 01 Ústí nad Labem');
    expect(account).toContain('Variabilní symbol 4821937560');
    expect(account).toContain('Jazyk čeština');
    expect(account).toContain('Registrace 17. 10. 2026 10:00');
    expect(account).toContain('Role správce');
    const signIn = facts('Přihlášení');
    expect(signIn).toContain('Dvoufaktorové ověření zapnuté');
    expect(signIn).toContain('Přístupové klíče 2');
    expect(buttonNames(section('Přihlášení'))).toEqual([
      'Vypnout dvoufaktorové ověření',
      'Odebrat přístupové klíče',
    ]);
  });

  it('when both parts arrive, then a summary on top shows the symbol to copy, the e-mail, the gifts and the badges', async () => {
    await loaded(donorAccount({ administrator: true, secondFactorEnabled: true }));

    const summary = fixture.nativeElement.querySelector('.donor-summary') as HTMLElement;
    expect(summary.getAttribute('aria-label')).toBe('Shrnutí dárce');
    const rows = Array.from(summary.querySelectorAll('dl > div')).map((row) =>
      Array.from(row.children)
        .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
        .join(' '),
    );
    expect(rows).toEqual([
      'VS 4821937560 Kopírovat variabilní symbol',
      'E-mail jana@example.cz ověřen',
      'Dary 2 dary za 800 Kč',
    ]);
    expect(texts('.donor-summary .badges .tag')).toEqual(['Správce', '2FA']);
    expect(text('.donor-summary app-copy-button button')).toBe('Kopírovat variabilní symbol');
  });

  it('when the card opens, then a list of links leads to each part and moves the focus there', async () => {
    await loaded();

    const nav = fixture.nativeElement.querySelector('nav.card-nav') as HTMLElement;
    expect(nav.getAttribute('aria-label')).toBe('Části karty dárce');
    const links = Array.from(nav.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Údaje',
      'Přihlášení',
      'Bankovní účty',
      'Dary',
      'Potvrzení',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/sprava/darci/${DONOR_ID}#udaje`,
      `/sprava/darci/${DONOR_ID}#prihlaseni`,
      `/sprava/darci/${DONOR_ID}#bankovni-ucty`,
      `/sprava/darci/${DONOR_ID}#dary`,
      `/sprava/darci/${DONOR_ID}#potvrzeni`,
    ]);

    links[3].click();
    await settle();

    expect(document.activeElement).toBe(section('Dary'));
    expect(section('Dary').id).toBe('dary');
    expect(section('Dary').getAttribute('tabindex')).toBe('-1');
  });

  it('when the donor is a plain donor, then the erasure card at the end offers the erasure with its hint', async () => {
    await loaded();

    const cards = texts('section.ui-card > h2');
    expect(cards[cards.length - 1]).toBe('Výmaz osobních údajů (GDPR)');
    expect(buttonNames(section('Výmaz osobních údajů (GDPR)'))).toEqual(['Vymazat osobní údaje']);
    expect(sectionText('Výmaz osobních údajů (GDPR)')).toContain(
      'Pro dárce, který požádal o výmaz podle GDPR.',
    );
    expect(fixture.nativeElement.querySelector('.admin-erased')).toBeNull();
    expect(eraseDialog()).toBeNull();
  });

  it('when the donor is an administrator, then the card explains the role has to go first and offers no erasure', async () => {
    await loaded(donorAccount({ administrator: true }));

    expect(sectionText('Výmaz osobních údajů (GDPR)')).toContain(
      'Správci nejde vymazat osobní údaje. Nejdřív mu odeberte roli správce na stránce Správci.',
    );
    expect(section('Výmaz osobních údajů (GDPR)').querySelectorAll('button')).toHaveLength(0);
  });

  it('when the erasure is opened, then a dialog names the donor, says what goes and what stays and keeps the button off until the check', async () => {
    await loaded();

    button(section('Výmaz osobních údajů (GDPR)'), 'Vymazat osobní údaje').click();
    await settle();

    const dialog = eraseDialog() as HTMLDialogElement;
    expect(text('dialog h2')).toBe('Vymazat osobní údaje: Jana Nováková');
    const dialogText = (dialog.textContent ?? '').replace(/\s+/g, ' ');
    expect(dialogText).toContain('Smažeme');
    expect(dialogText).toContain('jméno, adresu, e-mail a heslo');
    expect(dialogText).toContain('Zůstane');
    expect(dialogText).toContain('dary a vydaná potvrzení, bez jména');
    expect(dialogText).toContain('Dárce dostane na dosavadní e-mail potvrzení o výmazu.');
    expect(dialogText).toContain('Dárce o výmaz požádal a ověřil(a) jsem, že jde o majitele účtu');
    expect(document.activeElement).toBe(button(dialog, 'Zrušit'));
    expect(button(dialog, 'Vymazat osobní údaje').disabled).toBe(true);

    button(dialog, 'Zrušit').click();
    await settle();
    expect(eraseDialog()).toBeNull();
    http.expectNone(ACCOUNT_URL);
  });

  it('when the personal data are erased after the confirmation, then the request is a DELETE, both parts reload and the page shows the erased state', async () => {
    await loaded(donorAccount({ secondFactorEnabled: true }));

    button(section('Výmaz osobních údajů (GDPR)'), 'Vymazat osobní údaje').click();
    await settle();
    const check = eraseDialog()?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    check.click();
    fixture.detectChanges();
    button(eraseDialog() as HTMLElement, 'Vymazat osobní údaje').click();
    fixture.detectChanges();

    const request = http.expectOne(ACCOUNT_URL);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(eraseDialog()).toBeNull();
    const notice = section('Výmaz osobních údajů (GDPR)').querySelector(
      'app-live-notice',
    ) as HTMLElement;
    expect(text('.ui-notice--status')).toBe(
      'Osobní údaje dárce jsme vymazali a na jeho dosavadní e-mail poslali potvrzení. Účet už nejde použít; dary a vydaná potvrzení zůstávají bez jména.',
    );
    expect(document.activeElement).toBe(notice);
    const erased = donorAccount({
      name: 'Vymazaný dárce',
      email: 'erased-01a18e56-bdb0-775a-bd0a-a60756831369@erased.invalid',
      address: { street: 'Vymazáno', city: 'Vymazáno', postalCode: '00000' },
      emailVerified: false,
      erasedAt: '2026-10-23T09:00:00Z',
    });
    http.expectOne(ACCOUNT_URL).flush(erased);
    http.expectOne(DETAIL_URL).flush(
      donorDetail({
        donor: { ...donorDetail().donor, name: 'Vymazaný dárce', erasedAt: '2026-10-23T09:00:00Z' },
        bankAccounts: [],
      }),
    );
    await settle();

    expect(text('h1')).toBe('Vymazaný dárce');
    expect(text('.admin-erased')).toBe(
      'Osobní údaje tohoto dárce jsme vymazali 23. 10. 2026 11:00. Účet už nejde použít; dary a vydaná potvrzení zůstávají kvůli účetnictví, bez jména.',
    );
    expect(facts('Údaje')).toContain('E-mail vymazán |');
    expect(facts('Údaje')).toContain('Adresa vymazána');
    expect(facts('Údaje')).not.toContain('erased.invalid');
    expect(section('Přihlášení').querySelectorAll('button')).toHaveLength(0);
    expect(section('Výmaz osobních údajů (GDPR)').querySelectorAll('button')).toHaveLength(0);
    expect(sectionText('Výmaz osobních údajů (GDPR)')).toContain(
      'Osobní údaje tohoto dárce jsou vymazané.',
    );
    expect(document.activeElement).toBe(notice);
    expect(sectionText('Bankovní účty')).toContain(
      'Bankovní účty jsme s osobními údaji dárce smazali; další platby se mu už nepřiřadí.',
    );
    expect(sectionText('Dary')).toContain('2026-000001');
    expect(sectionText('Vydaná potvrzení')).toContain('2026-000001');
  });

  it('when the erasure is refused, then the dialog stays open with the backend title and detail', async () => {
    await loaded();

    button(section('Výmaz osobních údajů (GDPR)'), 'Vymazat osobní údaje').click();
    await settle();
    (eraseDialog()?.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    fixture.detectChanges();
    button(eraseDialog() as HTMLElement, 'Vymazat osobní údaje').click();
    fixture.detectChanges();
    const refusal = problem(
      409,
      'donors/already-erased',
      'Dárce už je vymazaný',
      'Osobní údaje tohoto dárce byly vymazány dřív.',
    );
    http.expectOne(ACCOUNT_URL).flush(refusal.body, refusal.options);
    await settle();

    expect(text('dialog [role="alert"]')).toBe(
      'Dárce už je vymazaný. Osobní údaje tohoto dárce byly vymazány dřív.',
    );
    expect(button(eraseDialog() as HTMLElement, 'Vymazat osobní údaje').disabled).toBe(false);
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

    const account = facts('Údaje');
    expect(account).toContain('Typ Firma · IČO 45274649');
    expect(account).toContain('neověřen');
    expect(account).toContain('Role dárce');
    expect(facts('Přihlášení')).toContain('Dvoufaktorové ověření vypnuté');
    expect(buttonNames(section('Přihlášení'))).toEqual([]);
    expect(texts('.donor-summary .badges .tag')).toEqual([]);
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
    expect(receipts).toContain('17. 10. 2026 11:00 česky');
    expect(receipts).toContain('platné');
  });

  it('when the donor gives with the symbol from a verified account, then the account column counts only gifts paired by the account and says where the others are', async () => {
    await loaded(
      donorAccount(),
      donorDetail({
        bankAccounts: [
          adminBankAccount({ donationCount: 0, totalAmountMinor: 0, lastDonationOn: null }),
        ],
      }),
    );

    const accounts = section('Bankovní účty');
    expect(
      Array.from(accounts.querySelectorAll('thead th') as NodeListOf<HTMLElement>).map((cell) =>
        cell.textContent?.trim(),
      ),
    ).toEqual(['Účet', 'Stav', 'Dary přiřazené podle účtu', 'Akce']);
    const cell = accounts.querySelector('tbody tr td:nth-child(3)') as HTMLElement;
    expect(cell.dataset['label']).toBe('Dary přiřazené podle účtu');
    expect(cell.textContent?.trim()).toBe('0 darů');
    expect((accounts.querySelector('.admin-hint') as HTMLElement).textContent).toContain(
      'Sloupec Dary přiřazené podle účtu počítá jen platby bez variabilního symbolu, které se dárci přiřadily podle účtu; dary se symbolem najdete níže v části Dary.',
    );
  });

  it('when the donor has donations, then the donations card links to the paired payments of this donor', async () => {
    await loaded();

    const link = section('Dary').querySelector('.donor-payments a') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Platby tohoto dárce');
    expect(link.getAttribute('href')).toBe(`/sprava/platby?stav=prirazene&darce=${DONOR_ID}`);
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
    expect(receipts).toContain('anglicky');
    expect(receipts).toContain('nahrazeno novějším');
  });

  it('when the second factor is turned off after the confirmation, then the account reloads and the status says what happened', async () => {
    await loaded(donorAccount({ secondFactorEnabled: true }));

    button(section('Přihlášení'), 'Vypnout dvoufaktorové ověření').click();
    fixture.detectChanges();
    expect(sectionText('Přihlášení')).toContain('Dárce se pak přihlásí jen heslem');
    button(section('Přihlášení'), 'Ano, vypnout').click();
    fixture.detectChanges();

    const request = http.expectOne(`/api/admin/donors/${DONOR_ID}/second-factor/reset`);
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(
      (section('Přihlášení').querySelector('.ui-notice--status')?.textContent ?? '').trim(),
    ).toBe(
      'Dvoufaktorové ověření u Jana Nováková je vypnuté a všechna přihlášení jsme ukončili. Dárce dostal e-mail; po přihlášení heslem si ho může zapnout znovu.',
    );
    http.expectOne(ACCOUNT_URL).flush(donorAccount());
    await settle();
    expect(facts('Přihlášení')).toContain('Dvoufaktorové ověření vypnuté');
    expect(buttonNames(section('Přihlášení'))).toEqual([]);
    expect(document.activeElement).toBe(section('Přihlášení').querySelector('app-live-notice'));
  });

  it('when the passkeys are removed after the confirmation, then the request is a DELETE, the account reloads and the status says what happened', async () => {
    await loaded(donorAccount({ passkeys: 2 }));

    button(section('Přihlášení'), 'Odebrat přístupové klíče').click();
    fixture.detectChanges();
    expect(sectionText('Přihlášení')).toContain('Dárce se jimi pak nepřihlásí');
    button(section('Přihlášení'), 'Ano, odebrat').click();
    fixture.detectChanges();

    const request = http.expectOne(`/api/admin/donors/${DONOR_ID}/passkeys`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(text('.ui-notice--status')).toBe(
      'Přístupové klíče u Jana Nováková jsme odebrali a všechna přihlášení ukončili. Dárce dostal e-mail; po přihlášení heslem si může přidat nový klíč.',
    );
    http.expectOne(ACCOUNT_URL).flush(donorAccount());
    await settle();
    expect(facts('Přihlášení')).toContain('Přístupové klíče žádné');
    expect(buttonNames(section('Přihlášení'))).toEqual([]);
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
    expect(text('.ui-notice--status')).toBe(
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
    expect(text('.ui-notice--status')).toBe(
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

    expect(text('.ui-notice--status')).toBe(
      'Účet 2900233333/2010 jsme dárci odebrali: 2 dary přiřazené přes něj jsme smazali a platby jsou zase nespárované.',
    );
    http.expectOne(DETAIL_URL).flush(donorDetail({ bankAccounts: [] }));
    await settle();
    expect(sectionText('Bankovní účty')).toContain('Z žádného účtu zatím nepřišla platba');
  });

  it('when "Ponechat" answers a confirmation, then nothing is sent, the buttons come back and the focus returns to the opener', async () => {
    await loaded();

    button(section('Bankovní účty'), 'Odebrat účet').click();
    await settle();
    expect(document.activeElement).toBe(button(section('Bankovní účty'), 'Ponechat'));
    button(section('Bankovní účty'), 'Ponechat').click();
    await settle();

    expect(sectionText('Bankovní účty')).not.toContain('Odebrat?');
    expect(document.activeElement).toBe(button(section('Bankovní účty'), 'Odebrat účet'));
    http.expectNone(LINK_URL);
  });

  it('when the second factor confirmation opens and is kept, then the focus moves to Ponechat and back to the opener', async () => {
    await loaded(donorAccount({ secondFactorEnabled: true }));

    const opener = button(section('Přihlášení'), 'Vypnout dvoufaktorové ověření');
    opener.click();
    await settle();
    expect(sectionText('Přihlášení')).toContain(
      'Ověřili jste, že žádá majitel účtu (například odpověděl z registrovaného e-mailu)? Dárce se pak přihlásí jen heslem a všechna jeho přihlášení skončí.',
    );
    expect(document.activeElement).toBe(button(section('Přihlášení'), 'Ponechat'));

    button(section('Přihlášení'), 'Ponechat').click();
    await settle();

    expect(document.activeElement).toBe(
      button(section('Přihlášení'), 'Vypnout dvoufaktorové ověření'),
    );
  });

  it('when the second factor is on, then its hint says the donor can also recover by a payment', async () => {
    await loaded(donorAccount({ secondFactorEnabled: true }));

    expect(sectionText('Přihlášení')).toContain(
      'Pro dárce, který přišel o telefon s ověřovací aplikací. Dárce to zvládne i sám: při přihlášení zvolí „Obnovit přístup platbou“ a pošle 1 Kč ze svého účtu.',
    );
  });

  it('when an action on a bank account succeeds, then its result shows in the accounts card and takes the focus', async () => {
    await loaded();

    button(section('Bankovní účty'), 'Vypnout párování').click();
    await settle();
    button(section('Bankovní účty'), 'Ano, vypnout').click();
    fixture.detectChanges();
    http.expectOne(`${LINK_URL}/disconnect`).flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    const notice = section('Bankovní účty').querySelector('app-live-notice') as HTMLElement;
    expect((notice.textContent ?? '').trim()).toContain(
      'Párování z účtu 2900233333/2010 je vypnuté',
    );
    expect(document.activeElement).toBe(notice);
    expect(section('Přihlášení').querySelector('.ui-notice')).toBeNull();
    http.expectOne(DETAIL_URL).flush(donorDetail());
    await settle();
  });

  it('when a donation from the account has a receipt, then the removal is not offered and the card says why', async () => {
    await loaded(
      donorAccount(),
      donorDetail({
        donations: {
          items: [adminDonation({ receiptNumber: '2026-000002' })],
          totalAmountMinor: 30000,
          currency: 'CZK',
          count: 1,
        },
      }),
    );

    const row = section('Bankovní účty').querySelector('tbody tr') as HTMLElement;
    expect(buttonNames(row)).toEqual(['Vypnout párování']);
    expect((row.textContent ?? '').replace(/\s+/g, ' ')).toContain(
      'Nejde odebrat: k darům z účtu je vystavené potvrzení.',
    );
  });

  it('when a donation was refunded, then the summary counts only the received ones and names the refunded', async () => {
    await loaded(
      donorAccount(),
      donorDetail({
        donations: {
          items: [
            adminDonation(),
            adminDonation({ id: '0192f0f1-0000-7000-8000-000000000003', status: 'REFUNDED' }),
          ],
          totalAmountMinor: 30000,
          currency: 'CZK',
          count: 1,
        },
      }),
    );

    expect(sectionText('Dary')).toContain(
      'Celkem 1 dar za 300 Kč. Vrácené dary (1) se nezapočítávají.',
    );
  });

  it('when the donor is an administrator, then the role links to the administrators page', async () => {
    await loaded(donorAccount({ administrator: true }));

    const link = section('Údaje').querySelector('dl a') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('správce');
    expect(link.getAttribute('href')).toBe('/sprava/spravci');
  });

  it('when the account has confirmed older symbols, then the label and the symbols are separated by a space', async () => {
    await loaded(
      donorAccount(),
      donorDetail({ bankAccounts: [adminBankAccount({ confirmedSymbols: ['6123456789'] })] }),
    );

    expect(sectionText('Bankovní účty')).toContain('Potvrzené starší symboly: 6123456789');
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
    await settle();

    expect(
      (section('Bankovní účty').querySelector('.ui-notice--alert')?.textContent ?? '').trim(),
    ).toBe(
      'Na dary z tohoto účtu odkazuje vydané potvrzení. Účet nejde odebrat. Dary s potvrzením musí zůstat. Aby se dárci další platby z účtu nepřiřazovaly, vypněte u něj párování.',
    );
    expect(document.activeElement).toBe(button(section('Bankovní účty'), 'Odebrat účet'));
  });

  it('when the donor does not exist, then one card says so and leads back to the search', async () => {
    const missing = problem(404, 'donors/donor-not-found', 'Dárce nenalezen', 'Není.');
    http.expectOne(ACCOUNT_URL).flush(missing.body, missing.options);
    const noRecord = problem(404, 'donations/donor-not-found', 'Dárce nenalezen', 'Není.');
    http.expectOne(DETAIL_URL).flush(noRecord.body, noRecord.options);
    await settle();

    expect(text('h1')).toBe('Dárce');
    expect(sectionText('Účet dárce')).toContain('Takový dárce není.');
    expect(fixture.nativeElement.querySelectorAll('section.ui-card')).toHaveLength(1);
    expect(texts('[role="alert"]:not(:empty)')).toHaveLength(1);
    const back = section('Účet dárce').querySelector('a') as HTMLAnchorElement;
    expect(back.textContent?.trim()).toBe('Zpět na hledání dárců');
    expect(back.getAttribute('href')).toBe('/sprava/darci');
  });

  it('when a part cannot be loaded, then its card offers a retry that loads it again', async () => {
    http.expectOne(ACCOUNT_URL).flush(null, { status: 500, statusText: 'Error' });
    http.expectOne(DETAIL_URL).flush(donorDetail());
    await settle();

    expect(sectionText('Údaje')).toContain('Účet se nepodařilo načíst.');
    button(section('Údaje'), 'Zkusit znovu').click();
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
