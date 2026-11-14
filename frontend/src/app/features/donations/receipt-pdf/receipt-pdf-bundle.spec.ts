import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, Subscription, throwError } from 'rxjs';
import { FrozenReceipt, IssuedReceipt } from './frozen-receipt';
import {
  RECEIPT_PDF_ENVIRONMENT,
  ReceiptBundleEvent,
  ReceiptPdf,
  ReceiptPdfFailure,
} from './receipt-pdf';
import { ReceiptImageBytes } from './receipts-api';
import { FakeReceiptPdfEnvironment } from './testing/fake-receipt-worker';
import { frozenCase, SINGLE_PERSON_CS, YEARLY_BILINGUAL } from './testing/receipt-fixtures';
import { SYNTHETIC_SIGNATURE_JSON } from './testing/synthetic-art';
import { recordClientErrors } from '../../../core/errors/testing/client-error-reports';
import { RunningWork } from '../../../core/updates/running-work';

const SIGNATURE_BYTES = new TextEncoder().encode(SYNTHETIC_SIGNATURE_JSON);

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function issued(receipt: FrozenReceipt, id: string, issuedAt: string): IssuedReceipt {
  return {
    id,
    status: 'ACTIVE',
    kind: receipt.kind,
    number: receipt.number,
    donationId: null,
    year: receipt.year,
    issuedAt,
    supersededAt: null,
    receipt,
  };
}

function signed(receipt: FrozenReceipt, digest: string): FrozenReceipt {
  return { ...receipt, signatory: { ...receipt.signatory, signatureImage: { sha256: digest } } };
}

describe('Given receipts of one year to print together', () => {
  let environment: FakeReceiptPdfEnvironment;
  let events: ReceiptBundleEvent[];
  let failure: unknown;
  let subscription: Subscription;
  let digest: string;
  let asked: string[];
  let receipts: IssuedReceipt[];

  beforeEach(async () => {
    environment = new FakeReceiptPdfEnvironment();
    recordClientErrors();
    TestBed.configureTestingModule({
      providers: [{ provide: RECEIPT_PDF_ENVIRONMENT, useValue: environment }],
    });
    events = [];
    failure = undefined;
    asked = [];
    digest = await sha256(SIGNATURE_BYTES);
    receipts = [
      issued(signed(frozenCase(YEARLY_BILINGUAL), digest), 'r-1', '2027-01-15T09:30:00Z'),
      issued(signed(frozenCase(SINGLE_PERSON_CS), digest), 'r-2', '2027-01-20T10:15:00Z'),
      issued(frozenCase(YEARLY_BILINGUAL), 'r-3', '2027-01-16T08:00:00Z'),
    ];
  });

  afterEach(() => {
    subscription?.unsubscribe();
    vi.unstubAllGlobals();
  });

  function image(sha: string): Observable<ReceiptImageBytes> {
    asked.push(sha);
    return of({ bytes: arrayBuffer(SIGNATURE_BYTES), mediaType: 'application/json' });
  }

  function draw(source: Partial<Parameters<ReceiptPdf['drawBundle']>[0]> = {}): void {
    subscription = TestBed.inject(ReceiptPdf)
      .drawBundle({
        receipts,
        duplex: true,
        title: 'Roční potvrzení o daru za rok 2026',
        fileName: 'potvrzeni-2026-hromadne.pdf',
        image,
        ...source,
      })
      .subscribe({
        next: (event) => events.push(event),
        error: (error: unknown) => (failure = error),
      });
  }

  async function settled(): Promise<void> {
    for (let turn = 0; turn < 10; turn++) {
      await Promise.resolve();
    }
  }

  it('when they are being drawn, then the drawing counts as work a reload would break until it is left', () => {
    const work = TestBed.inject(RunningWork);

    draw();

    expect(work.any()).toBe(true);

    subscription.unsubscribe();

    expect(work.any()).toBe(false);
  });

  describe('when they are drawn', () => {
    beforeEach(async () => {
      draw();
      await vi.waitFor(() => expect(environment.workers).toHaveLength(1));
      environment.last().say({ kind: 'ready' });
    });

    it('then each image is fetched once, and the worker gets every document in order with the art by digest', () => {
      expect(asked).toEqual([digest]);
      const request = environment.last().bundles[0];
      expect(request.documents.map((document) => document.number)).toEqual(
        receipts.map((receipt) => receipt.number),
      );
      expect(Object.keys(request.art)).toEqual([digest]);
      expect(request.options).toEqual({
        duplex: true,
        info: {
          title: 'Roční potvrzení o daru za rok 2026',
          author: receipts[0].receipt.foundation.name,
          subject: '3 potvrzení',
          createdAt: '2027-01-20T10:15:00Z',
        },
      });
      expect(structuredClone(request)).toEqual(request);
    });

    it('then it tells which receipt is being drawn and ends with the PDF under the bundle file name', async () => {
      const worker = environment.last();
      worker.say({ kind: 'receipt', index: 0 });
      worker.say({ kind: 'receipt', index: 2 });
      worker.say({ kind: 'done', bytes: new TextEncoder().encode('%PDF-1.7\n%%EOF') });

      expect(events.filter((event) => event.kind !== 'images')).toEqual([
        { kind: 'tools' },
        { kind: 'drawing', receipt: 1, receipts: 3 },
        { kind: 'drawing', receipt: 3, receipts: 3 },
        expect.objectContaining({ kind: 'done' }),
      ]);
      const done = events.at(-1);
      expect(done?.kind === 'done' && done.file.fileName).toBe('potvrzeni-2026-hromadne.pdf');
      expect(done?.kind === 'done' && (await done.file.blob.text())).toBe('%PDF-1.7\n%%EOF');
      expect(worker.terminated).toBe(true);
    });

    it('then the worker failing while drawing fails the bundle as a drawing failure', () => {
      environment.last().say({ kind: 'failed', reason: 'drawing', name: 'TypeError' });

      expect(failure).toEqual(new ReceiptPdfFailure('drawing', 'TypeError'));
    });
  });

  it('when the images are being fetched, then their progress is told before the tools start', async () => {
    const slow = new Subject<ReceiptImageBytes>();
    draw({ image: () => slow });

    expect(events).toEqual([{ kind: 'images', done: 0, total: 1 }]);
    slow.next({ bytes: arrayBuffer(SIGNATURE_BYTES), mediaType: 'application/json' });
    slow.complete();
    await vi.waitFor(() => expect(environment.workers).toHaveLength(1));
    expect(events).toEqual([
      { kind: 'images', done: 0, total: 1 },
      { kind: 'images', done: 1, total: 1 },
      { kind: 'tools' },
    ]);
  });

  it('when an image cannot be read, then its problem comes through and no worker starts', async () => {
    const refused = new Error('offline');
    draw({ image: () => throwError(() => refused) });
    await settled();

    expect(failure).toBe(refused);
    expect(environment.workers).toEqual([]);
  });

  it('when an image does not match its digest, then the bundle fails as an image failure', async () => {
    draw({
      image: () =>
        of({ bytes: arrayBuffer(new Uint8Array([1, 2])), mediaType: 'application/json' }),
    });
    await vi.waitFor(() => expect(failure).toBeDefined());

    expect(failure).toEqual(new ReceiptPdfFailure('image', 'Error'));
    expect(environment.workers).toEqual([]);
  });

  it('when a receipt holds a character no receipt can print, then the bundle fails as unprintable', async () => {
    receipts = [issued(frozenCase(YEARLY_BILINGUAL), 'r-1', '2027-01-15T09:30:00Z')];
    receipts = [
      {
        ...receipts[0],
        receipt: {
          ...receipts[0].receipt,
          donor: { ...receipts[0].receipt.donor, name: 'Jana \u{1F600}' },
        },
      },
    ];
    draw();
    await vi.waitFor(() => expect(failure).toBeDefined());

    expect(failure).toEqual(new ReceiptPdfFailure('unprintable'));
  });
});
