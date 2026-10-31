import {
  catchError,
  concatMap,
  defaultIfEmpty,
  filter,
  map,
  Observable,
  of,
  scan,
  take,
  timer,
} from 'rxjs';
import { RESTART_POLL_MS } from '../../../operations/setup/setup-api';
import { ReceiptSigningKeysResponse } from '../../admin-api';

export const KEY_RENEWAL_MAX_POLLS = 100;

interface RenewalProbe {
  keys: ReceiptSigningKeysResponse | null;
  wentDown: boolean;
}

export function watchKeyRenewal(
  load: () => Observable<ReceiptSigningKeysResponse>,
  withdrawnKeyId: string,
): Observable<ReceiptSigningKeysResponse | null> {
  return timer(RESTART_POLL_MS, RESTART_POLL_MS).pipe(
    take(KEY_RENEWAL_MAX_POLLS),
    concatMap(() => load().pipe(catchError(() => of(null)))),
    scan<ReceiptSigningKeysResponse | null, RenewalProbe>(
      (state, keys) => ({ keys, wentDown: state.wentDown || keys === null }),
      { keys: null, wentDown: false },
    ),
    filter(
      (probe) =>
        probe.keys !== null && (probe.wentDown || probe.keys.currentKeyId !== withdrawnKeyId),
    ),
    take(1),
    map((probe) => probe.keys),
    defaultIfEmpty(null),
  );
}
