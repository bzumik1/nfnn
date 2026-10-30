import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../core/auth/auth-interceptor';
import { AuthStore } from '../../core/auth/auth-store';
import { authResponse } from '../../core/auth/testing/donor-fixtures';
import { PaymentDetailsStore } from './payment-details-store';
import { PaymentDetails } from './payment-details-api';
import { foundationPaymentDetails } from './testing/payment-details-fixtures';

const PAYMENT_DETAILS_URL = '/api/donations/payment-details';
const FIVE_MINUTES_MS = 5 * 60 * 1000;

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

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function movedAccount(): PaymentDetails {
    const details = foundationPaymentDetails();
    return {
      ...details,
      account: {
        ...details.account,
        number: '19-2000145399/0800',
        iban: 'CZ6508000000192000145399',
      },
    };
  }

  function becomeVisible(): void {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
  }

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

  describe('when the details it holds are older than the five minutes the server lets a browser keep them', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      store.load();
      http.expectOne(PAYMENT_DETAILS_URL).flush(foundationPaymentDetails());
    });

    it('then a QR needed before the five minutes asks for nothing', () => {
      vi.advanceTimersByTime(FIVE_MINUTES_MS - 1);

      store.load();
      becomeVisible();

      http.expectNone(PAYMENT_DETAILS_URL);
    });

    it('then the next QR asks the server again past the browser cache, keeps the details meanwhile and takes the new account', () => {
      vi.advanceTimersByTime(FIVE_MINUTES_MS);

      store.load();

      const request = http.expectOne(PAYMENT_DETAILS_URL);
      expect(request.request.cache).toBe('no-cache');
      expect(store.state()).toEqual({ kind: 'ready', details: foundationPaymentDetails() });
      store.load();
      http.expectNone(PAYMENT_DETAILS_URL);
      request.flush(movedAccount());
      expect(store.state()).toEqual({ kind: 'ready', details: movedAccount() });
    });

    it('then the page becoming visible again asks the server again', () => {
      vi.advanceTimersByTime(FIVE_MINUTES_MS);

      becomeVisible();

      http.expectOne(PAYMENT_DETAILS_URL).flush(movedAccount());
      expect(store.state()).toEqual({ kind: 'ready', details: movedAccount() });
    });

    it('then a failed check keeps the details it holds, and the next QR asks again', () => {
      vi.advanceTimersByTime(FIVE_MINUTES_MS);
      store.load();
      http
        .expectOne(PAYMENT_DETAILS_URL)
        .flush(null, { status: 503, statusText: 'Service Unavailable' });

      expect(store.state()).toEqual({ kind: 'ready', details: foundationPaymentDetails() });
      store.load();
      http.expectOne(PAYMENT_DETAILS_URL).flush(foundationPaymentDetails());
    });
  });

  it('when a reload is asked while it holds details, then it asks the server again past the browser cache and shows the wait', () => {
    store.load();
    http.expectOne(PAYMENT_DETAILS_URL).flush(foundationPaymentDetails());

    store.reload();

    expect(store.state()).toEqual({ kind: 'loading' });
    const request = http.expectOne(PAYMENT_DETAILS_URL);
    expect(request.request.cache).toBe('no-cache');
    request.flush(movedAccount());
    expect(store.state()).toEqual({ kind: 'ready', details: movedAccount() });
  });

  it('when the answer does not have the shape of payment details, then the state is failed instead of details that break the QR', () => {
    store.load();
    http.expectOne(PAYMENT_DETAILS_URL).flush({ currency: 'CZK', messages: {} });

    expect(store.state()).toEqual({ kind: 'failed' });
  });
});
