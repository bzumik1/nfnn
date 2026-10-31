import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { FrozenReceipt, IssuedReceipt } from './frozen-receipt';
import {
  RECEIPT_PDF_ENVIRONMENT,
  ReceiptPdf,
  ReceiptPdfEvent,
  ReceiptPdfFailure,
} from './receipt-pdf';
import { FakeReceiptPdfEnvironment } from './testing/fake-receipt-worker';
import { frozenCase, SINGLE_PERSON_CS, YEARLY_BILINGUAL } from './testing/receipt-fixtures';
import { SYNTHETIC_SIGNATURE_JSON } from './testing/synthetic-art';

const ISSUED_AT = '2027-01-15T09:30:00Z';

function issued(receipt: FrozenReceipt): IssuedReceipt {
  return {
    id: 'r-1',
    status: 'ACTIVE',
    kind: receipt.kind,
    number: receipt.number,
    donationId: receipt.kind === 'SINGLE' ? 'd-1' : null,
    year: receipt.year,
    issuedAt: ISSUED_AT,
    supersededAt: null,
    receipt,
  };
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('Given the browser receipt PDF', () => {
  let http: HttpTestingController;
  let environment: FakeReceiptPdfEnvironment;
  let events: ReceiptPdfEvent[];
  let failure: unknown;
  let completed: boolean;
  let subscription: Subscription;

  beforeEach(() => {
    environment = new FakeReceiptPdfEnvironment();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RECEIPT_PDF_ENVIRONMENT, useValue: environment },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    events = [];
    failure = undefined;
    completed = false;
  });

  afterEach(() => {
    subscription?.unsubscribe();
    http.verify();
  });

  function draw(subject: { year: number } | { donationId: string }): void {
    subscription = TestBed.inject(ReceiptPdf)
      .draw(subject)
      .subscribe({
        next: (event) => events.push(event),
        error: (error: unknown) => (failure = error),
        complete: () => (completed = true),
      });
  }

  function issue(receipt: FrozenReceipt, body: unknown): void {
    const request = http.expectOne('/api/donations/me/receipts');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush(issued(receipt));
  }

  describe('when a yearly receipt is drawn', () => {
    beforeEach(() => {
      draw({ year: 2026 });
      issue(frozenCase(YEARLY_BILINGUAL), { year: 2026 });
    });

    it('then it first issues the receipt, then starts the drawing tools and hands them the document and the theme', () => {
      expect(events).toEqual([
        { kind: 'phase', phase: 'data', page: 0 },
        { kind: 'phase', phase: 'tools', page: 0 },
      ]);
      const worker = environment.last();
      expect(worker.requests).toEqual([]);

      worker.say({ kind: 'ready' });

      expect(worker.requests).toHaveLength(1);
      expect(worker.requests[0].document.fileName).toBe('donation-summary-2026.pdf');
      expect(worker.requests[0].document.issuedAt).toBe(ISSUED_AT);
      expect(worker.requests[0].style.sizes.body).toBe(9.5);
      expect(worker.requests[0].signature).toBeNull();
      expect(structuredClone(worker.requests[0])).toEqual(worker.requests[0]);
    });

    it('then each page it draws is a step, and the finished bytes become the PDF under the receipt file name', async () => {
      environment.last().drawAll(2);

      expect(events.slice(2)).toEqual([
        { kind: 'phase', phase: 'drawing', page: 1 },
        { kind: 'phase', phase: 'drawing', page: 2 },
        expect.objectContaining({ kind: 'done' }),
      ]);
      const done = events.at(-1);
      expect(done?.kind === 'done' && done.file.fileName).toBe('donation-summary-2026.pdf');
      expect(done?.kind === 'done' && done.file.blob.type).toBe('application/pdf');
      expect(done?.kind === 'done' && (await done.file.blob.text())).toBe('%PDF-1.7\n%%EOF');
      expect(completed).toBe(true);
      expect(environment.last().terminated).toBe(true);
    });

    it('then a worker that cannot load its code before it is ready means the tools are missing', () => {
      environment.last().fail();

      expect(failure).toBeInstanceOf(ReceiptPdfFailure);
      expect((failure as ReceiptPdfFailure).reason).toBe('tools-missing');
      expect(environment.last().terminated).toBe(true);
    });

    it('then a worker that breaks while drawing fails the drawing', () => {
      environment.last().say({ kind: 'ready' });
      environment.last().fail();

      expect((failure as ReceiptPdfFailure).reason).toBe('drawing');
    });

    it('then fonts that do not load are named as the reason', () => {
      environment.last().say({ kind: 'ready' });
      environment.last().say({ kind: 'failed', reason: 'fonts' });

      expect((failure as ReceiptPdfFailure).reason).toBe('fonts');
    });

    it('then giving up stops the worker', () => {
      subscription.unsubscribe();

      expect(environment.last().terminated).toBe(true);
    });
  });

  it('when a single receipt is drawn, then it issues it for that donation and names the file by its number', () => {
    draw({ donationId: 'd-1' });
    issue(frozenCase(SINGLE_PERSON_CS), { donationId: 'd-1' });
    environment.last().drawAll();

    const done = events.at(-1);
    expect(done?.kind === 'done' && done.file.fileName).toBe('potvrzeni-o-daru-2027-000001.pdf');
  });

  it('when the server refuses to issue the receipt, then its problem comes through and no worker starts', () => {
    draw({ year: 2026 });
    http
      .expectOne('/api/donations/me/receipts')
      .flush({ type: 'x', title: 'Ne' }, { status: 409, statusText: 'Conflict' });

    expect(failure).toBeInstanceOf(HttpErrorResponse);
    expect(environment.workers).toEqual([]);
  });

  it('when the frozen receipt holds a character no receipt can print, then the drawing fails as unprintable and no worker starts', () => {
    const frozen = frozenCase(SINGLE_PERSON_CS);
    draw({ donationId: 'd-1' });
    http
      .expectOne('/api/donations/me/receipts')
      .flush(issued({ ...frozen, donor: { ...frozen.donor, name: 'Jana 中 Nováková' } }));

    expect(failure).toBeInstanceOf(ReceiptPdfFailure);
    expect((failure as ReceiptPdfFailure).reason).toBe('unprintable');
    expect(environment.workers).toHaveLength(0);
  });

  describe('when the receipt names a signature image', () => {
    let bytes: Uint8Array;
    let receipt: FrozenReceipt;

    beforeEach(async () => {
      bytes = new TextEncoder().encode(SYNTHETIC_SIGNATURE_JSON);
      const frozen = frozenCase(SINGLE_PERSON_CS);
      receipt = {
        ...frozen,
        signatory: { ...frozen.signatory, signatureImage: { sha256: await sha256(bytes) } },
      };
      draw({ donationId: 'd-1' });
      issue(receipt, { donationId: 'd-1' });
    });

    it('then it fetches the image by its digest and hands the checked vector to the worker', async () => {
      http
        .expectOne(`/api/donations/me/receipt-images/${receipt.signatory.signatureImage?.sha256}`)
        .flush(arrayBuffer(bytes), { headers: { 'Content-Type': 'application/json' } });
      await vi.waitFor(() => expect(environment.workers).toHaveLength(1));
      environment.last().say({ kind: 'ready' });

      expect(environment.last().requests[0].signature?.kind).toBe('vector');
    });

    it('then bytes that do not match the digest stop it before any drawing', async () => {
      http
        .expectOne(`/api/donations/me/receipt-images/${receipt.signatory.signatureImage?.sha256}`)
        .flush(arrayBuffer(new TextEncoder().encode('{"viewBox":[0,0,1,1]}')), {
          headers: { 'Content-Type': 'application/json' },
        });
      await vi.waitFor(() => expect(failure).toBeDefined());

      expect((failure as ReceiptPdfFailure).reason).toBe('image');
      expect(environment.workers).toEqual([]);
    });
  });
});
