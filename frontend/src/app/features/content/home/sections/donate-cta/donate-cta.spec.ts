import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginDialogService } from '../../../../../core/auth/login-dialog.service';
import { QrCode } from '../../../../../shared/ui/qr-code/qr-code';
import { QrMatrix } from '../../../../../shared/ui/qr-code/qr-matrix';
import { qrMatrix } from '../../../../../shared/ui/qr-code/testing/qr-matrices';
import { PaymentQrResponse } from '../../../../donations/payment-qr-api';
import { DonateCta } from './donate-cta';

const PAYMENT_QR_URL = '/api/donations/payment-qr';
const DEBOUNCE_MS = 300;

function matrixFor(amount: string): QrMatrix {
  const seed = Number.parseInt(amount, 10);
  return qrMatrix(25, (column, row) => (column * 7 + row * 3 + seed) % 5 < 2);
}

function paymentQr(amount: string): PaymentQrResponse {
  return {
    spayd: `SPD*1.0*ACC:CZ2620100000005544332217*AM:${amount}*CC:CZK`,
    qrCode: matrixFor(amount),
    bankAccount: {
      accountNumber: '5544332217/2010',
      iban: 'CZ2620100000005544332217',
      recipientName: 'Nadační fond Nová naděje',
    },
  };
}

describe('Given the donate section', () => {
  let fixture: ComponentFixture<DonateCta>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DonateCta],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(DonateCta);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function element<T extends HTMLElement>(selector: string): T {
    return fixture.nativeElement.querySelector(selector) as T;
  }

  function text(selector: string): string {
    return element(selector)?.textContent ?? '';
  }

  function button(label: string): HTMLButtonElement {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const match = buttons.find((candidate) => candidate.textContent?.trim() === label);
    if (!match) {
      throw new Error(`No button labelled "${label}"`);
    }
    return match;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    fixture.detectChanges();
  }

  function expectQrRequest(): TestRequest {
    return http.expectOne((request) => request.url === PAYMENT_QR_URL);
  }

  function respond(request: TestRequest): void {
    request.flush(paymentQr(`${request.request.params.get('amount')}.00`));
    fixture.detectChanges();
  }

  function respondToPrefetch(): (string | null)[] {
    const requests = http.match((request) => request.url === PAYMENT_QR_URL);
    requests.forEach((request) => respond(request));
    return requests.map((request) => request.request.params.get('amount'));
  }

  async function openWithQr(): Promise<void> {
    await settle();
    respond(expectQrRequest());
    respondToPrefetch();
  }

  function qrCode(): SVGSVGElement | null {
    return fixture.nativeElement.querySelector('.qr-code svg[role="img"]');
  }

  function drawnMatrixIs(matrix: QrMatrix): boolean {
    const dots = Array.from(qrCode()?.querySelectorAll('circle.qr-dot') ?? []);
    return (
      dots.length > 0 &&
      dots.every((dot) => {
        const column = Number(dot.getAttribute('cx')) - 4.5;
        const row = Number(dot.getAttribute('cy')) - 4.5;
        const dark = matrix.modules[row * matrix.size + column] === '1';
        return dark !== dot.classList.contains('is-off');
      })
    );
  }

  async function enterCustomAmount(value: string): Promise<void> {
    button('Jiná částka').click();
    fixture.detectChanges();
    const input = element<HTMLInputElement>('#donate-custom-amount');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  it('when it renders, then its photo waits until it is near and comes in two widths', async () => {
    await openWithQr();
    const image = element<HTMLImageElement>('.donate-img img');

    expect(image.getAttribute('srcset')).toBe(
      '/images/donate-720.webp 720w, /images/donate-1440.webp 1440w',
    );
    expect(image.getAttribute('loading')).toBe('lazy');
  });

  it('when it opens, then it asks for a QR payment of 500 Kč without a variable symbol and shows the QR and the bank account', async () => {
    await settle();

    const request = expectQrRequest();
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('amount')).toBe('500');
    expect(request.request.params.has('variableSymbol')).toBe(false);
    respond(request);
    respondToPrefetch();

    expect(qrCode()?.getAttribute('aria-label')).toBe(
      'QR platba na účet Nadačního fondu Nová naděje',
    );
    expect(drawnMatrixIs(matrixFor('500'))).toBe(true);
    expect(text('.bank')).toContain('5544332217/2010');
    expect(text('.bank')).toContain('CZ26 2010 0000 0055 4433 2217');
    expect(text('.bank')).not.toContain('Variabilní symbol');
    expect(button('500 Kč').getAttribute('aria-pressed')).toBe('true');
  });

  function squashed(selector: string): string {
    return text(selector).replace(/\s+/g, ' ').trim();
  }

  function stepOrder(): string[] {
    const steps = ['.amount', '.before-pay', '.bank', '.qr', '.next'];
    return Array.from(
      fixture.nativeElement.querySelectorAll(steps.join(', ')) as NodeListOf<Element>,
    ).map((step) => steps.find((selector) => step.matches(selector)) ?? '');
  }

  it('when it renders, then the section is introduced as Přispět with a heading about the gift and one sentence why', async () => {
    await openWithQr();

    expect(text('.ui-eyebrow').trim()).toBe('Přispět');
    expect(text('h2').trim()).toBe('Přispějte na pomůcky pro děti');
    expect(squashed('.lead')).toBe(
      'Z darů pořizujeme zdravotní a kompenzační pomůcky a přístroje pro konkrétní děti.',
    );
  });

  it('when it renders, then the steps follow one order: amount, the line before paying, bank details, QR and what comes next', async () => {
    await openWithQr();

    expect(stepOrder()).toEqual(['.amount', '.before-pay', '.bank', '.qr', '.next']);
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('h3') as NodeListOf<Element>).map(
        (heading) => heading.textContent?.trim(),
      ),
    ).toEqual(['Zaplaťte', 'Co bude dál']);
  });

  it('when nobody is signed in, then before the payment a line offers the receipt for the tax return with the account actions', async () => {
    await openWithQr();

    expect(squashed('.before-pay p')).toBe(
      'Chcete potvrzení o daru pro daňové přiznání? Přihlaste se nebo si založte účet ještě před platbou: QR kód pak ponese váš variabilní symbol.',
    );
    expect(element('.before-pay .account-register')).not.toBeNull();
    expect(element('.before-pay .account-sign-in')).not.toBeNull();
  });

  it('when nobody is signed in, then what comes next says how an earlier gift can still be paired and where the yearly receipt is', async () => {
    await openWithQr();

    const items = Array.from(
      fixture.nativeElement.querySelectorAll('.next li') as NodeListOf<Element>,
    ).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(items).toEqual([
      'Platili jste bez přihlášení? Po registraci si v sekci Bankovní účty přidejte svůj účet ověřovací platbou 1 Kč a dřívější dary z něj se vám přiřadí také.',
      'S účtem dárce si po skončení roku stáhnete roční potvrzení o daru. Dar si můžete odečíst od základu daně podle zákona o daních z příjmů.',
    ]);
  });

  it('when it opens, then it offers the amounts from the largest down, with another amount last', async () => {
    await openWithQr();

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.amount-option') as NodeListOf<HTMLButtonElement>,
    ).map((option) => option.textContent?.trim());
    expect(labels).toEqual(['1 000 Kč', '500 Kč', '100 Kč', 'Jiná částka']);
  });

  it('when the QR is on its way, then it says it is being prepared', async () => {
    await settle();

    expect(text('.qr-code')).toContain('Připravujeme QR kód');
    respond(expectQrRequest());
    respondToPrefetch();
    expect(text('.qr-code')).not.toContain('Připravujeme QR kód');
  });

  it('when the first QR is ready, then the other preset amounts are fetched ahead', async () => {
    await settle();
    respond(expectQrRequest());

    expect(respondToPrefetch()).toEqual(['1000', '100']);
  });

  it('when the visitor picks 1 000 Kč, then its fetched-ahead QR payment is drawn at once without asking again', async () => {
    await openWithQr();

    button('1 000 Kč').click();
    fixture.detectChanges();
    await fixture.whenStable();

    http.expectNone((request) => request.url === PAYMENT_QR_URL);
    expect(drawnMatrixIs(matrixFor('1000'))).toBe(true);
    expect(text('.qr-code')).not.toContain('Připravujeme QR kód');
    expect(button('1 000 Kč').getAttribute('aria-pressed')).toBe('true');
    expect(button('500 Kč').getAttribute('aria-pressed')).toBe('false');
  });

  it('when the visitor enters another amount, then it asks for the QR payment of that amount', async () => {
    await openWithQr();

    await enterCustomAmount('250');

    const request = expectQrRequest();
    expect(request.request.params.get('amount')).toBe('250');
    respond(request);
    expect(drawnMatrixIs(matrixFor('250'))).toBe(true);
  });

  it('when the QR for another amount is on its way, then the previous QR stays until the new one replaces it', async () => {
    await openWithQr();

    await enterCustomAmount('250');

    expect(element('.qr-code').getAttribute('aria-busy')).toBe('true');
    expect(drawnMatrixIs(matrixFor('500'))).toBe(true);
    expect(element<HTMLButtonElement>('.qr-save').disabled).toBe(true);
    respond(expectQrRequest());
    expect(element('.qr-code').getAttribute('aria-busy')).toBe('false');
    expect(element<HTMLButtonElement>('.qr-save').disabled).toBe(false);
  });

  it('when the section opens, then its status region is there and stays quiet', async () => {
    await openWithQr();

    expect(element('.qr-announcement[role="status"]').textContent?.trim()).toBe('');
    expect(element('.qr-text').hasAttribute('aria-live')).toBe(false);
  });

  it('when the visitor picks another amount, then the status region says the QR for that amount is ready', async () => {
    await openWithQr();

    button('1 000 Kč').click();
    await settle();

    expect(element('.qr-announcement[role="status"]').textContent?.replace(/\s/g, ' ').trim()).toBe(
      'QR platba na 1 000 Kč je připravená.',
    );
  });

  it('when the visitor enters an amount that is not a whole number from 1 to 1 000 000, then nothing is asked for and a hint explains why', async () => {
    await openWithQr();

    await enterCustomAmount('12.5');

    http.expectNone((request) => request.url === PAYMENT_QR_URL);
    expect(element('.amount-hint')).toBeNull();

    element('#donate-custom-amount').dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(text('.amount-hint')).toContain('celou částku od 1 do 1 000 000 Kč');
    expect(qrCode()).toBeNull();
  });

  it('when the visitor writes the amount with a space between thousands, then it asks for that amount', async () => {
    await openWithQr();

    await enterCustomAmount('2 500');

    const request = expectQrRequest();
    expect(request.request.params.get('amount')).toBe('2500');
    respond(request);
  });

  it('when the QR is ready, then the bank details list the account, the amount and the IBAN, each with a copy button', async () => {
    await openWithQr();

    const rows = Array.from(fixture.nativeElement.querySelectorAll('.bank-row')) as HTMLElement[];
    expect(rows.map((row) => row.querySelector('.bank-key')?.textContent?.trim())).toEqual([
      'Číslo účtu',
      'Částka',
      'IBAN',
    ]);
    expect(rows[1].querySelector('.bank-value')?.textContent?.replace(/\s/g, ' ').trim()).toBe(
      '500 Kč',
    );
    const copied = rows.map((row) =>
      row.querySelector('app-copy-button button')?.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(copied).toEqual(['Kopírovat číslo účtu', 'Kopírovat částku', 'Kopírovat IBAN']);
  });

  it('when the visitor saves the QR, then a PNG of it downloads for the banking app', async () => {
    await openWithQr();
    vi.spyOn(QrCode.prototype, 'pngDataUrl').mockResolvedValue('data:image/png;base64,AAAA');
    const downloads: { href: string; name: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ href: this.href, name: this.download });
    });

    button('Uložit QR kód').click();
    await vi.waitFor(() => expect(downloads).toHaveLength(1));

    expect(downloads[0]).toEqual({
      href: 'data:image/png;base64,AAAA',
      name: 'qr-platba-nova-nadeje.png',
    });
    vi.restoreAllMocks();
  });

  it('when nobody is signed in, then it offers to create an account and opens the registration', async () => {
    await openWithQr();

    button('Založit účet').click();

    const dialog = TestBed.inject(LoginDialogService);
    expect(dialog.isOpen()).toBe(true);
    expect(dialog.initialMode()).toBe('register');
  });

  it('when nobody is signed in and the visitor signs in from it, then the page stays and the bank details with their variable symbol take the focus', async () => {
    document.body.appendChild(fixture.nativeElement);
    await openWithQr();
    button('Přihlásit se').focus();
    button('Přihlásit se').click();
    const dialog = TestBed.inject(LoginDialogService);
    expect(dialog.isOpen()).toBe(true);
    expect(dialog.initialMode()).toBe('login');

    fixture.componentRef.setInput('variableSymbol', '1234567890');
    dialog.signedIn();
    await settle();
    respond(expectQrRequest());
    respondToPrefetch();

    expect(document.activeElement).toBe(element('.bank .panel-label'));
    expect(text('.bank')).toContain('1234567890');
    fixture.nativeElement.remove();
  });

  it('when it renders, then nothing in it sends the visitor to the contact form', async () => {
    await openWithQr();

    expect(element('a[href*="contact"]')).toBeNull();
  });

  it('when the visitor is still typing an amount, then only the finished amount is asked for', async () => {
    await openWithQr();
    button('Jiná částka').click();
    fixture.detectChanges();
    const input = element<HTMLInputElement>('#donate-custom-amount');

    for (const typed of ['2', '25', '250']) {
      input.value = typed;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 3);
    }
    await settle();

    const requests = http.match((request) => request.url === PAYMENT_QR_URL);
    expect(requests.map((request) => request.request.params.get('amount'))).toEqual(['250']);
    respond(requests[0]);
  });

  it('when the amount changes before the QR arrives, then the late answer for the old amount does not replace the new QR', async () => {
    await settle();
    const stale = expectQrRequest();

    button('100 Kč').click();
    await settle();

    const fresh = expectQrRequest();
    expect(fresh.request.params.get('amount')).toBe('100');
    respond(fresh);
    respond(stale);
    respondToPrefetch();

    expect(drawnMatrixIs(matrixFor('100'))).toBe(true);
  });

  it('when the server fails, then it says so in Czech and asking again loads the QR', async () => {
    await settle();

    expectQrRequest().flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(qrCode()).toBeNull();
    expect(text('.qr-error')).toContain('QR platbu se nepodařilo připravit');

    button('Zkusit znovu').click();
    await settle();

    respond(expectQrRequest());
    respondToPrefetch();
    expect(qrCode()).not.toBeNull();
    expect(element('.qr-error')).toBeNull();
  });

  describe('Given a signed-in donor with a variable symbol', () => {
    it('when the section opens, then the variable symbol travels with the request and is shown with the bank account', async () => {
      fixture.componentRef.setInput('variableSymbol', '1234567890');
      fixture.componentRef.setInput('donorName', 'Jana Nováková');

      await settle();

      const request = expectQrRequest();
      expect(request.request.params.get('amount')).toBe('500');
      expect(request.request.params.get('variableSymbol')).toBe('1234567890');
      respond(request);
      const prefetched = http.match((pending) => pending.url === PAYMENT_QR_URL);
      expect(prefetched.map((pending) => pending.request.params.get('variableSymbol'))).toEqual([
        '1234567890',
        '1234567890',
      ]);
      prefetched.forEach((pending) => respond(pending));
      expect(text('.bank')).toContain('Variabilní symbol');
      expect(text('.bank')).toContain('1234567890');
      const items = Array.from(
        fixture.nativeElement.querySelectorAll('.next li') as NodeListOf<Element>,
      ).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
      expect(items).toEqual([
        'Dar se ve vašem přehledu objeví do hodiny poté, co ho banka připíše. Převod z jiné banky k nám obvykle dorazí do následujícího pracovního dne.',
        'Po skončení roku si ve svém účtu dárce stáhnete roční potvrzení o daru. Dar si můžete odečíst od základu daně podle zákona o daních z příjmů.',
      ]);
      expect(squashed('.before-pay')).toBe(
        'Platíte jako Jana Nováková, variabilní symbol 1234567890.',
      );
      const keys = Array.from(fixture.nativeElement.querySelectorAll('.bank-key')).map((key) =>
        (key as HTMLElement).textContent?.trim(),
      );
      expect(keys).toEqual(['Číslo účtu', 'Částka', 'Variabilní symbol', 'IBAN']);
      expect(fixture.nativeElement.textContent).not.toContain('Založit účet');
    });
  });
});
