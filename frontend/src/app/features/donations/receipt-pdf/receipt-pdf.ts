import { inject, Injectable, InjectionToken } from '@angular/core';
import { defer, from, Observable, of, switchMap, timeout } from 'rxjs';
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
  constructor(readonly reason: ReceiptPdfFailureReason) {
    super(`The receipt PDF could not be drawn: ${reason}.`);
  }
}

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
            const pages = estimatedReceiptPages(issued.receipt.gifts.length);
            subscriber.next({ kind: 'phase', phase: 'tools', page: 0, pages });
            let document: ReceiptDocument;
            try {
              document = receiptDocument(issued.receipt, issued.issuedAt, receiptCaptions());
            } catch (failure: unknown) {
              subscriber.error(
                new ReceiptPdfFailure(
                  failure instanceof ReceiptUnprintable ? 'unprintable' : 'drawing',
                ),
              );
              return;
            }
            let ready = false;
            try {
              worker = this.environment.worker();
            } catch {
              subscriber.error(new ReceiptPdfFailure('tools-missing'));
              return;
            }
            worker.onerror = () =>
              subscriber.error(new ReceiptPdfFailure(ready ? 'drawing' : 'tools-missing'));
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
                  subscriber.error(new ReceiptPdfFailure(data.reason));
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
          throw new ReceiptPdfFailure('drawing');
        },
      }),
    );
  }

  private art(sha256: string | null): Observable<ReceiptArt | null> {
    if (sha256 === null) {
      return of(null);
    }
    return this.api.image(sha256).pipe(
      switchMap((image) =>
        defer(() =>
          from(
            receiptArt(image, sha256).catch(() => {
              throw new ReceiptPdfFailure('image');
            }),
          ),
        ),
      ),
    );
  }
}
