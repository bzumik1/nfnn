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

    it('and the status cannot be learned, then the signature stands with the status unavailable', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush(KEY_LIST);
      (await request(STATUS)).flush(
        { type: 'x', status: 404 },
        { status: 404, statusText: 'Not Found' },
      );

      expect(await outcome).toEqual(signedWith('unavailable'));
    });

    it('and the status answer is not one the page knows, then the status is unavailable', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush(KEY_LIST);
      (await request(STATUS)).flush({ status: 'valid' });

      expect(await outcome).toEqual(signedWith('unavailable'));
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

      expect(await outcome).toEqual({ state: 'unknown-key', online: true });
    });

    it('and the listed key id does not belong to its public key, then that key is not trusted', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      (await request(KEYS)).flush(TAMPERED_KEY_LIST);

      expect(await outcome).toEqual({ state: 'unknown-key', online: true });
    });
  });

  describe('when no key list is kept and the connection is cut', () => {
    it('then the page cannot verify without a connection', async () => {
      const outcome = verifier.verify(SINGLE.fragment);

      await cutOff(KEYS);

      expect(await outcome).toEqual({ state: 'no-connection' });
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

      expect(await outcome).toEqual({ state: 'unknown-key', online: false });
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
