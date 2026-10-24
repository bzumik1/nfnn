import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { authResponse, problem, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import { BankAccountItem } from '../../../donations/bank-accounts-api';
import { BankCheckResponse } from '../../../donations/donations-api';
import { PaymentQrResponse } from '../../../donations/payment-qr-api';
import { bankAccount, symbolOffer } from '../../../donations/testing/bank-account-fixtures';
import { checkerboard } from '../../../../shared/ui/qr-code/testing/qr-matrices';
import { BankAccountsCard } from './bank-accounts-card';

const LIST_URL = '/api/donations/me/bank-accounts';
const BANK_CHECK_URL = '/api/donations/me/bank-check';
const EARLIER = '2026-10-18T08:05:00Z';
const LATER = '2026-10-18T08:07:00Z';
const ACCOUNT_ID = '0192f0c4-0000-7000-8000-000000000001';
const CONFIRM_URL = `${LIST_URL}/${ACCOUNT_ID}/symbol-claim/confirm`;
const DECLINE_URL = `${LIST_URL}/${ACCOUNT_ID}/symbol-claim/decline`;
const OFFER_WAITING =
  'U účtu na vás čeká otázka k platbám se starším variabilním symbolem. Najdete ji v seznamu účtů po zavření okna.';

function paymentQr(): PaymentQrResponse {
  return {
    spayd: 'SPD*1.0*ACC:CZ2620100000005544332217*AM:1.00*CC:CZK*X-VS:9876543210',
    qrCode: checkerboard(25),
    bankAccount: {
      accountNumber: '5544332217/2010',
      iban: 'CZ2620100000005544332217',
      recipientName: 'Nadační fond Nová naděje',
    },
  };
}

describe('Given the bank accounts card in the overview', () => {
  let fixture: ComponentFixture<BankAccountsCard>;
  let http: HttpTestingController;
  let sessionEnded: number;
  let bankChecks: BankCheckResponse[];
  let donationsChanged: number;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [BankAccountsCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ variableSymbol: '9876543210' })));
    fixture = TestBed.createComponent(BankAccountsCard);
    fixture.componentRef.setInput('variableSymbol', '9876543210');
    sessionEnded = 0;
    fixture.componentInstance.sessionEnded.subscribe(() => sessionEnded++);
    bankChecks = [];
    fixture.componentInstance.bankChecked.subscribe((check) => bankChecks.push(check));
    donationsChanged = 0;
    fixture.componentInstance.donationsChanged.subscribe(() => donationsChanged++);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
    fixture.nativeElement.remove();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function respond(items: BankAccountItem[]): Promise<void> {
    const request = http.expectOne({ method: 'GET', url: LIST_URL });
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    request.flush({ items });
    await settle();
  }

  function element<T extends HTMLElement = HTMLElement>(selector: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector) as T | null;
  }

  function text(selector: string): string {
    return normalized(element(selector)?.textContent ?? '');
  }

  function texts(selector: string): string[] {
    return [
      ...((fixture.nativeElement as HTMLElement).querySelectorAll(
        selector,
      ) as NodeListOf<HTMLElement>),
    ].map((node) => normalized(node.textContent ?? ''));
  }

  function normalized(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  async function click(selector: string): Promise<void> {
    (element(selector) as HTMLButtonElement).click();
    await settle();
  }

  it('when the accounts are still loading, then a loading line says so under the title', () => {
    expect(text('h2')).toBe('Moje bankovní účty');
    expect(text('.accounts-loading')).toBe('Načítáme vaše účty…');

    http.expectOne(LIST_URL).flush({ items: [] });
  });

  it('when a verified account arrives, then its row shows the number, the status, the verification day and the gifts without a symbol', async () => {
    await respond([bankAccount()]);

    expect(text('.account-number')).toBe('2900233333/2010');
    expect(text('.account-status')).toBe('Ověřený');
    expect(text('.account-hint')).toBe(
      'Platby bez variabilního symbolu z něj vám přiřazujeme automaticky.',
    );
    expect(texts('.account-meta > li')).toEqual([
      'ověřeno 12. 03. 2026',
      '14 darů bez symbolu',
      '7 400 Kč',
    ]);
    expect(text('.account-action')).toBe('Nepřiřazovat platby z tohoto účtu');
  });

  it('when an account has one gift without a symbol, then the count uses the singular', async () => {
    await respond([bankAccount({ donationCount: 1, totalAmountMinor: 50050 })]);

    expect(texts('.account-meta > li')).toEqual([
      'ověřeno 12. 03. 2026',
      '1 dar bez symbolu',
      '500,50 Kč',
    ]);
  });

  it('when an account has three gifts without a symbol, then the count uses the Czech few form', async () => {
    await respond([bankAccount({ donationCount: 3, totalAmountMinor: 150000 })]);

    expect(texts('.account-meta > li')).toContain('3 dary bez symbolu');
  });

  it('when an account has no gifts without a symbol yet, then the row does not count them', async () => {
    await respond([bankAccount({ donationCount: 0, totalAmountMinor: 0, lastDonationOn: null })]);

    expect(texts('.account-meta > li')).toEqual(['ověřeno 12. 03. 2026']);
  });

  it('when another donor verified the same account, then the row warns that it is shared and says what the donor can do', async () => {
    await respond([bankAccount({ shared: true })]);

    expect(text('.account-status')).toBe('Sdílený');
    expect(element('.account-status')?.classList).toContain('account-status--shared');
    const warning = element('.account-hint');
    expect(warning?.classList).toContain('account-hint--warning');
    expect(element('.account-hint--warning .account-hint-icon')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(text('.account-hint--warning .visually-hidden')).toBe('Upozornění:');
    expect(text('.account-hint--warning')).toBe(
      'Upozornění: ' +
        'Tento účet ověřil i jiný dárce, proto z něj platby bez variabilního symbolu nepřiřazujeme nikomu. ' +
        'Pokud z něj dary neposíláte vy, stiskněte „Nepřiřazovat platby z tohoto účtu“. ' +
        'Jinak z něj prosím posílejte vždy s vaším variabilním symbolem.',
    );
  });

  it('when an account is verified only by the donor, then its hint is a plain line, not a warning', async () => {
    await respond([bankAccount()]);

    expect(element('.account-hint--warning')).toBeNull();
    expect(element('.account-hint-icon')).toBeNull();
  });

  it('when an account only pairs payments with the symbol, then it stays verified, asks for the symbol in a plain line and cannot be disconnected', async () => {
    await respond([bankAccount({ pairingExcluded: true })]);

    expect(text('.account-status')).toBe('Ověřený');
    expect(element('.account-status')?.classList).toContain('account-status--active');
    expect(element('.account-hint--warning')).toBeNull();
    expect(text('.account-hint')).toBe(
      'Z tohoto účtu už přiřazujeme jen platby s variabilním symbolem. Posílejte z něj prosím vždy s vaším variabilním symbolem.',
    );
    expect(texts('.account-meta > li')).toEqual([
      'ověřeno 12. 03. 2026',
      '14 darů bez symbolu',
      '7 400 Kč',
    ]);
    expect(element('.account-action')).toBeNull();
  });

  it('when a reconnected account awaits a payment but only pairs payments with the symbol, then it does not say Čeká na platbu, asks for the symbol and can be disconnected', async () => {
    await respond([
      bankAccount({
        status: 'AWAITING_PAYMENT',
        verifiedOn: null,
        donationCount: 0,
        totalAmountMinor: 0,
        pairingExcluded: true,
      }),
    ]);

    expect(text('.account-status')).toBe('Jen s variabilním symbolem');
    expect(element('.account-status')?.classList).toContain('account-status--excluded');
    expect(element('.account-hint--warning')).toBeNull();
    expect(text('.account-hint')).toBe(
      'Z tohoto účtu už přiřazujeme jen platby s variabilním symbolem. Posílejte z něj prosím vždy s vaším variabilním symbolem.',
    );
    expect(texts('.account-action')).toEqual(['Nepřiřazovat platby z tohoto účtu']);
  });

  it('when a disconnected account only pairs payments with the symbol, then its newest row says why it offers no Znovu přiřazovat platby z účtu', async () => {
    await respond([
      bankAccount({
        id: 'a-2',
        status: 'DISCONNECTED',
        disconnectedOn: '2026-10-18',
        pairingExcluded: true,
      }),
      bankAccount({
        id: 'a-3',
        status: 'DISCONNECTED',
        disconnectedOn: '2026-05-31',
        pairingExcluded: true,
      }),
      bankAccount({
        accountNumber: '19-2000145399/0800',
        status: 'DISCONNECTED',
        disconnectedOn: '2026-09-30',
      }),
    ]);

    expect(texts('.account-status')).toEqual(['Nepřiřazujeme', 'Nepřiřazujeme', 'Nepřiřazujeme']);
    expect(element('.account:nth-child(1) .account-hint--warning')).toBeNull();
    expect(text('.account:nth-child(1) .account-hint')).toBe(
      'Z tohoto účtu už přiřazujeme jen platby s variabilním symbolem, platby bez symbolu z něj proto znovu přiřazovat nejde.',
    );
    expect(element('.account:nth-child(2) .account-hint')).toBeNull();
    expect(element('.account:nth-child(1) .account-action')).toBeNull();
    expect(element('.account:nth-child(2) .account-action')).toBeNull();
    expect(texts('.account-action')).toEqual(['Znovu přiřazovat platby z účtu']);
  });

  it('when an account waits for a payment, then the row says what to send and can still be disconnected', async () => {
    await respond([
      bankAccount({
        status: 'AWAITING_PAYMENT',
        verifiedOn: null,
        donationCount: 0,
        totalAmountMinor: 0,
      }),
    ]);

    expect(text('.account-status')).toBe('Čeká na platbu');
    expect(text('.account-hint')).toBe(
      'Pošlete z účtu 1 Kč s vaším variabilním symbolem. Jakmile dorazí, přiřadíme vám z něj i platby bez symbolu ode dne zapnutí.',
    );
    expect(texts('.account-meta > li')).toEqual([]);
    expect(text('.account-action')).toBe('Nepřiřazovat platby z tohoto účtu');
  });

  it('when accounts were disconnected, then each row is muted and says the day after the last one that counted', async () => {
    await respond([
      bankAccount({ id: 'a-1', status: 'DISCONNECTED', disconnectedOn: '2026-10-18' }),
      bankAccount({
        id: 'a-2',
        accountNumber: '19-2000145399/0800',
        status: 'DISCONNECTED',
        disconnectedOn: '2025-12-31',
        donationCount: 0,
      }),
    ]);

    expect(texts('.account-status')).toEqual(['Nepřiřazujeme', 'Nepřiřazujeme']);
    expect(element('.account')?.classList).toContain('account--disconnected');
    expect(texts('.account:nth-child(1) .account-meta > li')).toEqual([
      'ověřeno 12. 03. 2026',
      'vypnuto od 19. 10. 2026',
      '14 darů bez symbolu',
      '7 400 Kč',
    ]);
    expect(texts('.account:nth-child(2) .account-meta > li')).toEqual([
      'ověřeno 12. 03. 2026',
      'vypnuto od 01. 01. 2026',
    ]);
    expect(element('.account-hint')).toBeNull();
    expect(texts('.account-action')).toEqual([
      'Znovu přiřazovat platby z účtu',
      'Znovu přiřazovat platby z účtu',
    ]);
  });

  it('when an account was reconnected, then its old row offers no Znovu přiřazovat platby z účtu', async () => {
    await respond([
      bankAccount({ id: 'a-new', status: 'AWAITING_PAYMENT', verifiedOn: null, donationCount: 0 }),
      bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-10-18' }),
    ]);

    expect(texts('.account-status')).toEqual(['Čeká na platbu', 'Nepřiřazujeme']);
    expect(texts('.account-action')).toEqual(['Nepřiřazovat platby z tohoto účtu']);
    expect(texts('.account:nth-child(2) .account-meta > li')).toContain('vypnuto od 19. 10. 2026');
  });

  it('when an account was disconnected twice, then only its newest row offers Znovu přiřazovat platby z účtu', async () => {
    await respond([
      bankAccount({ id: 'a-2', status: 'DISCONNECTED', disconnectedOn: '2026-10-18' }),
      bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-09-30' }),
    ]);

    expect(texts('.account-status')).toEqual(['Nepřiřazujeme', 'Nepřiřazujeme']);
    expect(texts('.account-action')).toEqual(['Znovu přiřazovat platby z účtu']);
    expect(element('.account:nth-child(1) .account-action')).not.toBeNull();
  });

  it('when the donor has no known account, then the card explains how one becomes known', async () => {
    await respond([]);

    expect(element('.accounts-list')).toBeNull();
    expect(text('.accounts-empty')).toBe(
      'Účet se tu objeví sám, jakmile od vás přijde první platba s vaším variabilním symbolem. Nic dalšího dělat nemusíte.',
    );
  });

  it('when the donor has no known account, then a nudge under it explains how a standing order with an older symbol becomes theirs', async () => {
    await respond([]);

    expect(element('.accounts-empty + .accounts-nudge')).not.toBeNull();
    expect(text('.accounts-nudge')).toBe(
      'Posíláte trvalým příkazem s jiným symbolem? ' +
        'Nejjednodušší je změnit v příkazu variabilní symbol na 9876543210. ' +
        'Jinak pošlete 1 Kč přes „Přidat účet“.',
    );
    expect(text('.accounts-nudge strong')).toBe('9876543210');
  });

  it('when the donor has no known account and no variable symbol yet, then the nudge speaks of their symbol without a number', async () => {
    fixture.componentRef.setInput('variableSymbol', null);
    await respond([]);

    expect(text('.accounts-nudge')).toContain(
      'Nejjednodušší je změnit v příkazu variabilní symbol na váš. Jinak pošlete 1 Kč přes „Přidat účet“.',
    );
    expect(element('.accounts-nudge strong')).toBeNull();
  });

  it('when the donor has known accounts but none verified, then a short nudge under the list says a 1 Kč also brings gifts with an older symbol', async () => {
    await respond([bankAccount({ status: 'AWAITING_PAYMENT', verifiedOn: null })]);

    expect(element('.accounts-list + .accounts-nudge')).not.toBeNull();
    expect(text('.accounts-nudge')).toBe(
      'Posíláte trvalým příkazem se starším symbolem? Ověřte platbou 1 Kč ze stejného účtu a uvidíte i dřívější dary.',
    );
  });

  it('when an account is verified or carries a question, then the list repeats no nudge', async () => {
    await respond([bankAccount()]);
    expect(element('.accounts-nudge')).toBeNull();

    fixture.componentInstance.reload();
    await respond([
      bankAccount({ status: 'AWAITING_PAYMENT', verifiedOn: null, symbolOffer: symbolOffer() }),
    ]);
    expect(element('.accounts-nudge')).toBeNull();
  });

  it('when the donor confirmed older symbols at an account, then its row says so and still counts the gifts without a symbol', async () => {
    await respond([bankAccount({ confirmedSymbols: ['6123456789', '7001234567'] })]);

    expect(texts('.account-hint')).toEqual([
      'Platby bez variabilního symbolu z něj vám přiřazujeme automaticky.',
      'Platby se symbolem 6123456789 z tohoto účtu jste potvrdili jako své a přiřazujeme vám je stejně jako platby bez symbolu.',
      'Platby se symbolem 7001234567 z tohoto účtu jste potvrdili jako své a přiřazujeme vám je stejně jako platby bez symbolu.',
    ]);
    expect(texts('.account-hint strong')).toEqual(['6123456789', '7001234567']);
    expect(texts('.account-meta > li')).toEqual([
      'ověřeno 12. 03. 2026',
      '14 darů bez symbolu',
      '7 400 Kč',
    ]);
    expect(element('app-symbol-claim')).toBeNull();
  });

  it('when the donor switches off pairing at an account with a confirmed symbol, then the confirmation names that symbol', async () => {
    await respond([bankAccount({ confirmedSymbols: ['6123456789'] })]);

    await click('.account-action');

    expect(text('.account-confirm-text')).toBe(
      'Platby bez variabilního symbolu ani platby se symbolem 6123456789, které z tohoto účtu přijdou od zítřka, vám už nebudeme přiřazovat. ' +
        'Dosavadní dary zůstanou; pokud některý z nich není váš, napište nám.',
    );
    expect(element<HTMLAnchorElement>('.account-confirm-text a')?.getAttribute('href')).toBe(
      'mailto:info@nfnn.cz',
    );
    const group = element('.account-confirm') as HTMLElement;
    expect(text('#' + group.getAttribute('aria-labelledby'))).toContain(
      'platby se symbolem 6123456789',
    );
  });

  it('when the donor switches off pairing at an account with two confirmed symbols, then the confirmation names both', async () => {
    await respond([bankAccount({ confirmedSymbols: ['6123456789', '7001234567'] })]);

    await click('.account-action');

    expect(text('.account-confirm-text')).toContain(
      'ani platby se symbolem 6123456789 a 7001234567, které z tohoto účtu přijdou od zítřka',
    );
  });

  it('when the overview asks to show the card, then its heading takes the focus', async () => {
    await respond([bankAccount()]);

    fixture.componentInstance.focusTitle();

    expect(document.activeElement).toBe(element('h2#bank-accounts-title'));
  });

  it('when the accounts cannot be loaded, then an alert offers to try again and a retry shows them', async () => {
    http.expectOne(LIST_URL).flush(null, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(element('.accounts-load-error')?.getAttribute('role')).toBe('alert');
    expect(text('.accounts-load-error')).toContain('Bankovní účty se nepodařilo načíst.');

    await click('.accounts-retry');
    expect(text('.accounts-loading')).toBe('Načítáme vaše účty…');
    await respond([bankAccount()]);

    expect(element('.accounts-load-error')).toBeNull();
    expect(text('.account-number')).toBe('2900233333/2010');
  });

  it('when the session has ended while loading, then the overview is told to send the donor to sign in', async () => {
    http.expectOne(LIST_URL).flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), {
      status: 401,
      statusText: 'Unauthorized',
    });
    await settle();

    expect(sessionEnded).toBe(1);
  });

  it('when the overview asks for a reload, then the accounts are fetched again while the old list stays visible', async () => {
    await respond([bankAccount({ status: 'AWAITING_PAYMENT', verifiedOn: null })]);

    fixture.componentInstance.reload();
    await settle();

    expect(element('.accounts-loading')).toBeNull();
    expect(text('.account-status')).toBe('Čeká na platbu');
    await respond([bankAccount()]);
    expect(text('.account-status')).toBe('Ověřený');
  });

  describe('when the donor looks up how payments are paired', () => {
    beforeEach(async () => {
      await respond([bankAccount()]);
    });

    function helpButton(): HTMLButtonElement {
      return element<HTMLButtonElement>('.accounts-help') as HTMLButtonElement;
    }

    function helpPanel(): HTMLElement {
      return element('#accounts-help-panel') as HTMLElement;
    }

    it('then a button right after the title says in words what it explains and is collapsed', () => {
      const button = helpButton();
      expect(element('.accounts-head h2 + .accounts-help')).toBe(button);
      expect(
        button.compareDocumentPosition(element('.accounts-add') as HTMLElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        normalized(button.querySelector(':scope > :not([aria-hidden])')?.textContent ?? ''),
      ).toBe('Jak přiřazujeme platby?');
      expect(button.hasAttribute('aria-label')).toBe(false);
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(button.getAttribute('aria-controls')).toBe('accounts-help-panel');
      expect(helpPanel().hidden).toBe(true);
    });

    it("and presses the help button, then the labelled panel opens under the head with the donor's symbol", async () => {
      await click('.accounts-help');

      expect(helpButton().getAttribute('aria-expanded')).toBe('true');
      const panel = helpPanel();
      expect(panel.hidden).toBe(false);
      expect(element('.accounts-head + app-pairing-help > #accounts-help-panel')).toBe(panel);
      expect(
        panel.compareDocumentPosition(element('.accounts-list') as HTMLElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(panel.getAttribute('role')).toBe('region');
      expect(text('#' + panel.getAttribute('aria-labelledby'))).toBe('Jak přiřazujeme platby');
      expect(texts('#accounts-help-panel .help-symbol')).toEqual(['9876543210', '9876543210']);
    });

    it('and has no variable symbol yet, then the panel shows no number', async () => {
      fixture.componentRef.setInput('variableSymbol', null);
      await click('.accounts-help');

      expect(helpPanel().hidden).toBe(false);
      expect(element('#accounts-help-panel .help-symbol')).toBeNull();
    });

    it('and presses the ? button again, then the panel closes', async () => {
      await click('.accounts-help');
      await click('.accounts-help');

      expect(helpButton().getAttribute('aria-expanded')).toBe('false');
      expect(helpPanel().hidden).toBe(true);
    });

    it('and presses Escape inside the panel, then it closes and the focus returns to the ? button', async () => {
      await click('.accounts-help');
      const link = element<HTMLAnchorElement>('#accounts-help-panel a') as HTMLAnchorElement;
      link.focus();

      link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();

      expect(helpButton().getAttribute('aria-expanded')).toBe('false');
      expect(helpPanel().hidden).toBe(true);
      expect(document.activeElement).toBe(helpButton());
    });

    it('and presses Escape on the ? button while the panel is open, then it closes and the focus stays on the button', async () => {
      await click('.accounts-help');
      const button = helpButton();
      button.focus();

      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();

      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(helpPanel().hidden).toBe(true);
      expect(document.activeElement).toBe(button);
    });

    it('and presses Escape on the ? button while the panel is closed, then the panel stays closed', async () => {
      const button = helpButton();
      button.focus();

      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();

      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(helpPanel().hidden).toBe(true);
      expect(document.activeElement).toBe(button);
    });
  });

  describe('when an account has a question about an older symbol', () => {
    beforeEach(async () => {
      await respond([
        bankAccount({ symbolOffer: symbolOffer(), verificationPaymentOn: '2026-10-16' }),
      ]);
    });

    async function answerYes(
      paidCount: number,
      changedYearlyReceipts: number[] = [],
    ): Promise<void> {
      await click('.claim-yes');
      http
        .expectOne({ method: 'POST', url: CONFIRM_URL })
        .flush({ pairedCount: paidCount, changedYearlyReceipts });
      await settle();
      await respond([
        bankAccount({ confirmedSymbols: ['6123456789'], verificationPaymentOn: '2026-10-16' }),
      ]);
    }

    it('then the question stands in that row under the hint, and Nepřiřazovat platby z tohoto účtu stays', () => {
      const claim = element('.account .account-main app-symbol-claim') as HTMLElement;
      expect(claim).not.toBeNull();
      expect(
        (element('.account-hint') as HTMLElement).compareDocumentPosition(claim) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(text('.claim-question')).toBe(
        'Z tohoto účtu k nám chodí i platby s variabilním symbolem 6123456789 (14 plateb, leden 2025 – říjen 2026). ' +
          'Jsou to dary od vás (Jana Nováková)?',
      );
      expect(texts('.account-action')).toEqual(['Nepřiřazovat platby z tohoto účtu']);
      expect(element('.account-action')?.classList).toContain('account-action--apart');
      expect(text('.accounts-status')).toBe('');
    });

    it('and the donor presses Nepřiřazovat platby z tohoto účtu, then the question gives way to the confirmation until that is cancelled', async () => {
      await click('.account-action');

      expect(element('app-symbol-claim')).toBeNull();
      expect(element('.account-confirm')).not.toBeNull();

      await click('.account-confirm-no');

      expect(element('.account-confirm')).toBeNull();
      expect(element('app-symbol-claim')).not.toBeNull();
    });

    it('and answers Ano, then it is posted once, the list loads with the confirmed line, the payments are announced, the heading takes the focus and the overview reloads the donations', async () => {
      const yes = element<HTMLButtonElement>('.claim-yes') as HTMLButtonElement;
      yes.focus();
      await click('.claim-yes');

      const request = http.expectOne({ method: 'POST', url: CONFIRM_URL });
      expect(request.request.body).toEqual({ variableSymbol: '6123456789' });
      expect(yes.getAttribute('aria-busy')).toBe('true');
      expect(document.activeElement).toBe(yes);
      await click('.claim-no');
      http.expectNone(DECLINE_URL);
      request.flush({ pairedCount: 14, changedYearlyReceipts: [] });
      await settle();
      await respond([
        bankAccount({ confirmedSymbols: ['6123456789'], verificationPaymentOn: '2026-10-16' }),
      ]);

      expect(element('app-symbol-claim')).toBeNull();
      expect(texts('.account-hint')).toContain(
        'Platby se symbolem 6123456789 z tohoto účtu jste potvrdili jako své a přiřazujeme vám je stejně jako platby bez symbolu.',
      );
      expect(text('.accounts-status')).toBe(
        'Přiřadili jsme vám 14 plateb se symbolem 6123456789 z účtu 2900233333/2010.',
      );
      expect(document.activeElement).toBe(element('h2'));
      expect(donationsChanged).toBe(1);
      expect(texts('.account-action')).toEqual(['Nepřiřazovat platby z tohoto účtu']);
    });

    it('and answers Ano, then the question is gone before the list loads again, so a second press cannot post it again', async () => {
      await click('.claim-yes');
      http
        .expectOne({ method: 'POST', url: CONFIRM_URL })
        .flush({ pairedCount: 14, changedYearlyReceipts: [] });
      await settle();

      expect(element('app-symbol-claim')).toBeNull();
      expect(text('.accounts-status')).toBe(
        'Přiřadili jsme vám 14 plateb se symbolem 6123456789 z účtu 2900233333/2010.',
      );
      await respond([
        bankAccount({ confirmedSymbols: ['6123456789'], verificationPaymentOn: '2026-10-16' }),
      ]);
      http.expectNone(CONFIRM_URL);
    });

    it('and answers Ne, then the question is gone before the list loads again', async () => {
      await click('.claim-no');
      http
        .expectOne({ method: 'POST', url: DECLINE_URL })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(element('app-symbol-claim')).toBeNull();
      expect(text('.accounts-status')).toBe(
        'Odpověď jsme uložili. Platby se symbolem 6123456789 z účtu 2900233333/2010 vám nepřiřadíme.',
      );
      await respond([bankAccount({ verificationPaymentOn: '2026-10-16' })]);
    });

    it('and answers Ano and one payment is paired, then the announcement uses the singular', async () => {
      await answerYes(1);

      expect(text('.accounts-status')).toBe(
        'Přiřadili jsme vám 1 platbu se symbolem 6123456789 z účtu 2900233333/2010.',
      );
      expect(donationsChanged).toBe(1);
    });

    it('and answers Ano and three payments are paired, then the announcement uses the form for two to four', async () => {
      await answerYes(3);

      expect(text('.accounts-status')).toBe(
        'Přiřadili jsme vám 3 platby se symbolem 6123456789 z účtu 2900233333/2010.',
      );
      expect(donationsChanged).toBe(1);
    });

    it('and answers Ano and no payment waits to be paired, then the answer is announced as saved and the donations are not reloaded', async () => {
      await answerYes(0);

      expect(text('.accounts-status')).toBe(
        'Odpověď jsme uložili. Platby se symbolem 6123456789 z účtu 2900233333/2010 vám přiřazujeme stejně jako platby bez symbolu.',
      );
      expect(donationsChanged).toBe(0);
    });

    it('and answers Ano and a yearly receipt has changed, then the announcement says to download it again', async () => {
      await answerYes(14, [2026]);

      expect(text('.accounts-status')).toBe(
        'Přiřadili jsme vám 14 plateb se symbolem 6123456789 z účtu 2900233333/2010. Potvrzení za rok 2026 se změnilo, stáhněte si nové.',
      );
    });

    it('and answers Ano and two yearly receipts have changed, then the announcement names both years', async () => {
      await answerYes(14, [2026, 2025]);

      expect(text('.accounts-status')).toBe(
        'Přiřadili jsme vám 14 plateb se symbolem 6123456789 z účtu 2900233333/2010. Potvrzení za roky 2025 a 2026 se změnila, stáhněte si nová.',
      );
    });

    it('and answers Ano and three yearly receipts have changed, then the years are listed with commas and a before the last', async () => {
      await answerYes(14, [2024, 2025, 2026]);

      expect(text('.accounts-status')).toContain(
        'Potvrzení za roky 2024, 2025 a 2026 se změnila, stáhněte si nová.',
      );
    });

    it('and answers Ne, then the decline is posted, the list loads without the question, the answer is announced and the donations are not reloaded', async () => {
      await click('.claim-no');

      const request = http.expectOne({ method: 'POST', url: DECLINE_URL });
      expect(request.request.body).toEqual({ variableSymbol: '6123456789' });
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      await respond([bankAccount({ verificationPaymentOn: '2026-10-16' })]);

      expect(element('app-symbol-claim')).toBeNull();
      expect(texts('.account-hint')).toEqual([
        'Platby bez variabilního symbolu z něj vám přiřazujeme automaticky.',
      ]);
      expect(text('.accounts-status')).toBe(
        'Odpověď jsme uložili. Platby se symbolem 6123456789 z účtu 2900233333/2010 vám nepřiřadíme.',
      );
      expect(document.activeElement).toBe(element('h2'));
      expect(donationsChanged).toBe(0);
    });

    it('and the question no longer applies, then the problem shows in the alert, the list loads again and the heading takes the focus', async () => {
      await click('.claim-yes');

      http.expectOne(CONFIRM_URL).flush(
        {
          ...problem(
            'donations/symbol-offer-not-available',
            'Tato otázka už neplatí',
            'Údaje z banky nebo u účtu se mezitím změnily.',
          ),
          status: 409,
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();
      await respond([bankAccount({ shared: true })]);

      expect(element('.accounts-error')?.getAttribute('role')).toBe('alert');
      expect(text('.accounts-error')).toBe(
        'Tato otázka už neplatí. Údaje z banky nebo u účtu se mezitím změnily.',
      );
      expect(element('app-symbol-claim')).toBeNull();
      expect(document.activeElement).toBe(element('h2'));
      expect(text('.accounts-status')).toBe('');
      expect(donationsChanged).toBe(0);
    });

    it('and the answer fails without a problem, then a generic line asks to try again and the focus stays on the pressed button', async () => {
      const no = element<HTMLButtonElement>('.claim-no') as HTMLButtonElement;
      no.focus();
      await click('.claim-no');

      http.expectOne(DECLINE_URL).flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text('.accounts-error')).toBe('Odpověď se nepodařilo uložit. Zkuste to prosím znovu.');
      expect(document.activeElement).toBe(no);
      expect(no.getAttribute('aria-disabled')).toBe('false');
      expect(no.getAttribute('aria-busy')).toBe('false');
      http.expectNone(LIST_URL);
    });

    it('and the session has ended, then the overview is told to send the donor to sign in', async () => {
      await click('.claim-yes');

      http.expectOne(CONFIRM_URL).flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), {
        status: 401,
        statusText: 'Unauthorized',
      });
      await settle();

      expect(sessionEnded).toBe(1);
      expect(donationsChanged).toBe(0);
    });
  });

  describe('when the donor presses Nepřiřazovat platby z tohoto účtu', () => {
    beforeEach(async () => {
      await respond([bankAccount()]);
      await click('.account-action');
    });

    it('then the row asks to confirm with what disconnecting means, and nothing is sent yet', () => {
      expect(text('.account-confirm-text')).toBe(
        'Platby bez variabilního symbolu, které z tohoto účtu přijdou od zítřka, vám už nebudeme přiřazovat. ' +
          'Dosavadní dary zůstanou; pokud některý z nich není váš, napište nám.',
      );
      expect(element<HTMLAnchorElement>('.account-confirm-text a')?.getAttribute('href')).toBe(
        'mailto:info@nfnn.cz',
      );
      expect(text('.account-confirm-yes')).toBe('Ano, nepřiřazovat');
      expect(text('.account-confirm-no')).toBe('Ponechat');
      expect(element('.account-action')).toBeNull();
      expect(document.activeElement).toBe(element('.account-confirm-no'));
      http.expectNone(`${LIST_URL}/${ACCOUNT_ID}/disconnect`);
    });

    it('and cancels, then nothing is sent and the focus goes back to Nepřiřazovat platby z tohoto účtu', async () => {
      await click('.account-confirm-no');

      http.expectNone(`${LIST_URL}/${ACCOUNT_ID}/disconnect`);
      expect(element('.account-confirm')).toBeNull();
      expect(document.activeElement).toBe(element('.account-action'));
    });

    it('and confirms, then the account is disconnected, the list loads again and a status line says so', async () => {
      await click('.account-confirm-yes');

      const request = http.expectOne({
        method: 'POST',
        url: `${LIST_URL}/${ACCOUNT_ID}/disconnect`,
      });
      expect(request.request.body).toBeNull();
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      await respond([bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-10-18' })]);

      expect(text('.account-status')).toBe('Nepřiřazujeme');
      expect(text('.accounts-status')).toBe('Platby z účtu vám už nebudeme přiřazovat.');
      expect(document.activeElement).toBe(element('h2'));
    });

    it('and the account was disconnected meanwhile, then the problem shows, the list loads again and the heading takes the focus', async () => {
      await click('.account-confirm-yes');

      http.expectOne(`${LIST_URL}/${ACCOUNT_ID}/disconnect`).flush(
        {
          ...problem(
            'donations/bank-account-already-disconnected',
            'Párování z účtu je už vypnuté',
          ),
          status: 409,
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();
      await respond([bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-10-18' })]);

      expect(element('.accounts-error')?.getAttribute('role')).toBe('alert');
      expect(text('.accounts-error')).toBe('Párování z účtu je už vypnuté.');
      expect(text('.account-status')).toBe('Nepřiřazujeme');
      expect(document.activeElement).toBe(element('h2'));
    });

    it('and the request fails without a problem, then a generic line asks to try again', async () => {
      await click('.account-confirm-yes');

      http
        .expectOne(`${LIST_URL}/${ACCOUNT_ID}/disconnect`)
        .flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text('.accounts-error')).toBe('Účet se nepodařilo změnit. Zkuste to prosím znovu.');
      expect(element('.account-confirm')).not.toBeNull();
      expect((element('.account-confirm-yes') as HTMLButtonElement).disabled).toBe(false);
    });

    it('and the session has ended, then the overview is told to send the donor to sign in', async () => {
      await click('.account-confirm-yes');

      http
        .expectOne(`${LIST_URL}/${ACCOUNT_ID}/disconnect`)
        .flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), {
          status: 401,
          statusText: 'Unauthorized',
        });
      await settle();

      expect(sessionEnded).toBe(1);
    });
  });

  it('when the donor reconnects a disconnected account, then it is posted, the list loads again and the new row waits for a payment', async () => {
    await respond([bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-10-18' })]);

    await click('.account-action');
    const request = http.expectOne({ method: 'POST', url: `${LIST_URL}/${ACCOUNT_ID}/reconnect` });
    expect(request.request.body).toBeNull();
    expect((element('.account-action') as HTMLButtonElement).disabled).toBe(true);
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    await respond([
      bankAccount({ id: 'a-new', status: 'AWAITING_PAYMENT', verifiedOn: null, donationCount: 0 }),
      bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-10-18' }),
    ]);

    expect(texts('.account-status')).toEqual(['Čeká na platbu', 'Nepřiřazujeme']);
    expect(texts('.account-action')).toEqual(['Nepřiřazovat platby z tohoto účtu']);
    expect(text('.accounts-status')).toBe('Účet čeká na vaši platbu 1 Kč.');
  });

  it('when reconnecting is refused because the account is connected already, then the problem shows and the list loads again', async () => {
    await respond([bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-10-18' })]);

    await click('.account-action');
    http.expectOne(`${LIST_URL}/${ACCOUNT_ID}/reconnect`).flush(
      {
        ...problem(
          'donations/bank-account-already-connected',
          'Párování z účtu už jste zapnuli',
          'Pokud účet ještě čeká na platbu, pošlete z něj 1 Kč s vaším variabilním symbolem.',
        ),
        status: 409,
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    await respond([bankAccount({ status: 'AWAITING_PAYMENT', verifiedOn: null })]);

    expect(text('.accounts-error')).toBe(
      'Párování z účtu už jste zapnuli. Pokud účet ještě čeká na platbu, pošlete z něj 1 Kč s vaším variabilním symbolem.',
    );
  });

  describe('when the donor presses Přidat účet', () => {
    beforeEach(async () => {
      await respond([bankAccount()]);
      (element('.accounts-add') as HTMLButtonElement).focus();
      await click('.accounts-add');
    });

    it('then a dialog explains to send 1 Kč with the variable symbol and asks for the account verification QR payment', async () => {
      const dialog = element<HTMLDialogElement>('dialog');
      expect(dialog?.open).toBe(true);
      expect(dialog?.getAttribute('aria-labelledby')).toBe('add-account-title');
      expect(text('#add-account-title')).toBe('Přidat účet');
      expect(texts('.add-account-text')).toEqual([
        'Pošlete z účtu, který chcete přidat, 1 Kč podle údajů níže. ' +
          'Jakmile platba dorazí, účet se tu objeví a platby z něj vám budeme přiřazovat i bez variabilního symbolu.',
      ]);
      expect(element('.add-account-text + .add-account-watch')).not.toBeNull();
      expect(
        (element('.add-account-watch') as HTMLElement).compareDocumentPosition(
          element('.add-account-payment') as HTMLElement,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(text('.add-account-qr')).toBe('Připravujeme QR kód…');

      const request = http.expectOne({
        method: 'GET',
        url: '/api/donations/payment-qr?amount=1&variableSymbol=9876543210&purpose=ACCOUNT_VERIFICATION',
      });
      request.flush(paymentQr());
      await settle();

      expect(element('.add-account-qr svg[role="img"]')?.getAttribute('aria-label')).toBe(
        'QR platba 1 Kč s vaším variabilním symbolem',
      );
      expect(texts('.add-account-bank dd .bank-value')).toEqual([
        '5544332217/2010',
        '1 Kč',
        'Ověření účtu Nadační fond Nová naděje',
        '9876543210',
      ]);
      expect(texts('.add-account-bank app-copy-button button')).toEqual([
        'Kopírovat číslo účtu',
        'Kopírovat zprávu pro příjemce',
        'Kopírovat variabilní symbol',
      ]);
    });

    it('then a closed disclosure explains when it works and that a standing order with an older symbol needs exactly 1 Kč with the message', async () => {
      http.expectOne((request) => request.url === '/api/donations/payment-qr').flush(paymentQr());
      await settle();

      const more = element<HTMLDetailsElement>('details.add-account-more');
      expect(more?.open).toBe(false);
      expect(text('.add-account-more summary')).toBe(
        'Kdy to funguje a co se stane s dřívějšími dary',
      );
      expect(texts('.add-account-more li')).toEqual([
        'Funguje jen účet u české banky. Neověřujte prosím sběrný účet, přes který posílá peníze víc lidí.',
        'Když účet ověříte poprvé a předtím ho neověřil jiný dárce, přiřadíme vám i dřívější dary z něj, které přišly bez symbolu.',
        'Posíláte z účtu dary trvalým příkazem se starším variabilním symbolem? ' +
          'Pošlete pak právě 1 Kč se zprávou pro příjemce „Ověření účtu Nadační fond Nová naděje“, jak ji má QR kód; běžný dar nestačí. ' +
          'Pokud z účtu chodil jen jeden takový symbol, obvykle se vás u účtu zeptáme, jestli jsou platby s ním vaše.',
        'Okamžitá platba dorazí do pár minut, běžný převod obvykle do dalšího pracovního dne.',
      ]);
    });

    it('and the QR payment cannot be prepared, then the dialog says so and a retry asks again', async () => {
      http
        .expectOne((request) => request.url === '/api/donations/payment-qr')
        .flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text('.add-account-qr-error')).toContain('QR platbu se nepodařilo připravit.');

      await click('.add-account-qr-retry');
      http.expectOne((request) => request.url === '/api/donations/payment-qr').flush(paymentQr());
      await settle();

      expect(element('.add-account-qr svg[role="img"]')).not.toBeNull();
    });

    it('and closes the dialog, then it disappears and the focus returns to Přidat účet', async () => {
      http.expectOne((request) => request.url === '/api/donations/payment-qr').flush(paymentQr());
      await settle();

      await click('.add-account-close');

      expect(element('dialog')).toBeNull();
      expect(document.activeElement).toBe(element('.accounts-add'));
    });

    it('and presses Esc, then the dialog closes', async () => {
      http.expectOne((request) => request.url === '/api/donations/payment-qr').flush(paymentQr());
      await settle();

      element<HTMLDialogElement>('dialog')?.close();
      await settle();

      expect(element('dialog')).toBeNull();
    });
  });

  describe('when the donor opens Přidat účet and pays from a new account', () => {
    const newAccount = bankAccount({
      id: '0192f0c4-0000-7000-8000-000000000002',
      accountNumber: '1234567890/0800',
      donationCount: 0,
    });

    beforeEach(async () => {
      vi.useFakeTimers();
      await respond([bankAccount()]);
      await click('.accounts-add');
      http.expectOne((request) => request.url === '/api/donations/payment-qr').flush(paymentQr());
      await settle();
    });

    async function wait(milliseconds: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(milliseconds);
      await settle();
    }

    async function answerCheck(check: BankCheckResponse, items: BankAccountItem[]): Promise<void> {
      http
        .expectOne({ method: 'POST', url: BANK_CHECK_URL })
        .flush(check, { status: 202, statusText: 'Accepted' });
      await settle();
      await respond(items);
    }

    it('then the dialog says it waits for the payment in a status line and asks the bank only after half a minute', async () => {
      const watch = element('.add-account-watch');
      expect(watch?.getAttribute('role')).toBe('status');
      expect(text('.add-account-watch .watch-title')).toBe('Čekáme na vaši platbu…');
      expect(element('.watch-icon--waiting')?.getAttribute('aria-hidden')).toBe('true');

      await wait(29_000);
      http.expectNone(BANK_CHECK_URL);

      await wait(1_000);
      await answerCheck({ bankDataAsOf: EARLIER, checking: false }, [bankAccount()]);

      expect(text('.add-account-watch .watch-title')).toBe('Čekáme na vaši platbu…');
      expect(bankChecks).toEqual([{ bankDataAsOf: EARLIER, checking: false }]);
    });

    it('and the payment arrives during a running check, then the waiting turns into a tick with the verified account', async () => {
      await wait(30_000);
      http
        .expectOne({ method: 'POST', url: BANK_CHECK_URL })
        .flush({ bankDataAsOf: EARLIER, checking: true });
      await wait(2_000);
      http
        .expectOne({ method: 'GET', url: BANK_CHECK_URL })
        .flush({ bankDataAsOf: LATER, checking: false });
      await settle();
      await respond([newAccount, bankAccount()]);

      expect(element('.add-account-watch--verified')).not.toBeNull();
      expect(element('.watch-icon--verified')).not.toBeNull();
      expect(element('.watch-icon--waiting')).toBeNull();
      expect(text('.add-account-watch .watch-title')).toBe('Účet 1234567890/0800 je ověřený');
      expect(text('.add-account-watch .watch-detail')).toBe(
        'Platby bez variabilního symbolu z něj vám přiřazujeme automaticky.',
      );
      expect(bankChecks).toEqual([{ bankDataAsOf: LATER, checking: false }]);

      await wait(60_000);
      http.expectNone(BANK_CHECK_URL);
    });

    it('and the account verified in the dialog is shared, then the verified box shows the warning, not a plain line', async () => {
      await wait(30_000);
      await answerCheck({ bankDataAsOf: LATER, checking: false }, [
        { ...newAccount, shared: true },
        bankAccount(),
      ]);

      expect(text('.add-account-watch .watch-title')).toBe('Účet 1234567890/0800 je ověřený');
      expect(
        element('.add-account-watch .account-hint--warning .account-hint-icon')?.getAttribute(
          'aria-hidden',
        ),
      ).toBe('true');
      expect(text('.add-account-watch .account-hint--warning .visually-hidden')).toBe(
        'Upozornění:',
      );
      expect(text('.add-account-watch .account-hint--warning')).toBe(
        'Upozornění: ' +
          'Tento účet ověřil i jiný dárce, proto z něj platby bez variabilního symbolu nepřiřazujeme nikomu. ' +
          'Pokud z něj dary neposíláte vy, stiskněte „Nepřiřazovat platby z tohoto účtu“. ' +
          'Jinak z něj prosím posílejte vždy s vaším variabilním symbolem.',
      );
      expect(element('.add-account-watch .watch-detail')).toBeNull();
    });

    it('and the account verified in the dialog has a question about an older symbol, then the verified box points to it', async () => {
      await wait(30_000);
      await answerCheck({ bankDataAsOf: LATER, checking: false }, [
        { ...newAccount, symbolOffer: symbolOffer() },
        bankAccount(),
      ]);

      expect(text('.add-account-watch .watch-title')).toBe('Účet 1234567890/0800 je ověřený');
      expect(texts('.add-account-watch .watch-detail')).toEqual([OFFER_WAITING]);
    });

    it('and a 1 Kč arrives from an account that was verified already, then the watch ends saying the payment arrived, with its hint', async () => {
      await wait(30_000);
      await answerCheck({ bankDataAsOf: LATER, checking: false }, [
        bankAccount({ verificationPaymentOn: '2026-10-21' }),
      ]);

      expect(element('.add-account-watch--verified')).not.toBeNull();
      expect(text('.add-account-watch .watch-title')).toBe(
        'Platba z účtu 2900233333/2010 dorazila',
      );
      expect(texts('.add-account-watch .watch-detail')).toEqual([
        'Platby bez variabilního symbolu z něj vám přiřazujeme automaticky.',
      ]);

      await wait(60_000);
      http.expectNone(BANK_CHECK_URL);
    });

    it('and a 1 Kč from an account that was verified already brings a question, then the box points to the question', async () => {
      await wait(30_000);
      await answerCheck({ bankDataAsOf: LATER, checking: false }, [
        bankAccount({ verificationPaymentOn: '2026-10-21', symbolOffer: symbolOffer() }),
      ]);

      expect(text('.add-account-watch .watch-title')).toBe(
        'Platba z účtu 2900233333/2010 dorazila',
      );
      expect(texts('.add-account-watch .watch-detail')).toEqual([OFFER_WAITING]);
    });

    it('and the next check comes half a minute after the previous one ended, so the bank pause between checks is kept', async () => {
      await wait(30_000);
      await answerCheck({ bankDataAsOf: EARLIER, checking: false }, [bankAccount()]);

      await wait(29_000);
      http.expectNone(BANK_CHECK_URL);
      await wait(1_000);
      await answerCheck({ bankDataAsOf: LATER, checking: false }, [newAccount, bankAccount()]);

      expect(text('.add-account-watch .watch-title')).toBe('Účet 1234567890/0800 je ověřený');
    });

    it('and an account verified before by a 1 Kč reports the same payment day again, then the dialog keeps waiting', async () => {
      await click('.add-account-close');
      await respondToReload([bankAccount({ verificationPaymentOn: '2026-10-16' })]);
      await click('.accounts-add');
      http.expectOne((request) => request.url === '/api/donations/payment-qr').flush(paymentQr());

      await wait(30_000);
      await answerCheck({ bankDataAsOf: LATER, checking: false }, [
        bankAccount({ verificationPaymentOn: '2026-10-16' }),
      ]);

      expect(text('.add-account-watch .watch-title')).toBe('Čekáme na vaši platbu…');
    });

    it('and an account waiting for a payment becomes verified, then it counts as the new account', async () => {
      await click('.add-account-close');
      await respondToReload([bankAccount({ status: 'AWAITING_PAYMENT', verifiedOn: null })]);
      await click('.accounts-add');
      http.expectOne((request) => request.url === '/api/donations/payment-qr').flush(paymentQr());

      await wait(30_000);
      await answerCheck({ bankDataAsOf: LATER, checking: false }, [bankAccount()]);

      expect(text('.add-account-watch .watch-title')).toBe('Účet 2900233333/2010 je ověřený');
    });

    it('and the overview reloads the accounts with the new one, then the dialog shows the tick and stops asking the bank', async () => {
      fixture.componentInstance.reload();
      await respond([newAccount, bankAccount()]);

      expect(text('.add-account-watch .watch-title')).toBe('Účet 1234567890/0800 je ověřený');

      await wait(30_000);
      await answerCheck({ bankDataAsOf: LATER, checking: false }, [newAccount, bankAccount()]);
      await wait(60_000);
      http.expectNone(BANK_CHECK_URL);
    });

    it('and the bank check fails, then the accounts are still fetched and the dialog keeps waiting', async () => {
      await wait(30_000);
      http
        .expectOne({ method: 'POST', url: BANK_CHECK_URL })
        .flush(null, { status: 500, statusText: 'Server Error' });
      await settle();
      await respond([bankAccount()]);

      expect(text('.add-account-watch .watch-title')).toBe('Čekáme na vaši platbu…');
      expect(bankChecks).toEqual([]);
    });

    it('and no payment arrives within twenty checks, then the dialog stops, says a normal transfer can take until the next working day and can check again', async () => {
      for (let check = 0; check < 20; check++) {
        await wait(30_000);
        await answerCheck({ bankDataAsOf: EARLIER, checking: false }, [bankAccount()]);
      }

      expect(text('.add-account-watch .watch-title')).toBe('Platba zatím nedorazila');
      expect(text('.add-account-watch .watch-detail')).toBe(
        'Běžný převod může dorazit až další pracovní den. Účet se pak v přehledu objeví sám, okno nemusíte nechávat otevřené.',
      );
      await wait(60_000);
      http.expectNone(BANK_CHECK_URL);

      await click('.watch-again');
      expect(text('.add-account-watch .watch-title')).toBe('Čekáme na vaši platbu…');
      await wait(30_000);
      await answerCheck({ bankDataAsOf: LATER, checking: false }, [newAccount, bankAccount()]);

      expect(text('.add-account-watch .watch-title')).toBe('Účet 1234567890/0800 je ověřený');
    });

    it('and the page is hidden, then the bank is not asked until it is visible again, and then at once', async () => {
      setVisibility('hidden');
      await wait(120_000);
      http.expectNone(BANK_CHECK_URL);

      setVisibility('visible');
      await wait(0);
      await answerCheck({ bankDataAsOf: LATER, checking: false }, [newAccount, bankAccount()]);

      expect(text('.add-account-watch .watch-title')).toBe('Účet 1234567890/0800 je ověřený');
    });

    it('and the dialog is closed, then the bank is not asked any more', async () => {
      await click('.add-account-close');

      await wait(120_000);
      http.expectNone(BANK_CHECK_URL);
    });

    it('and the session has ended, then the dialog closes and the overview is told to send the donor to sign in', async () => {
      await wait(30_000);
      http
        .expectOne({ method: 'POST', url: BANK_CHECK_URL })
        .flush({ bankDataAsOf: EARLIER, checking: false });
      await settle();
      http.expectOne(LIST_URL).flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), {
        status: 401,
        statusText: 'Unauthorized',
      });
      await settle();

      expect(sessionEnded).toBe(1);
      expect(element('dialog')).toBeNull();
      await wait(120_000);
      http.expectNone(BANK_CHECK_URL);
    });

    async function respondToReload(items: BankAccountItem[]): Promise<void> {
      fixture.componentInstance.reload();
      await respond(items);
    }

    function setVisibility(state: DocumentVisibilityState): void {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    }

    afterEach(() => {
      Reflect.deleteProperty(document, 'visibilityState');
    });
  });
});
