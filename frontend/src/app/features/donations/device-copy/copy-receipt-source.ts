import { HttpErrorResponse } from '@angular/common/http';
import { catchError, of, throwError } from 'rxjs';
import { problemOf } from '../../../core/auth/api-problem';
import { base64UrlToBytes } from '../../../core/device/crypto/device-bytes';
import type { ReceiptSubject } from '../receipt-pdf/frozen-receipt';
import type { ReceiptSource } from '../receipt-pdf/receipts-api';
import { activeReceiptOf, type DonorCopyView } from './donor-copy-view';

export function copyBackedReceiptSource(
  online: ReceiptSource,
  view: () => DonorCopyView | null,
  subject: ReceiptSubject,
): ReceiptSource {
  return {
    receipt: () =>
      online.receipt().pipe(
        catchError((failure: unknown) => {
          const copy = unreachable(failure) ? view() : null;
          const kept = copy === null ? null : activeReceiptOf(copy, subject);
          return kept === null ? throwError(() => failure) : of(kept);
        }),
      ),
    image: (sha256) => {
      const kept = view()?.images.find((image) => image.sha256 === sha256);
      return kept === undefined
        ? online.image(sha256)
        : of({ bytes: base64UrlToBytes(kept.base64).buffer, mediaType: kept.mediaType });
    },
  };
}

const GATEWAY_FAILURES: ReadonlySet<number> = new Set([502, 503, 504, 520, 521, 522, 523, 524]);

function unreachable(failure: unknown): boolean {
  if (!(failure instanceof HttpErrorResponse)) {
    return false;
  }
  return (
    failure.status === 0 || (GATEWAY_FAILURES.has(failure.status) && problemOf(failure) === null)
  );
}
