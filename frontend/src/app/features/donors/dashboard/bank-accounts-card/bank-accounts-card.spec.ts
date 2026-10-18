import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { authResponse, problem, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import { BankAccountItem } from '../../../donations/bank-accounts-api';
import { BankCheckResponse } from '../../../donations/donations-api';
import { PaymentQrResponse } from '../../../donations/payment-qr-api';
import { bankAccount } from '../../../donations/testing/bank-account-fixtures';
import { BankAccountsCard } from './bank-accounts-card';

const LIST_URL = '/api/donations/me/bank-accounts';
const BANK_CHECK_URL = '/api/donations/me/bank-check';
const EARLIER = '2026-10-18T08:05:00Z';
const LATER = '2026-10-18T08:07:00Z';
const ACCOUNT_ID = '0192f0c4-0000-7000-8000-000000000001';

function paymentQr(): PaymentQrResponse {
  return {
    spayd: 'SPD*1.0*ACC:CZ2620100000005544332217*AM:1.00*CC:CZK*X-VS:9876543210',
    qrPngBase64: 'iVBORw0KGgo=',
    bankAccount: { accountNumber: '5544332217/2010', iban: 'CZ2620100000005544332217', recipientName: 'Nadační fond Nová naděje' },
  };
}

describe('Given the bank accounts card in the overview', () => {
  let fixture: ComponentFixture<BankAccountsCard>;
  let http: HttpTestingController;
  let sessionEnded: number;
  let bankChecks: BankCheckResponse[];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [BankAccountsCard],
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', sampleDonor({ variableSymbol: '9876543210' })));
    fixture = TestBed.createComponent(BankAccountsCard);
    fixture.componentRef.setInput('variableSymbol', '9876543210');
    sessionEnded = 0;
    fixture.componentInstance.sessionEnded.subscribe(() => sessionEnded++);
    bankChecks = [];
    fixture.componentInstance.bankChecked.subscribe((check) => bankChecks.push(check));
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
    return [...((fixture.nativeElement as HTMLElement).querySelectorAll(selector) as NodeListOf<HTMLElement>)].map((node) =>
      normalized(node.textContent ?? ''),
    );
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
    expect(text('.account-hint')).toBe('Platby bez variabilního symbolu z něj vám přiřazujeme automaticky.');
    expect(texts('.account-meta > li')).toEqual(['ověřeno 12. 03. 2026', '14 darů bez VS', '7 400 Kč']);
    expect(text('.account-action')).toBe('Vypnout párování');
  });

  it('when an account has one gift without a symbol, then the count uses the singular', async () => {
    await respond([bankAccount({ donationCount: 1, totalAmountMinor: 50050 })]);

    expect(texts('.account-meta > li')).toEqual(['ověřeno 12. 03. 2026', '1 dar bez VS', '500,50 Kč']);
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
    expect(element('.account-hint--warning .account-hint-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(text('.account-hint--warning .visually-hidden')).toBe('Upozornění:');
    expect(text('.account-hint--warning')).toBe(
      'Upozornění: ' +
        'Tento účet ověřil i jiný dárce, proto z něj platby bez variabilního symbolu nepřiřazujeme nikomu. ' +
        'Pokud z něj dary neposíláte vy, vypněte si u tohoto účtu párování. ' +
        'Jinak z něj prosím posílejte vždy s vaším variabilním symbolem.',
    );
  });

  it('when an account is verified only by the donor, then its hint is a plain line, not a warning', async () => {
    await respond([bankAccount()]);

    expect(element('.account-hint--warning')).toBeNull();
    expect(element('.account-hint-icon')).toBeNull();
  });

  it('when an account waits for a payment, then the row says what to send and can still be disconnected', async () => {
    await respond([bankAccount({ status: 'AWAITING_PAYMENT', verifiedOn: null, donationCount: 0, totalAmountMinor: 0 })]);

    expect(text('.account-status')).toBe('Čeká na platbu');
    expect(text('.account-hint')).toBe(
      'Pošlete z účtu 1 Kč s vaším variabilním symbolem. Jakmile dorazí, přiřadíme vám z něj i platby bez symbolu ode dne zapnutí.',
    );
    expect(texts('.account-meta > li')).toEqual([]);
    expect(text('.account-action')).toBe('Vypnout párování');
  });

  it('when accounts were disconnected, then each row is muted and says the day after the last one that counted', async () => {
    await respond([
      bankAccount({ id: 'a-1', status: 'DISCONNECTED', disconnectedOn: '2026-10-18' }),
      bankAccount({ id: 'a-2', accountNumber: '19-2000145399/0800', status: 'DISCONNECTED', disconnectedOn: '2025-12-31', donationCount: 0 }),
    ]);

    expect(texts('.account-status')).toEqual(['Párování vypnuto', 'Párování vypnuto']);
    expect(element('.account')?.classList).toContain('account--disconnected');
    expect(texts('.account:nth-child(1) .account-meta > li')).toEqual([
      'ověřeno 12. 03. 2026',
      'vypnuto od 19. 10. 2026',
      '14 darů bez VS',
      '7 400 Kč',
    ]);
    expect(texts('.account:nth-child(2) .account-meta > li')).toEqual(['ověřeno 12. 03. 2026', 'vypnuto od 01. 01. 2026']);
    expect(element('.account-hint')).toBeNull();
    expect(texts('.account-action')).toEqual(['Zapnout párování', 'Zapnout párování']);
  });

  it('when an account was reconnected, then its old row offers no Zapnout párování', async () => {
    await respond([
      bankAccount({ id: 'a-new', status: 'AWAITING_PAYMENT', verifiedOn: null, donationCount: 0 }),
      bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-10-18' }),
    ]);

    expect(texts('.account-status')).toEqual(['Čeká na platbu', 'Párování vypnuto']);
    expect(texts('.account-action')).toEqual(['Vypnout párování']);
    expect(texts('.account:nth-child(2) .account-meta > li')).toContain('vypnuto od 19. 10. 2026');
  });

  it('when an account was disconnected twice, then only its newest row offers Zapnout párování', async () => {
    await respond([
      bankAccount({ id: 'a-2', status: 'DISCONNECTED', disconnectedOn: '2026-10-18' }),
      bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-09-30' }),
    ]);

    expect(texts('.account-status')).toEqual(['Párování vypnuto', 'Párování vypnuto']);
    expect(texts('.account-action')).toEqual(['Zapnout párování']);
    expect(element('.account:nth-child(1) .account-action')).not.toBeNull();
  });

  it('when the donor has no known account, then the card explains how one becomes known', async () => {
    await respond([]);

    expect(element('.accounts-list')).toBeNull();
    expect(text('.accounts-empty')).toBe(
      'Zatím jsme od vás nedostali platbu s vaším variabilním symbolem, podle které bychom poznali váš účet.',
    );
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
    http.expectOne(LIST_URL).flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), { status: 401, statusText: 'Unauthorized' });
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

  describe('when the donor presses Vypnout párování', () => {
    beforeEach(async () => {
      await respond([bankAccount()]);
      await click('.account-action');
    });

    it('then the row asks to confirm with what disconnecting means, and nothing is sent yet', () => {
      expect(text('.account-confirm-text')).toBe(
        'Platby bez variabilního symbolu, které z tohoto účtu přijdou od zítřka, vám už nebudeme přiřazovat. ' +
          'Dosavadní dary zůstanou; pokud některý z nich není váš, napište nám.',
      );
      expect(element<HTMLAnchorElement>('.account-confirm-text a')?.getAttribute('href')).toBe('mailto:info@nfnn.cz');
      expect(text('.account-confirm-yes')).toBe('Vypnout párování');
      expect(text('.account-confirm-no')).toBe('Nechat zapnuté');
      expect(element('.account-action')).toBeNull();
      expect(document.activeElement).toBe(element('.account-confirm-no'));
      http.expectNone(`${LIST_URL}/${ACCOUNT_ID}/disconnect`);
    });

    it('and cancels, then nothing is sent and the focus goes back to Vypnout párování', async () => {
      await click('.account-confirm-no');

      http.expectNone(`${LIST_URL}/${ACCOUNT_ID}/disconnect`);
      expect(element('.account-confirm')).toBeNull();
      expect(document.activeElement).toBe(element('.account-action'));
    });

    it('and confirms, then the account is disconnected, the list loads again and a status line says so', async () => {
      await click('.account-confirm-yes');

      const request = http.expectOne({ method: 'POST', url: `${LIST_URL}/${ACCOUNT_ID}/disconnect` });
      expect(request.request.body).toBeNull();
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      await respond([bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-10-18' })]);

      expect(text('.account-status')).toBe('Párování vypnuto');
      expect(text('.accounts-status')).toBe('Párování z účtu jsme vypnuli.');
      expect(document.activeElement).toBe(element('h2'));
    });

    it('and the account was disconnected meanwhile, then the problem shows and the list loads again', async () => {
      await click('.account-confirm-yes');

      http
        .expectOne(`${LIST_URL}/${ACCOUNT_ID}/disconnect`)
        .flush(
          { ...problem('donations/bank-account-already-disconnected', 'Párování z účtu je už vypnuté'), status: 409 },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();
      await respond([bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-10-18' })]);

      expect(element('.accounts-error')?.getAttribute('role')).toBe('alert');
      expect(text('.accounts-error')).toBe('Párování z účtu je už vypnuté.');
      expect(text('.account-status')).toBe('Párování vypnuto');
    });

    it('and the request fails without a problem, then a generic line asks to try again', async () => {
      await click('.account-confirm-yes');

      http.expectOne(`${LIST_URL}/${ACCOUNT_ID}/disconnect`).flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text('.accounts-error')).toBe('Účet se nepodařilo změnit. Zkuste to prosím znovu.');
      expect(element('.account-confirm')).not.toBeNull();
      expect((element('.account-confirm-yes') as HTMLButtonElement).disabled).toBe(false);
    });

    it('and the session has ended, then the overview is told to send the donor to sign in', async () => {
      await click('.account-confirm-yes');

      http
        .expectOne(`${LIST_URL}/${ACCOUNT_ID}/disconnect`)
        .flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), { status: 401, statusText: 'Unauthorized' });
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

    expect(texts('.account-status')).toEqual(['Čeká na platbu', 'Párování vypnuto']);
    expect(texts('.account-action')).toEqual(['Vypnout párování']);
    expect(text('.accounts-status')).toBe('Účet čeká na vaši platbu 1 Kč.');
  });

  it('when reconnecting is refused because the account is connected already, then the problem shows and the list loads again', async () => {
    await respond([bankAccount({ status: 'DISCONNECTED', disconnectedOn: '2026-10-18' })]);

    await click('.account-action');
    http
      .expectOne(`${LIST_URL}/${ACCOUNT_ID}/reconnect`)
      .flush(
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
      expect(text('.add-account-text')).toBe(
        'Pošlete z účtu, který chcete přidat, 1 Kč (nebo jakýkoli dar) s vaším variabilním symbolem 9876543210. ' +
          'Jakmile platba dorazí, účet se tu objeví a přiřadíme k vám i dřívější dary z něj, které přišly bez symbolu. ' +
          'Okamžitá platba dorazí do pár minut, běžný převod obvykle do dalšího pracovního dne. Funguje jen český účet.',
      );
      expect(texts('.add-account-text strong')).toEqual(['1 Kč', '9876543210']);
      expect(text('.add-account-qr')).toBe('Připravujeme QR kód…');

      const request = http.expectOne({ method: 'GET', url: '/api/donations/payment-qr?amount=1&variableSymbol=9876543210&purpose=ACCOUNT_VERIFICATION' });
      request.flush(paymentQr());
      await settle();

      expect(element<HTMLImageElement>('.add-account-qr img')?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
      expect(texts('.add-account-bank dd .bank-value')).toEqual(['5544332217/2010', '1 Kč', 'Ověření účtu Nadační fond Nová naděje', '9876543210']);
      expect(texts('.add-account-bank app-copy-button button')).toEqual(['Kopírovat číslo účtu', 'Kopírovat variabilní symbol']);
    });

    it('and the QR payment cannot be prepared, then the dialog says so and a retry asks again', async () => {
      http.expectOne((request) => request.url === '/api/donations/payment-qr').flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text('.add-account-qr-error')).toContain('QR platbu se nepodařilo připravit.');

      await click('.add-account-qr-retry');
      http.expectOne((request) => request.url === '/api/donations/payment-qr').flush(paymentQr());
      await settle();

      expect(element('.add-account-qr img')).not.toBeNull();
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
    const newAccount = bankAccount({ id: '0192f0c4-0000-7000-8000-000000000002', accountNumber: '1234567890/0800', donationCount: 0 });

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
      http.expectOne({ method: 'POST', url: BANK_CHECK_URL }).flush(check, { status: 202, statusText: 'Accepted' });
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
      http.expectOne({ method: 'POST', url: BANK_CHECK_URL }).flush({ bankDataAsOf: EARLIER, checking: true });
      await wait(2_000);
      http.expectOne({ method: 'GET', url: BANK_CHECK_URL }).flush({ bankDataAsOf: LATER, checking: false });
      await settle();
      await respond([newAccount, bankAccount()]);

      expect(element('.add-account-watch--verified')).not.toBeNull();
      expect(element('.watch-icon--verified')).not.toBeNull();
      expect(element('.watch-icon--waiting')).toBeNull();
      expect(text('.add-account-watch .watch-title')).toBe('Účet 1234567890/0800 je ověřený');
      expect(text('.add-account-watch .watch-detail')).toBe('Platby bez variabilního symbolu z něj vám přiřazujeme automaticky.');
      expect(bankChecks).toEqual([{ bankDataAsOf: LATER, checking: false }]);

      await wait(60_000);
      http.expectNone(BANK_CHECK_URL);
    });

    it('and the account verified in the dialog is shared, then the verified box shows the warning, not a plain line', async () => {
      await wait(30_000);
      await answerCheck({ bankDataAsOf: LATER, checking: false }, [{ ...newAccount, shared: true }, bankAccount()]);

      expect(text('.add-account-watch .watch-title')).toBe('Účet 1234567890/0800 je ověřený');
      expect(element('.add-account-watch .account-hint--warning .account-hint-icon')?.getAttribute('aria-hidden')).toBe('true');
      expect(text('.add-account-watch .account-hint--warning .visually-hidden')).toBe('Upozornění:');
      expect(text('.add-account-watch .account-hint--warning')).toBe(
        'Upozornění: ' +
          'Tento účet ověřil i jiný dárce, proto z něj platby bez variabilního symbolu nepřiřazujeme nikomu. ' +
          'Pokud z něj dary neposíláte vy, vypněte si u tohoto účtu párování. ' +
          'Jinak z něj prosím posílejte vždy s vaším variabilním symbolem.',
      );
      expect(element('.add-account-watch .watch-detail')).toBeNull();
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
      http.expectOne({ method: 'POST', url: BANK_CHECK_URL }).flush(null, { status: 500, statusText: 'Server Error' });
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
      http.expectOne({ method: 'POST', url: BANK_CHECK_URL }).flush({ bankDataAsOf: EARLIER, checking: false });
      await settle();
      http.expectOne(LIST_URL).flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), { status: 401, statusText: 'Unauthorized' });
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
