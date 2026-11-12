import type { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import {
  currentInRefusal,
  heldRecordOf,
  keysThatMayDifferOf,
  versionInRefusal,
} from './row-version';

const IDENTITY_FIELD = 'id';

export const KEYS_THAT_ALWAYS_MAY_DIFFER: readonly string[] = ['version', 'createdAt', 'updatedAt'];

export const heldRecordRetryInterceptor: HttpInterceptorFn = (request, next) => {
  const held = heldRecordOf(request.context);
  if (held === null) {
    return next(request);
  }
  return next(request).pipe(
    catchError((failure: unknown) => {
      const version = versionInRefusal(failure);
      const current = currentInRefusal(failure);
      const mayDiffer = new Set([
        ...KEYS_THAT_ALWAYS_MAY_DIFFER,
        ...keysThatMayDifferOf(request.context),
      ]);
      if (version === null || current === null || !holdsTheSame(held, current, mayDiffer)) {
        return throwError(() => failure);
      }
      return next(request.clone({ setHeaders: { 'If-Match': `"${version}"` } }));
    }),
  );
};

function holdsTheSame(
  held: object,
  current: Record<string, unknown>,
  mayDiffer: ReadonlySet<string>,
): boolean {
  const heldFields = held as Record<string, unknown>;
  const compared = [...new Set([...presentKeys(heldFields), ...presentKeys(current)])].filter(
    (key) => !mayDiffer.has(key),
  );
  return (
    compared.some((key) => key !== IDENTITY_FIELD) &&
    compared.every((key) => canonical(heldFields[key]) === canonical(current[key]))
  );
}

function presentKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => record[key] !== undefined);
}

function canonical(value: unknown): string {
  return JSON.stringify(sortedKeys(value));
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortedKeys);
  }
  if (value !== null && typeof value === 'object') {
    const fields = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(fields)
        .sort()
        .filter((key) => fields[key] !== undefined)
        .map((key) => [key, sortedKeys(fields[key])]),
    );
  }
  return value;
}
