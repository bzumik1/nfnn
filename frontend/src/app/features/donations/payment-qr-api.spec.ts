import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PaymentQrApi } from './payment-qr-api';

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

    const request = http.expectOne('/api/donations/payment-qr?amount=500&variableSymbol=1234567890');
    expect(request.request.method).toBe('GET');
    request.flush(null);
  });

  it('when an anonymous donation QR payment is asked for, then it sends only the amount', () => {
    api.paymentQr(100, null).subscribe();

    http.expectOne('/api/donations/payment-qr?amount=100').flush(null);
  });

  it('when an account verification QR payment is asked for, then it sends that purpose', () => {
    api.paymentQr(1, '1234567890', 'ACCOUNT_VERIFICATION').subscribe();

    http.expectOne('/api/donations/payment-qr?amount=1&variableSymbol=1234567890&purpose=ACCOUNT_VERIFICATION').flush(null);
  });
});
