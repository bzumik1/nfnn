import type { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { currentInRefusal, heldRecordOf, versionInRefusal } from './row-version';

const VERSION_FIELD = 'version';

export const heldRecordRetryInterceptor: HttpInterceptorFn = (request, next) => {
  const held = heldRecordOf(request.context);
  if (held === null) {
    return next(request);
  }
  return next(request).pipe(
    catchError((failure: unknown) => {
      const version = versionInRefusal(failure);
      const current = currentInRefusal(failure);
      if (version === null || current === null || !holdsTheSame(held, current)) {
        return throwError(() => failure);
      }
      return next(request.clone({ setHeaders: { 'If-Match': `"${version}"` } }));
    }),
  );
};

function holdsTheSame(held: object, current: Record<string, unknown>): boolean {
  const heldFields = held as Record<string, unknown>;
  const shared = Object.keys(current).filter(
    (key) =>
      key !== VERSION_FIELD &&
      Object.prototype.hasOwnProperty.call(heldFields, key) &&
      heldFields[key] !== undefined,
  );
  return (
    shared.length > 0 &&
    shared.every((key) => canonical(heldFields[key]) === canonical(current[key]))
  );
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
