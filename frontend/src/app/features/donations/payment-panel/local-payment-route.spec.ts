import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ExternalNavigation } from '../../../core/navigation/external-navigation';
import { LocalPaymentRoute } from './local-payment-route';

const SPAYD =
  'SPD*1.0*ACC:CZ6520100000005544332217*AM:500.00*CC:CZK*MSG:DAR NADACNI FOND NOVA NADEJE';
const PROBE_MS = 2_000;

describe('Given the payment route the service worker answers on the device', () => {
  let http: HttpTestingController;
  let opened: string[];

  function controlledBy(controller: object | null): void {
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { controller } });
  }

  beforeEach(() => {
    opened = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ExternalNavigation, useValue: { assign: (url: string) => opened.push(url) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function probe() {
    return http.expectOne((request) => request.url === '/platba.spayd');
  }

  it('when no service worker controls the page, then the payment is not opened and nothing is asked', async () => {
    controlledBy(null);

    expect(await TestBed.inject(LocalPaymentRoute).open(SPAYD)).toBe(false);

    expect(opened).toEqual([]);
  });

  it('when the browser has no service workers at all, then the payment is not opened and nothing is asked', async () => {
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: undefined });

    expect(await TestBed.inject(LocalPaymentRoute).open(SPAYD)).toBe(false);

    expect(opened).toEqual([]);
  });

  describe('when the worker answers the route with the payment media type', () => {
    it('then the page opens the payment file of exactly this SPAYD text', async () => {
      controlledBy({});
      const opening = TestBed.inject(LocalPaymentRoute).open(SPAYD);

      const request = probe();
      expect(request.request.method).toBe('HEAD');
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush('', {
        headers: { 'Content-Type': 'application/x-shortpaymentdescriptor; charset=utf-8' },
      });

      expect(await opening).toBe(true);
      expect(opened).toHaveLength(1);
      const address = new URL(opened[0], 'https://nfnn.cz');
      expect(address.pathname).toBe('/platba.spayd');
      expect(address.searchParams.getAll('data')).toEqual([SPAYD]);
    });
  });

  for (const [name, answer] of [
    [
      'the site page, as a worker of an older version or the safety worker passes it to the server',
      () => probe().flush('', { headers: { 'Content-Type': 'text/html' } }),
    ],
    ['a 404', () => probe().flush('', { status: 404, statusText: 'Not Found' })],
    ['a network failure', () => probe().error(new ProgressEvent('error'))],
  ] as const) {
    describe(`when the route answers with ${name}`, () => {
      it('then the payment is not opened, so the file downloads instead', async () => {
        controlledBy({});
        const opening = TestBed.inject(LocalPaymentRoute).open(SPAYD);

        answer();

        expect(await opening).toBe(false);
        expect(opened).toEqual([]);
      });
    });
  }

  describe('when the route does not answer within two seconds', () => {
    it('then the payment is not opened, so the file still downloads within the tap', async () => {
      vi.useFakeTimers();
      controlledBy({});
      const opening = TestBed.inject(LocalPaymentRoute).open(SPAYD);
      const request = probe();

      await vi.advanceTimersByTimeAsync(PROBE_MS);

      expect(request.cancelled).toBe(true);
      expect(await opening).toBe(false);
      expect(opened).toEqual([]);
    });
  });
});
