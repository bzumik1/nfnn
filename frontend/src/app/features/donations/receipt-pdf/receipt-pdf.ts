import { inject, Injectable, InjectionToken } from '@angular/core';
import {
  concatMap,
  defer,
  from,
  Observable,
  of,
  Subscriber,
  switchMap,
  tap,
  timeout,
  toArray,
} from 'rxjs';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import { ErrorKind, ErrorName, errorNameOf } from '../../../core/errors/error-vocabulary';
import { DownloadedFile } from '../donations-api';
import { ReceiptArt, receiptArt } from './receipt-art';
import { receiptCaptions } from './receipt-captions';
import {
  estimatedReceiptPages,
  ReceiptDocument,
  receiptDocument,
  ReceiptUnprintable,
} from './receipt-document';
import { resolveReceiptStyle, ReceiptStyle, ReceiptStyleRefused } from './receipt-style';
import {
  ReceiptWorker,
  ReceiptWorkerMessage,
  ReceiptWorkerRequest,
} from './receipt-worker-messages';
import { ReceiptImageBytes, ReceiptSource } from './receipts-api';
import { IssuedReceipt } from './frozen-receipt';

export type ReceiptPdfPhase = 'data' | 'tools' | 'drawing';

export type ReceiptPdfEvent =
  | {
      readonly kind: 'phase';
      readonly phase: ReceiptPdfPhase;
      readonly page: number;
      readonly pages: number;
    }
  | { readonly kind: 'done'; readonly file: DownloadedFile };

export type ReceiptPdfFailureReason =
  'tools-missing' | 'fonts' | 'image' | 'drawing' | 'unprintable' | 'style';

export class ReceiptPdfFailure extends Error {
  constructor(
    readonly reason: ReceiptPdfFailureReason,
    readonly errorName: ErrorName = 'Other',
  ) {
    super(`The receipt PDF could not be drawn: ${reason}.`);
  }
}

const REPORTED_AS: Readonly<Record<ReceiptPdfFailureReason, ErrorKind | null>> = {
  'tools-missing': 'pdf-load',
  fonts: 'pdf-load',
  image: 'pdf-render',
  drawing: 'pdf-render',
  style: 'pdf-render',
  unprintable: null,
};

export interface ReceiptPdfEnvironment {
  worker(): ReceiptWorker;
  style(): ReceiptStyle;
}

export const RECEIPT_PDF_ENVIRONMENT = new InjectionToken<ReceiptPdfEnvironment>(
  'receipt PDF environment',
  {
    providedIn: 'root',
    factory: () => ({
      worker: () =>
        new Worker(new URL('./receipt-pdf.worker', import.meta.url), {
          type: 'module',
        }) as ReceiptWorker,
      style: () => resolveReceiptStyle(document.documentElement),
    }),
  },
);

export const RECEIPT_DRAWING_TIMEOUT_MS = 120_000;

export interface ReceiptBundleSource {
  readonly receipts: readonly IssuedReceipt[];
  readonly duplex: boolean;
  readonly title: string;
  readonly fileName: string;
  image(sha256: string): Observable<ReceiptImageBytes>;
}

export type ReceiptBundleEvent =
  | { readonly kind: 'images'; readonly done: number; readonly total: number }
  | { readonly kind: 'tools' }
  | { readonly kind: 'drawing'; readonly receipt: number; readonly receipts: number }
  | { readonly kind: 'done'; readonly file: DownloadedFile };

function pdfFile(bytes: Uint8Array, fileName: string): DownloadedFile {
  return {
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
    fileName,
  };
}

function latestIssuedAt(receipts: readonly IssuedReceipt[]): string {
  return receipts
    .map((issued) => issued.issuedAt)
    .reduce((latest, issuedAt) => (Date.parse(issuedAt) > Date.parse(latest) ? issuedAt : latest));
}

function bundleSubject(receipts: number): string {
  return $localize`:@@admin.yearlyReceipts.pdf.subject:${receipts}:count: potvrzení`;
}

@Injectable({ providedIn: 'root' })
export class ReceiptPdf {
  private readonly environment = inject(RECEIPT_PDF_ENVIRONMENT);
  private readonly reporter = inject(ErrorReporter);

  draw(source: ReceiptSource): Observable<ReceiptPdfEvent> {
    return new Observable<ReceiptPdfEvent>((subscriber) => {
      let worker: ReceiptWorker | null = null;
      subscriber.next({ kind: 'phase', phase: 'data', page: 0, pages: 0 });
      const subscription = source
        .receipt()
        .pipe(
          switchMap((issued) =>
            this.art(source, issued.receipt.signatory.signatureImage?.sha256 ?? null).pipe(
              switchMap((signature) =>
                this.art(source, issued.receipt.signatory.portraitImage?.sha256 ?? null).pipe(
                  switchMap((portrait) => of({ issued, signature, portrait })),
                ),
              ),
            ),
          ),
        )
        .subscribe({
          next: ({ issued, signature, portrait }) => {
            let pages: number;
            let document: ReceiptDocument;
            try {
              document = receiptDocument(issued.receipt, issued.issuedAt, receiptCaptions());
              pages = estimatedReceiptPages(issued.receipt.gifts.length, document.bilingual);
            } catch (failure: unknown) {
              subscriber.error(
                failure instanceof ReceiptUnprintable
                  ? new ReceiptPdfFailure('unprintable')
                  : new ReceiptPdfFailure('drawing', errorNameOf(failure)),
              );
              return;
            }
            subscriber.next({ kind: 'phase', phase: 'tools', page: 0, pages });
            worker = this.inWorker(
              subscriber,
              () => ({ document, style: this.environment.style(), signature, portrait }),
              (message) => {
                if (message.kind === 'page') {
                  subscriber.next({ kind: 'phase', phase: 'drawing', page: message.page, pages });
                }
              },
              (bytes) => subscriber.next({ kind: 'done', file: pdfFile(bytes, document.fileName) }),
            );
          },
          error: (failure: unknown) => subscriber.error(failure),
        });
      return () => {
        subscription.unsubscribe();
        worker?.terminate();
      };
    }).pipe(
      timeout({
        each: RECEIPT_DRAWING_TIMEOUT_MS,
        with: () => {
          throw new ReceiptPdfFailure('drawing', 'TimeoutError');
        },
      }),
      tap({ error: (failure: unknown) => this.reportFailure(failure) }),
    );
  }

  drawBundle(source: ReceiptBundleSource): Observable<ReceiptBundleEvent> {
    return new Observable<ReceiptBundleEvent>((subscriber) => {
      let worker: ReceiptWorker | null = null;
      const digests = [
        ...new Set(
          source.receipts.flatMap((issued) =>
            [
              issued.receipt.signatory.signatureImage?.sha256,
              issued.receipt.signatory.portraitImage?.sha256,
            ].filter((sha256): sha256 is string => sha256 !== undefined),
          ),
        ),
      ];
      const art: Record<string, ReceiptArt> = {};
      subscriber.next({ kind: 'images', done: 0, total: digests.length });
      const subscription = from(digests)
        .pipe(
          concatMap((sha256) =>
            this.art(source, sha256).pipe(
              tap((drawn) => {
                if (drawn !== null) {
                  art[sha256] = drawn;
                }
              }),
            ),
          ),
          tap(() =>
            subscriber.next({
              kind: 'images',
              done: Object.keys(art).length,
              total: digests.length,
            }),
          ),
          toArray(),
        )
        .subscribe({
          next: () => {
            let documents: ReceiptDocument[];
            try {
              const captions = receiptCaptions();
              documents = source.receipts.map((issued) =>
                receiptDocument(issued.receipt, issued.issuedAt, captions),
              );
            } catch (failure: unknown) {
              subscriber.error(
                failure instanceof ReceiptUnprintable
                  ? new ReceiptPdfFailure('unprintable')
                  : new ReceiptPdfFailure('drawing', errorNameOf(failure)),
              );
              return;
            }
            const receipts = documents.length;
            subscriber.next({ kind: 'tools' });
            worker = this.inWorker(
              subscriber,
              () => ({
                kind: 'bundle',
                documents,
                art,
                options: {
                  duplex: source.duplex,
                  info: {
                    title: source.title,
                    author: documents[0]?.author ?? '',
                    subject: bundleSubject(receipts),
                    createdAt: latestIssuedAt(source.receipts),
                  },
                },
                style: this.environment.style(),
              }),
              (message) => {
                if (message.kind === 'receipt') {
                  subscriber.next({ kind: 'drawing', receipt: message.index + 1, receipts });
                }
              },
              (bytes) => subscriber.next({ kind: 'done', file: pdfFile(bytes, source.fileName) }),
            );
          },
          error: (failure: unknown) => subscriber.error(failure),
        });
      return () => {
        subscription.unsubscribe();
        worker?.terminate();
      };
    }).pipe(
      timeout({
        each: RECEIPT_DRAWING_TIMEOUT_MS,
        with: () => {
          throw new ReceiptPdfFailure('drawing', 'TimeoutError');
        },
      }),
      tap({ error: (failure: unknown) => this.reportFailure(failure) }),
    );
  }

  private inWorker<T>(
    subscriber: Subscriber<T>,
    request: () => ReceiptWorkerRequest,
    progressed: (message: ReceiptWorkerMessage) => void,
    done: (bytes: Uint8Array) => void,
  ): ReceiptWorker | null {
    let ready = false;
    let worker: ReceiptWorker;
    try {
      worker = this.environment.worker();
    } catch (failure: unknown) {
      subscriber.error(new ReceiptPdfFailure('tools-missing', errorNameOf(failure)));
      return null;
    }
    worker.onerror = (event) => {
      event.preventDefault();
      subscriber.error(
        new ReceiptPdfFailure(
          ready ? 'drawing' : 'tools-missing',
          errorNameOf((event as Partial<ErrorEvent>).error),
        ),
      );
    };
    worker.onmessage = ({ data }) => {
      switch (data.kind) {
        case 'ready':
          ready = true;
          try {
            worker.postMessage(request());
          } catch (failure: unknown) {
            subscriber.error(
              new ReceiptPdfFailure(
                failure instanceof ReceiptStyleRefused ? 'style' : 'drawing',
                errorNameOf(failure),
              ),
            );
          }
          break;
        case 'done':
          done(data.bytes);
          subscriber.complete();
          break;
        case 'failed':
          subscriber.error(new ReceiptPdfFailure(data.reason, data.name));
          break;
        default:
          progressed(data);
      }
    };
    return worker;
  }

  private reportFailure(failure: unknown): void {
    if (!(failure instanceof ReceiptPdfFailure)) {
      return;
    }
    const kind = REPORTED_AS[failure.reason];
    if (kind !== null) {
      this.reporter.report(kind, 'global', { name: failure.errorName });
    }
  }

  private art(
    source: Pick<ReceiptSource, 'image'>,
    sha256: string | null,
  ): Observable<ReceiptArt | null> {
    if (sha256 === null) {
      return of(null);
    }
    return source.image(sha256).pipe(
      switchMap((image) =>
        defer(() =>
          from(
            receiptArt(image, sha256).catch((failure: unknown) => {
              throw new ReceiptPdfFailure('image', errorNameOf(failure));
            }),
          ),
        ),
      ),
    );
  }
}
