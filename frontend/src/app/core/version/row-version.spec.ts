import { HttpErrorResponse } from '@angular/common/http';

import {
  heldRecordOf,
  ifMatch,
  keysThatMayDifferOf,
  isChangedMeanwhile,
  savedAtInRefusal,
  versionInRefusal,
} from './row-version';

function refusal(
  status: number,
  type: string,
  version?: unknown,
  current?: unknown,
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: {
      type: `https://nfnn.cz/problems/${type}`,
      title: 'Mezitím se to změnilo',
      version,
      current,
    },
  });
}

describe('Given a row version', () => {
  it('when it is sent, then it goes quoted in If-Match', () => {
    expect(ifMatch('0123456789abcdef').headers.get('If-Match')).toBe('"0123456789abcdef"');
  });
});

describe('Given a refusal of the server', () => {
  it('when it is a 409 changed-meanwhile of any context, then it is recognised with its version', () => {
    const failure = refusal(409, 'donations/changed-meanwhile', 'fedcba9876543210');

    expect(isChangedMeanwhile(failure)).toBe(true);
    expect(versionInRefusal(refusal(409, 'content/changed-meanwhile', 'fedcba9876543210'))).toBe(
      'fedcba9876543210',
    );
    expect(versionInRefusal(failure)).toBe('fedcba9876543210');
  });

  it('when it is another conflict, a missing version or not a problem, then it is not one', () => {
    expect(isChangedMeanwhile(refusal(409, 'donations/bank-payment-already-paired'))).toBe(false);
    expect(isChangedMeanwhile(refusal(428, 'shared/version-required'))).toBe(false);
    expect(versionInRefusal(refusal(409, 'content/changed-meanwhile', 7))).toBeNull();
    expect(isChangedMeanwhile(new Error('offline'))).toBe(false);
  });
});

describe('Given a changed-meanwhile refusal with the current row', () => {
  it('when the row is an article or a project, then its updatedAt is when it was saved', () => {
    const failure = refusal(409, 'content/changed-meanwhile', 'fedcba9876543210', {
      updatedAt: '2026-11-05T15:20:00Z',
    });

    expect(savedAtInRefusal(failure)).toBe('2026-11-05T15:20:00Z');
  });

  it('when the row is the report settings, then its changedAt is when it was saved', () => {
    const failure = refusal(409, 'donations/changed-meanwhile', 'fedcba9876543210', {
      changedAt: '2026-11-05T15:21:00Z',
    });

    expect(savedAtInRefusal(failure)).toBe('2026-11-05T15:21:00Z');
  });

  it('when the row names no time or it is another problem, then there is none', () => {
    expect(
      savedAtInRefusal(refusal(409, 'donations/changed-meanwhile', 'fedcba9876543210', {})),
    ).toBeNull();
    expect(savedAtInRefusal(refusal(428, 'shared/version-required'))).toBeNull();
  });
});

describe('Given a row version and the record the page held', () => {
  it('when it is sent, then the held record travels with the request but not to the server', () => {
    const held = { title: 'Léto' };
    const options = ifMatch('0123456789abcdef', held);

    expect(options.headers.get('If-Match')).toBe('"0123456789abcdef"');
    expect(heldRecordOf(options.context)).toBe(held);
    expect(heldRecordOf(ifMatch('0123456789abcdef').context)).toBeNull();
  });

  it('when it names keys allowed to differ, then they travel with the request, and without them there are none', () => {
    expect(keysThatMayDifferOf(ifMatch('0123456789abcdef', {}, ['sentReports']).context)).toEqual([
      'sentReports',
    ]);
    expect(keysThatMayDifferOf(ifMatch('0123456789abcdef', {}).context)).toEqual([]);
  });
});
