import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PaymentQrApi, PaymentQrResponse } from './payment-qr-api';

const bankAccount = {
  accountNumber: '5544332217/2010',
  iban: 'CZ2620100000005544332217',
  recipientName: 'Nadační fond Nová naděje',
};

const qrPayment: PaymentQrResponse = {
  spayd: 'SPD*1.0',
  qrCode: { size: 0, modules: '' },
  bankAccount,
};

describe('Given the payment QR API', () => {
  let api: PaymentQrApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(PaymentQrApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when a donation QR payment is asked for, then it sends the amount and the variable symbol and no purpose', () => {
    api.paymentQr(500, '1234567890').subscribe();

    const request = http.expectOne(
      '/api/donations/payment-qr?amount=500&variableSymbol=1234567890',
    );
    expect(request.request.method).toBe('GET');
    request.flush(qrPayment);
  });

  it('when an anonymous donation QR payment is asked for, then it sends only the amount', () => {
    api.paymentQr(100, null).subscribe();

    http.expectOne('/api/donations/payment-qr?amount=100').flush(qrPayment);
  });

  it('when an account verification QR payment is asked for, then it sends that purpose', () => {
    api.paymentQr(1, '1234567890', 'ACCOUNT_VERIFICATION').subscribe();

    http
      .expectOne(
        '/api/donations/payment-qr?amount=1&variableSymbol=1234567890&purpose=ACCOUNT_VERIFICATION',
      )
      .flush(qrPayment);
  });

  it('when no QR payment has arrived yet, then the foundation account is not known', () => {
    expect(api.foundationAccount()).toBeNull();
  });

  it('when a QR payment arrives, then the foundation account it names is known to the whole site', () => {
    api.paymentQr(500, null).subscribe();

    http.expectOne('/api/donations/payment-qr?amount=500').flush(qrPayment);

    expect(api.foundationAccount()).toEqual(bankAccount);
  });
});
