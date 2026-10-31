import { HttpErrorResponse } from '@angular/common/http';
import {
  catchError,
  concatMap,
  last,
  map,
  Observable,
  of,
  scan,
  take,
  takeWhile,
  timer,
} from 'rxjs';
import { RESTART_POLL_MS } from '../../../operations/setup/setup-api';
import { ReceiptSigningKeysResponse } from '../../admin-api';

export const KEY_RENEWAL_MAX_POLLS = 100;

const WEB_DOWN_STATUSES: ReadonlySet<number> = new Set([0, 502, 503, 504]);

export type KeyRenewal =
  | { outcome: 'answered'; keys: ReceiptSigningKeysResponse }
  | { outcome: 'notRestarted' }
  | { outcome: 'slow' };

type RenewalPoll =
  { kind: 'keys'; keys: ReceiptSigningKeysResponse } | { kind: 'down' } | { kind: 'failed' };

interface RenewalProbe {
  keys: ReceiptSigningKeysResponse | null;
  wentDown: boolean;
  decided: boolean;
}

export function watchKeyRenewal(
  load: () => Observable<ReceiptSigningKeysResponse>,
  withdrawnKeyId: string,
): Observable<KeyRenewal> {
  return timer(RESTART_POLL_MS, RESTART_POLL_MS).pipe(
    take(KEY_RENEWAL_MAX_POLLS),
    concatMap(() =>
      load().pipe(
        map((keys): RenewalPoll => ({ kind: 'keys', keys })),
        catchError((failure: unknown) =>
          of<RenewalPoll>(webDown(failure) ? { kind: 'down' } : { kind: 'failed' }),
        ),
      ),
    ),
    scan<RenewalPoll, RenewalProbe>(
      (state, poll) => {
        const keys = poll.kind === 'keys' ? poll.keys : null;
        const wentDown = state.wentDown || poll.kind === 'down';
        return {
          keys,
          wentDown,
          decided: keys !== null && (wentDown || keys.currentKeyId !== withdrawnKeyId),
        };
      },
      { keys: null, wentDown: false, decided: false },
    ),
    takeWhile((probe) => !probe.decided, true),
    last(),
    map((probe): KeyRenewal => {
      if (probe.decided && probe.keys !== null) {
        return { outcome: 'answered', keys: probe.keys };
      }
      return probe.wentDown ? { outcome: 'slow' } : { outcome: 'notRestarted' };
    }),
  );
}

function webDown(failure: unknown): boolean {
  return failure instanceof HttpErrorResponse && WEB_DOWN_STATUSES.has(failure.status);
}
