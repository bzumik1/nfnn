import { inject, Injectable, InjectionToken } from '@angular/core';
import { defer, from, Observable, of, switchMap, tap, timeout } from 'rxjs';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import { ErrorKind, ErrorName, errorNameOf } from '../../../core/errors/error-vocabulary';
import { DownloadedFile } from '../donations-api';
import { ReceiptSubject } from './frozen-receipt';
import { ReceiptArt, receiptArt } from './receipt-art';
import { receiptCaptions } from './receipt-captions';
import {
  estimatedReceiptPages,
  ReceiptDocument,
  receiptDocument,
  ReceiptUnprintable,
} from './receipt-document';
import { resolveReceiptStyle, ReceiptStyle, ReceiptStyleRefused } from './receipt-style';
import { ReceiptWorker } from './receipt-worker-messages';
import { ReceiptsApi } from './receipts-api';

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

@Injectable({ providedIn: 'root' })
export class ReceiptPdf {
  private readonly api = inject(ReceiptsApi);
  private readonly environment = inject(RECEIPT_PDF_ENVIRONMENT);
  private readonly reporter = inject(ErrorReporter);

  draw(subject: ReceiptSubject): Observable<ReceiptPdfEvent> {
    return new Observable<ReceiptPdfEvent>((subscriber) => {
      let worker: ReceiptWorker | null = null;
      subscriber.next({ kind: 'phase', phase: 'data', page: 0, pages: 0 });
      const subscription = this.api
        .issue(subject)
        .pipe(
          switchMap((issued) =>
            this.art(issued.receipt.signatory.signatureImage?.sha256 ?? null).pipe(
              switchMap((signature) =>
                this.art(issued.receipt.signatory.portraitImage?.sha256 ?? null).pipe(
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
            let ready = false;
            try {
              worker = this.environment.worker();
            } catch (failure: unknown) {
              subscriber.error(new ReceiptPdfFailure('tools-missing', errorNameOf(failure)));
              return;
            }
            worker.onerror = (event) =>
              subscriber.error(
                new ReceiptPdfFailure(
                  ready ? 'drawing' : 'tools-missing',
                  errorNameOf((event as Partial<ErrorEvent>).error),
                ),
              );
            worker.onmessage = ({ data }) => {
              switch (data.kind) {
                case 'ready':
                  ready = true;
                  try {
                    worker?.postMessage({
                      document,
                      style: this.environment.style(),
                      signature,
                      portrait,
                    });
                  } catch (failure: unknown) {
                    subscriber.error(
                      new ReceiptPdfFailure(
                        failure instanceof ReceiptStyleRefused ? 'style' : 'drawing',
                        errorNameOf(failure),
                      ),
                    );
                  }
                  break;
                case 'page':
                  subscriber.next({ kind: 'phase', phase: 'drawing', page: data.page, pages });
                  break;
                case 'done':
                  subscriber.next({
                    kind: 'done',
                    file: {
                      blob: new Blob([data.bytes as Uint8Array<ArrayBuffer>], {
                        type: 'application/pdf',
                      }),
                      fileName: document.fileName,
                    },
                  });
                  subscriber.complete();
                  break;
                case 'failed':
                  subscriber.error(new ReceiptPdfFailure(data.reason, data.name));
                  break;
              }
            };
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

  private reportFailure(failure: unknown): void {
    if (!(failure instanceof ReceiptPdfFailure)) {
      return;
    }
    const kind = REPORTED_AS[failure.reason];
    if (kind !== null) {
      this.reporter.report(kind, 'global', { name: failure.errorName });
    }
  }

  private art(sha256: string | null): Observable<ReceiptArt | null> {
    if (sha256 === null) {
      return of(null);
    }
    return this.api.image(sha256).pipe(
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
