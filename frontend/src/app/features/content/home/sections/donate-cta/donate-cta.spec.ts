import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PaymentQrResponse } from '../../../../donations/payment-qr-api';
import { DonateCta } from './donate-cta';

const PAYMENT_QR_URL = '/api/donations/payment-qr';
const DEBOUNCE_MS = 300;

function paymentQr(amount: string): PaymentQrResponse {
  return {
    spayd: `SPD*1.0*ACC:CZ2620100000005544332217*AM:${amount}*CC:CZK`,
    qrPngBase64: `png-for-${amount}`,
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
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
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

  async function enterCustomAmount(value: string): Promise<void> {
    button('Jiná částka').click();
    fixture.detectChanges();
    const input = element<HTMLInputElement>('#donate-custom-amount');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  it('when it opens, then it asks for a QR payment of 500 Kč without a variable symbol and shows the QR and the bank account', async () => {
    await settle();

    const request = expectQrRequest();
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('amount')).toBe('500');
    expect(request.request.params.has('variableSymbol')).toBe(false);
    respond(request);

    const image = element<HTMLImageElement>('.qr-code img');
    expect(image.getAttribute('src')).toBe('data:image/png;base64,png-for-500.00');
    expect(image.alt).toContain('QR');
    expect(text('.bank')).toContain('5544332217/2010');
    expect(text('.bank')).toContain('CZ26 2010 0000 0055 4433 2217');
    expect(text('.bank')).not.toContain('Variabilní symbol');
    expect(button('500 Kč').getAttribute('aria-pressed')).toBe('true');
  });

  it('when it opens, then it offers the amounts from the largest down, with another amount last', async () => {
    await settle();
    respond(expectQrRequest());

    const labels = Array.from(fixture.nativeElement.querySelectorAll('.amount-option') as NodeListOf<HTMLButtonElement>).map(
      (option) => option.textContent?.trim(),
    );
    expect(labels).toEqual(['1 000 Kč', '500 Kč', '100 Kč', 'Jiná částka']);
  });

  it('when the QR is on its way, then it says it is being prepared', async () => {
    await settle();

    expect(text('.qr-code')).toContain('Připravujeme QR kód');
    respond(expectQrRequest());
    expect(text('.qr-code')).not.toContain('Připravujeme QR kód');
  });

  it('when the visitor picks 1 000 Kč, then it asks for the QR payment again with that amount', async () => {
    await settle();
    respond(expectQrRequest());

    button('1 000 Kč').click();
    await settle();

    const request = expectQrRequest();
    expect(request.request.params.get('amount')).toBe('1000');
    respond(request);
    expect(element<HTMLImageElement>('.qr-code img').getAttribute('src')).toBe('data:image/png;base64,png-for-1000.00');
    expect(button('1 000 Kč').getAttribute('aria-pressed')).toBe('true');
    expect(button('500 Kč').getAttribute('aria-pressed')).toBe('false');
  });

  it('when the visitor enters another amount, then it asks for the QR payment of that amount', async () => {
    await settle();
    respond(expectQrRequest());

    await enterCustomAmount('250');

    const request = expectQrRequest();
    expect(request.request.params.get('amount')).toBe('250');
    respond(request);
  });

  it('when the visitor enters an amount that is not a whole number from 1 to 1 000 000, then nothing is asked for and a hint explains why', async () => {
    await settle();
    respond(expectQrRequest());

    await enterCustomAmount('12.5');

    http.expectNone((request) => request.url === PAYMENT_QR_URL);
    expect(text('.amount-hint')).toContain('celou částku od 1 do 1 000 000 Kč');
    expect(element('.qr-code img')).toBeNull();
  });

  it('when the visitor clicks through amounts quickly, then only the last one is asked for', async () => {
    await settle();
    respond(expectQrRequest());

    button('100 Kč').click();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 3);
    button('1 000 Kč').click();
    await settle();

    const requests = http.match((request) => request.url === PAYMENT_QR_URL);
    expect(requests.map((request) => request.request.params.get('amount'))).toEqual(['1000']);
    respond(requests[0]);
  });

  it('when the amount changes before the QR arrives, then the stale request is cancelled', async () => {
    await settle();
    const stale = expectQrRequest();

    button('100 Kč').click();
    await settle();

    expect(stale.cancelled).toBe(true);
    const fresh = expectQrRequest();
    expect(fresh.request.params.get('amount')).toBe('100');
    respond(fresh);
  });

  it('when the server fails, then it says so in Czech and asking again loads the QR', async () => {
    await settle();

    expectQrRequest().flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(element('.qr-code img')).toBeNull();
    expect(text('.qr-error')).toContain('QR platbu se nepodařilo připravit');

    button('Zkusit znovu').click();
    await settle();

    respond(expectQrRequest());
    expect(element('.qr-code img')).not.toBeNull();
    expect(element('.qr-error')).toBeNull();
  });

  describe('Given a signed-in donor with a variable symbol', () => {
    it('when the section opens, then the variable symbol travels with the request and is shown with the bank account', async () => {
      fixture.componentRef.setInput('variableSymbol', '1234567890');

      await settle();

      const request = expectQrRequest();
      expect(request.request.params.get('amount')).toBe('500');
      expect(request.request.params.get('variableSymbol')).toBe('1234567890');
      respond(request);
      expect(text('.bank')).toContain('Variabilní symbol');
      expect(text('.bank')).toContain('1234567890');
    });
  });
});
