import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../core/auth/auth-interceptor';
import { AuthStore } from '../../core/auth/auth-store';
import { authResponse } from '../../core/auth/testing/donor-fixtures';
import { Connectivity, PROBE_PATH } from '../../core/connectivity/connectivity';
import { sharedCases } from '../../../testing/shared-cases';
import { KEPT_PAYMENT_DETAILS, PaymentDetailsStore } from './payment-details-store';
import { PaymentDetails } from './payment-details-api';
import { spayd } from './spayd';
import {
  FOUNDATION_DETAILS_CASE,
  foundationPaymentDetails,
} from './testing/payment-details-fixtures';

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
    vi.restoreAllMocks();
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
    expect(request.request.headers.has('Cache-Control')).toBe(false);
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
      expect(request.request.headers.get('Cache-Control')).toBe('no-cache');
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

    it('then the check repeats once the details it brought are five minutes old again', () => {
      vi.advanceTimersByTime(FIVE_MINUTES_MS);
      store.load();
      http.expectOne(PAYMENT_DETAILS_URL).flush(foundationPaymentDetails());

      vi.advanceTimersByTime(FIVE_MINUTES_MS - 1);
      store.load();
      http.expectNone(PAYMENT_DETAILS_URL);
      vi.advanceTimersByTime(1);
      store.load();

      const second = http.expectOne(PAYMENT_DETAILS_URL);
      expect(second.request.headers.get('Cache-Control')).toBe('no-cache');
      second.flush(movedAccount());
      expect(store.state()).toEqual({ kind: 'ready', details: movedAccount() });
    });

    it('then the five minutes count from the load even when the wall clock is set back', () => {
      vi.setSystemTime(Date.now() - 60 * 60 * 1000);
      vi.advanceTimersByTime(FIVE_MINUTES_MS);

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
    expect(request.request.headers.get('Cache-Control')).toBe('no-cache');
    expect(request.request.cache).toBe('no-cache');
    request.flush(movedAccount());
    expect(store.state()).toEqual({ kind: 'ready', details: movedAccount() });
  });

  it.each([
    ['without the verification amount', { accountVerificationAmountMinor: undefined }],
    ['with the verification amount as text', { accountVerificationAmountMinor: '100' }],
  ])(
    'when an otherwise complete answer comes %s, then the state is failed instead of a QR that cannot be drawn',
    (_, change) => {
      store.load();
      http.expectOne(PAYMENT_DETAILS_URL).flush({ ...foundationPaymentDetails(), ...change });

      expect(store.state()).toEqual({ kind: 'failed' });
    },
  );

  it('when the IBAN of the answer is not the IBAN of its account number, then the state is failed, so no page shows the account', () => {
    store.load();
    const details = foundationPaymentDetails();
    http.expectOne(PAYMENT_DETAILS_URL).flush({
      ...details,
      account: { ...details.account, iban: 'CZ6508000000192000145399' },
    });

    expect(store.state()).toEqual({ kind: 'failed' });
  });

  it('when its injector is destroyed, then it stops listening for the page becoming visible', () => {
    TestBed.resetTestingModule();
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(PaymentDetailsStore);
    const listener = added.mock.calls.find(([type]) => type === 'visibilitychange')?.[1];

    TestBed.resetTestingModule();

    expect(listener).toBeDefined();
    expect(removed).toHaveBeenCalledWith('visibilitychange', listener);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('when the answer does not have the shape of payment details, then the state is failed instead of details that break the QR', () => {
    store.load();
    http.expectOne(PAYMENT_DETAILS_URL).flush({ currency: 'CZK', messages: {} });

    expect(store.state()).toEqual({ kind: 'failed' });
  });

  describe('when the details arrive with the time the server wrote them', () => {
    const written = new Date('2026-10-12T08:00:00Z');

    beforeEach(() => {
      store.load();
      http
        .expectOne(PAYMENT_DETAILS_URL)
        .flush(foundationPaymentDetails(), { headers: { Date: written.toUTCString() } });
    });

    it('then it says how old they are and that they came from the server', () => {
      expect(store.age()).toEqual({ writtenAt: written.getTime(), kept: false });
    });

    it('then it keeps them on the device with that time, for a visit without a connection', () => {
      expect(JSON.parse(localStorage.getItem(KEPT_PAYMENT_DETAILS)!)).toEqual({
        details: foundationPaymentDetails(),
        writtenAt: written.getTime(),
      });
    });
  });

  it('when the browser refuses to keep the details, then the details from the server are still shown', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    store.load();
    http.expectOne(PAYMENT_DETAILS_URL).flush(foundationPaymentDetails());

    expect(store.state()).toEqual({ kind: 'ready', details: foundationPaymentDetails() });
  });

  describe('Given details kept from an earlier visit', () => {
    const written = Date.parse('2026-10-12T08:00:00Z');

    beforeEach(() => {
      localStorage.setItem(
        KEPT_PAYMENT_DETAILS,
        JSON.stringify({ details: foundationPaymentDetails(), writtenAt: written }),
      );
    });

    it('when the server answers, then its answer wins and nothing kept is shown', () => {
      store.load();
      http.expectOne(PAYMENT_DETAILS_URL).flush(movedAccount());

      expect(store.state()).toEqual({ kind: 'ready', details: movedAccount() });
      expect(store.age()).toEqual({ writtenAt: null, kept: false });
    });

    describe('when the app already knows it is offline', () => {
      beforeEach(() => {
        TestBed.inject(Connectivity);
        window.dispatchEvent(new Event('offline'));
        http.expectOne(PROBE_PATH).error(new ProgressEvent('error'), { status: 0 });
        store.load();
      });

      it('then the kept details are shown at once, said to be kept, while the server is still asked', () => {
        expect(store.state()).toEqual({ kind: 'ready', details: foundationPaymentDetails() });
        expect(store.age()).toEqual({ writtenAt: written, kept: true });
        http.expectOne(PAYMENT_DETAILS_URL).error(new ProgressEvent('error'), { status: 0 });
        expect(store.age()).toEqual({ writtenAt: written, kept: true });
      });

      it('and the server answers after all, then its answer wins', () => {
        http.expectOne(PAYMENT_DETAILS_URL).flush(movedAccount());

        expect(store.state()).toEqual({ kind: 'ready', details: movedAccount() });
        expect(store.age()).toEqual({ writtenAt: null, kept: false });
      });

      it('and the server answers with a problem, then nothing kept is shown, so a changed account never shows the old one', () => {
        http.expectOne(PAYMENT_DETAILS_URL).flush(
          { type: 'https://nfnn.cz/problems/donations/x', title: 'x', status: 500 },
          {
            status: 500,
            statusText: 'Error',
            headers: { 'Content-Type': 'application/problem+json' },
          },
        );

        expect(store.state()).toEqual({ kind: 'failed' });
      });
    });

    it('when nothing answers, then the kept details are shown and said to be kept, with the time they were written', () => {
      store.load();
      http.expectOne(PAYMENT_DETAILS_URL).error(new ProgressEvent('error'), { status: 0 });

      expect(store.state()).toEqual({ kind: 'ready', details: foundationPaymentDetails() });
      expect(store.age()).toEqual({ writtenAt: written, kept: true });
    });

    it('when the server answers with details that fail the check or with a problem, then nothing kept is shown, so a changed account never shows the old one', () => {
      store.load();
      http.expectOne(PAYMENT_DETAILS_URL).flush(movedAccountWithForeignIban());
      expect(store.state()).toEqual({ kind: 'failed' });

      store.load();
      http.expectOne(PAYMENT_DETAILS_URL).flush(
        { type: 'https://nfnn.cz/problems/rate-limited', title: 'Too many', status: 429 },
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
      expect(store.state()).toEqual({ kind: 'failed' });
    });

    it('when the server is down behind the edge, then the kept details are shown', () => {
      store.load();
      http.expectOne(PAYMENT_DETAILS_URL).flush('origin down', {
        status: 522,
        statusText: '',
        headers: { 'Content-Type': 'text/html' },
      });

      expect(store.state()).toEqual({ kind: 'ready', details: foundationPaymentDetails() });
      expect(store.age()).toEqual({ writtenAt: written, kept: true });
    });

    it('when the kept text is not payment details or names an IBAN of another account, then nothing is shown from it', () => {
      for (const kept of [
        { details: { ...foundationPaymentDetails(), currency: 1 }, writtenAt: written },
        { details: movedAccountWithForeignIban(), writtenAt: written },
        'not json',
      ]) {
        localStorage.setItem(
          KEPT_PAYMENT_DETAILS,
          typeof kept === 'string' ? kept : JSON.stringify(kept),
        );
        store.load();
        http.expectOne(PAYMENT_DETAILS_URL).error(new ProgressEvent('error'), { status: 0 });

        expect(store.state()).toEqual({ kind: 'failed' });
      }
    });

    it('when the browser refuses its storage, then the state is failed as before', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      store.load();
      http.expectOne(PAYMENT_DETAILS_URL).error(new ProgressEvent('error'), { status: 0 });

      expect(store.state()).toEqual({ kind: 'failed' });
    });

    for (const paymentCase of sharedCases('payment/spayd.json').filter(
      (candidate) =>
        candidate.input.details === FOUNDATION_DETAILS_CASE && 'spayd' in candidate.expected,
    )) {
      it(`when the payment of the shared case ${paymentCase.name} is composed from the kept details, then it gives the case's SPAYD text`, () => {
        store.load();
        http.expectOne(PAYMENT_DETAILS_URL).error(new ProgressEvent('error'), { status: 0 });
        const state = store.state();
        if (state.kind !== 'ready') {
          throw new Error('The kept details were not shown');
        }

        expect(
          spayd(state.details, {
            amountMinor: paymentCase.input.amountMinor,
            variableSymbol: paymentCase.input.variableSymbol,
            purpose: paymentCase.input.purpose,
          }),
        ).toEqual(paymentCase.expected);
      });
    }
  });

  function movedAccountWithForeignIban(): PaymentDetails {
    return {
      ...movedAccount(),
      account: { ...movedAccount().account, iban: 'CZ2620100000005544332217' },
    };
  }
});
