import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { RECEIPT_KEY_STORAGE } from './receipt-key-store';
import { ReceiptVerifier, type VerificationOutcome } from './receipt-verifier';
import {
  KEY_LIST,
  keyListWith,
  OTHER_KEY,
  proofCase,
  REVOKED_KEY_LIST,
  TAMPERED_KEY_LIST,
} from './testing/verification-fixtures';

const KEYS = '/api/donations/receipt-keys';
const STATUS = '/api/donations/receipts/status';
const STORAGE_KEY = 'nfnn.receipt-keys';
const SINGLE = proofCase('a single receipt of one gift');
const CHANGED_AMOUNT = proofCase('an amount changed');
const OTHER_FORMAT = proofCase('another format version');
const RESERVED_FLAG = proofCase('a reserved flag set, signed');
const TIMEOUT_MS = 5_000;
const REFUSALS: readonly { readonly status: number; readonly statusText: string }[] = [
  { status: 429, statusText: 'Too Many Requests' },
  { status: 503, statusText: 'Service Unavailable' },
];

describe('Given the receipt verifier', () => {
  let verifier: ReceiptVerifier;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: RECEIPT_KEY_STORAGE, useValue: () => localStorage },
      ],
    });
    verifier = TestBed.inject(ReceiptVerifier);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  async function request(url: string): Promise<TestRequest> {
    let found: TestRequest | undefined;
    await vi.waitFor(() => {
      found = http.expectOne(url);
    });
    return found as TestRequest;
  }

  async function cutOff(url: string): Promise<void> {
    (await request(url)).error(new ProgressEvent('error'), { status: 0, statusText: '' });
  }

  async function refuse(
    url: string,
    refusal: { status: number; statusText: string },
  ): Promise<void> {
    (await request(url)).flush(
      { type: 'https://nfnn.cz/problems/x', status: refusal.status },
      refusal,
    );
  }

  async function settledWithin<T>(outcome: Promise<T>, milliseconds: number): Promise<boolean> {
    let settled = false;
    void outcome.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(milliseconds);
    return settled;
  }

  function keep(list: unknown): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function signedWith(status: string): Partial<VerificationOutcome> {
    return { state: 'signed', receipt: SINGLE.receipt, status } as Partial<VerificationOutcome>;
  }

  it('when the address carries no code, then it explains the page and asks nothing', async () => {
    expect(await verifier.verify(null)).toEqual({ state: 'empty' });
    expect(await verifier.verify('')).toEqual({ state: 'empty' });
  });

  it('when the code is cut off, then the link is broken and nothing is asked', async () => {
    expect(await verifier.verify(SINGLE.fragment.slice(0, 40))).toEqual({ state: 'broken' });
    expect(await verifier.verify('1003188a')).toEqual({ state: 'broken' });
  });

  it('when the code has a newer text version or format, then the page says it is older than the code', async () => {
    expect(await verifier.verify(`2${SINGLE.fragment.slice(1)}`)).toEqual({ state: 'newer' });
    expect(await verifier.verify(OTHER_FORMAT.fragment)).toEqual({ state: 'newer' });
  });

  describe('when no key list is kept yet and the server answers', () => {
    it('then the keys are fetched once, kept, and the status of the digest is asked for', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush(KEY_LIST);
      const status = await request(STATUS);
      expect(status.request.body).toEqual({ digest: SINGLE.statusSha256 });
      status.flush({ status: 'active' });

      expect(await outcome).toEqual(signedWith('active'));
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual(KEY_LIST);
    });

    for (const status of ['replaced', 'withdrawn', 'unknown']) {
      it(`and the fund answers ${status}, then the outcome carries that status`, async () => {
        const outcome = verifier.verify(SINGLE.fragment);

        (await request(KEYS)).flush(KEY_LIST);
        (await request(STATUS)).flush({ status });

        expect(await outcome).toEqual(signedWith(status));
      });
    }

    for (const refusal of [{ status: 404, statusText: 'Not Found' }, ...REFUSALS]) {
      it(`and the status call answers ${refusal.status}, then the signature stands but the fund, asked, gave no answer`, async () => {
        const outcome = verifier.verify(SINGLE.fragment);

        (await request(KEYS)).flush(KEY_LIST);
        await refuse(STATUS, refusal);

        expect(await outcome).toEqual(signedWith('unanswered'));
      });
    }

    it('and the status answer is not one the page knows, then the fund, asked, gave no answer', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush(KEY_LIST);
      (await request(STATUS)).flush({ status: 'valid' });

      expect(await outcome).toEqual(signedWith('unanswered'));
    });

    it('and the status call is cut off after the key list came, then the fund, asked, gave no answer and the result is never the offline one', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush(KEY_LIST);
      await cutOff(STATUS);

      expect(await outcome).toEqual(signedWith('unanswered'));
    });

    it('and the signature holds, then the progress says so before the status is asked for', async () => {
      const steps: string[] = [];
      const outcome = verifier.verify(SINGLE.fragment, (step) => steps.push(step));

      (await request(KEYS)).flush(KEY_LIST);
      const status = await request(STATUS);

      expect(steps).toEqual(['asking-status']);
      status.flush({ status: 'active' });
      expect(await outcome).toEqual(signedWith('active'));
      expect(steps).toEqual(['asking-status']);
    });

    it('and the code has a reserved flag set, then the page says the code is newer than it', async () => {
      const outcome = verifier.verify(RESERVED_FLAG.fragment);

      (await request(KEYS)).flush(KEY_LIST);

      expect(await outcome).toEqual({ state: 'newer' });
    });

    it('and the code was changed, then it is invalid and no status is asked for', async () => {
      const outcome = verifier.verify(CHANGED_AMOUNT.fragment);

      (await request(KEYS)).flush(KEY_LIST);

      expect(await outcome).toEqual({ state: 'invalid' });
    });

    it('and the list marks the key revoked, then the outcome is revoked and no status is asked for', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush(REVOKED_KEY_LIST);

      expect(await outcome).toEqual({ state: 'revoked' });
    });

    it('and the list does not hold the key, then the key is unknown while online', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush(keyListWith([]));

      expect(await outcome).toEqual({ state: 'unknown-key', reach: 'online' });
    });

    it('and the listed key id does not belong to its public key, then that key is not trusted', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush(TAMPERED_KEY_LIST);

      expect(await outcome).toEqual({ state: 'unknown-key', reach: 'online' });
    });
  });

  describe('when no key list is kept and the connection is cut', () => {
    it('then the page cannot verify without a connection', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      await cutOff(KEYS);

      expect(await outcome).toEqual({ state: 'no-connection' });
    });
  });

  describe('when no key list is kept and the fund gives no usable list while the browser is online', () => {
    for (const refusal of REFUSALS) {
      it(`and the list answers ${refusal.status}, then the fund gave no answer and nothing is kept`, async () => {
        const outcome = verifier.verify(SINGLE.fragment);

        await refuse(KEYS, refusal);

        expect(await outcome).toEqual({ state: 'no-answer' });
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      });
    }

    it('and the list is malformed, then the page says it cannot use the list and never keeps it', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush({ foundation: { companyIdentifier: '27278794' }, keys: 'none' });

      expect(await outcome).toEqual({ state: 'keys-refused' });
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    describe('and the list does not come at all', () => {
      beforeEach(() =>
        vi.useFakeTimers({
          toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'],
        }),
      );
      afterEach(() => vi.useRealTimers());

      it('then after five seconds the fund gave no answer, and not before', async () => {
        const outcome = verifier.verify(SINGLE.fragment);
        const keys = await request(KEYS);

        expect(await settledWithin(outcome, TIMEOUT_MS - 100)).toBe(false);
        expect(await settledWithin(outcome, 100)).toBe(true);
        expect(await outcome).toEqual({ state: 'no-answer' });
        expect(keys.cancelled).toBe(true);
      });
    });
  });

  describe('when the key list is kept', () => {
    beforeEach(() => keep(KEY_LIST));

    it('and the connection is cut, then the signature is verified from the kept keys without a status', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      await cutOff(KEYS);

      expect(await outcome).toEqual(signedWith('offline'));
    });

    it('and the browser is offline, then nothing is asked at all', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

      expect(await verifier.verify(SINGLE.fragment)).toEqual(signedWith('offline'));
    });

    for (const refusal of REFUSALS) {
      it(`and the list answers ${refusal.status} while the browser is online, then the kept keys verify the code but the fund gave no answer`, async () => {
        const outcome = verifier.verify(SINGLE.fragment);

        await refuse(KEYS, refusal);

        expect(await outcome).toEqual(signedWith('no-answer'));
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual(KEY_LIST);
      });
    }

    it('and the list answers 200 with a body that is not JSON, then the kept keys verify the code but the fund gave no answer, never the offline green', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).error(new ProgressEvent('error'), { status: 200, statusText: 'OK' });

      expect(await outcome).toEqual(signedWith('no-answer'));
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual(KEY_LIST);
    });

    it('and a malformed list comes, then the page says it cannot use the list, keeps the old one and asks no status', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush({ foundation: { companyIdentifier: '2727879' }, keys: [] });

      expect(await outcome).toEqual({ state: 'keys-refused' });
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual(KEY_LIST);
    });

    it('and a list with one malformed entry and the other key comes, then it replaces the kept one with the good entry', async () => {
      const outcome = verifier.verify(SINGLE.fragment);
      const list = keyListWith([{ keyId: 'zz' }, OTHER_KEY]);

      (await request(KEYS)).flush(list);

      expect(await outcome).toEqual({ state: 'unknown-key', reach: 'online' });
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual(list);
    });

    describe('and the status does not come at all', () => {
      beforeEach(() =>
        vi.useFakeTimers({
          toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'],
        }),
      );
      afterEach(() => vi.useRealTimers());

      it('then after five seconds the fund gave no answer, and not before', async () => {
        const outcome = verifier.verify(SINGLE.fragment);
        (await request(KEYS)).flush(KEY_LIST);
        const status = await request(STATUS);

        expect(await settledWithin(outcome, TIMEOUT_MS - 100)).toBe(false);
        expect(await settledWithin(outcome, 100)).toBe(true);
        expect(await outcome).toEqual(signedWith('unanswered'));
        expect(status.cancelled).toBe(true);
      });
    });

    it('and the server now marks the key revoked, then the fresh list wins and replaces the kept one', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush(REVOKED_KEY_LIST);

      expect(await outcome).toEqual({ state: 'revoked' });
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual(REVOKED_KEY_LIST);
    });
  });

  describe('when the kept list does not hold the key', () => {
    beforeEach(() => keep(keyListWith([])));

    it('and the connection is cut, then the key is unknown while offline', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      await cutOff(KEYS);

      expect(await outcome).toEqual({ state: 'unknown-key', reach: 'offline' });
    });

    it('and the list answers 503 while the browser is online, then the key is unknown and the fund gave no answer', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      await refuse(KEYS, REFUSALS[1]);

      expect(await outcome).toEqual({ state: 'unknown-key', reach: 'no-answer' });
    });

    it('and the server lists it, then one fetch of the list verifies the code', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush(KEY_LIST);
      (await request(STATUS)).flush({ status: 'active' });

      expect(await outcome).toEqual(signedWith('active'));
    });
  });

  it('when the signature check itself fails, then the outcome says the verification failed', async () => {
    keep(KEY_LIST);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('broken crypto'));

    expect(await verifier.verify(SINGLE.fragment)).toEqual({ state: 'failed' });
  });
});
