import { TestBed } from '@angular/core/testing';
import { ExternalNavigation } from '../../../core/navigation/external-navigation';
import { LocalPaymentRoute } from './local-payment-route';

const SPAYD =
  'SPD*1.0*ACC:CZ6520100000005544332217*AM:500.00*CC:CZK*MSG:DAR NADACNI FOND NOVA NADEJE';
const ID = '6f1c1e9a-3c1b-4f53-9d55-0d0a9b1f2c11';
const RESERVATION_MS = 2_000;

interface Posted {
  readonly message: unknown;
  readonly port: MessagePort;
}

describe('Given the payment route the service worker answers on the device', () => {
  let opened: string[];
  let posted: Posted[];

  function controlledBy(controller: object | null): void {
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { controller } });
  }

  function workerThatAnswers(answer: (message: unknown) => unknown): object {
    return {
      postMessage: (message: unknown, transfer: MessagePort[]) => {
        posted.push({ message, port: transfer[0] });
        const reply = answer(message);
        if (reply !== undefined) {
          transfer[0].postMessage(reply);
        }
      },
    };
  }

  beforeEach(() => {
    opened = [];
    posted = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: ExternalNavigation, useValue: { assign: (url: string) => opened.push(url) } },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('when no service worker controls the page, then nothing is reserved', async () => {
    controlledBy(null);

    expect(await TestBed.inject(LocalPaymentRoute).reserve(SPAYD)).toBeNull();
  });

  it('when the browser has no service workers at all, then nothing is reserved', async () => {
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: undefined });

    expect(await TestBed.inject(LocalPaymentRoute).reserve(SPAYD)).toBeNull();
  });

  describe('when the worker reserves the payment', () => {
    it('then the page gets the id for exactly this SPAYD text', async () => {
      controlledBy(workerThatAnswers(() => ({ type: 'nfnn-payment-file', id: ID })));

      expect(await TestBed.inject(LocalPaymentRoute).reserve(SPAYD)).toBe(ID);

      expect(posted.map((entry) => entry.message)).toEqual([
        { type: 'nfnn-payment-file', payment: SPAYD },
      ]);
    });

    it('and the page opens it, then the address names only the id, never the payment', () => {
      TestBed.inject(LocalPaymentRoute).open(ID);

      expect(opened).toEqual([`/platba.spayd?id=${ID}`]);
    });
  });

  for (const [name, reply] of [
    ['without an id', { type: 'nfnn-payment-file', id: null }],
    ['with an id that is no reservation id', { type: 'nfnn-payment-file', id: '../api' }],
    ['with something else', 'pong'],
  ] as const) {
    describe(`when the worker answers ${name}`, () => {
      it('then nothing is reserved', async () => {
        controlledBy(workerThatAnswers(() => reply));

        expect(await TestBed.inject(LocalPaymentRoute).reserve(SPAYD)).toBeNull();
      });
    });
  }

  describe('when the worker does not answer within two seconds, as an older worker or the safety worker', () => {
    it('then nothing is reserved', async () => {
      vi.useFakeTimers();
      controlledBy(workerThatAnswers(() => undefined));
      const reserving = TestBed.inject(LocalPaymentRoute).reserve(SPAYD);

      await vi.advanceTimersByTimeAsync(RESERVATION_MS);

      expect(await reserving).toBeNull();
    });
  });
});
