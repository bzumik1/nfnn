import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../core/auth/auth-interceptor';
import { AuthStore } from '../../core/auth/auth-store';
import { authResponse } from '../../core/auth/testing/donor-fixtures';
import { PaymentDetailsStore } from './payment-details-store';
import { foundationPaymentDetails } from './testing/payment-details-fixtures';

const PAYMENT_DETAILS_URL = '/api/donations/payment-details';

describe('Given the payment details store', () => {
  let store: PaymentDetailsStore;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(PaymentDetailsStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when it is first asked, then it loads the payment details once and holds them', () => {
    store.load();
    store.load();

    expect(store.state()).toEqual({ kind: 'loading' });
    const request = http.expectOne(PAYMENT_DETAILS_URL);
    expect(request.request.method).toBe('GET');
    request.flush(foundationPaymentDetails());

    expect(store.state()).toEqual({ kind: 'ready', details: foundationPaymentDetails() });
    store.load();
    http.expectNone(PAYMENT_DETAILS_URL);
  });

  it('when a donor is signed in, then the request carries no access token, so an expired one cannot fail the QR', () => {
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));

    store.load();

    const request = http.expectOne(PAYMENT_DETAILS_URL);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(foundationPaymentDetails());
  });

  it('when the request fails, then the state says so and asking again loads them anew', () => {
    store.load();
    http
      .expectOne(PAYMENT_DETAILS_URL)
      .flush(null, { status: 503, statusText: 'Service Unavailable' });

    expect(store.state()).toEqual({ kind: 'failed' });

    store.load();
    expect(store.state()).toEqual({ kind: 'loading' });
    http.expectOne(PAYMENT_DETAILS_URL).flush(foundationPaymentDetails());
    expect(store.state()).toEqual({ kind: 'ready', details: foundationPaymentDetails() });
  });
});
