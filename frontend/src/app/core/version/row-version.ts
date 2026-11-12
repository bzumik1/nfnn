import { HttpContext, HttpContextToken, HttpHeaders } from '@angular/common/http';

import { problemOf } from '../auth/api-problem';

const CHANGED_MEANWHILE = '/changed-meanwhile';

export type HeldRecord = object;

const HELD_RECORD = new HttpContextToken<HeldRecord | null>(() => null);
const KEYS_THAT_MAY_DIFFER = new HttpContextToken<readonly string[]>(() => []);

export function ifMatch(
  version: string,
  held?: HeldRecord | null,
  mayDiffer: readonly string[] = [],
): { headers: HttpHeaders; context: HttpContext } {
  return {
    headers: new HttpHeaders({ 'If-Match': `"${version}"` }),
    context: new HttpContext()
      .set(HELD_RECORD, held ?? null)
      .set(KEYS_THAT_MAY_DIFFER, [...mayDiffer]),
  };
}

export function heldRecordOf(context: HttpContext): HeldRecord | null {
  return context.get(HELD_RECORD);
}

export function keysThatMayDifferOf(context: HttpContext): readonly string[] {
  return context.get(KEYS_THAT_MAY_DIFFER);
}

export function currentInRefusal(failure: unknown): Record<string, unknown> | null {
  if (!isChangedMeanwhile(failure)) {
    return null;
  }
  const current = ((failure as { error: unknown }).error as Record<string, unknown>)['current'];
  return current !== null && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : null;
}

export function isChangedMeanwhile(failure: unknown): boolean {
  const problem = problemOf(failure);
  return problem !== null && problem.status === 409 && problem.type.endsWith(CHANGED_MEANWHILE);
}

export function versionInRefusal(failure: unknown): string | null {
  if (!isChangedMeanwhile(failure)) {
    return null;
  }
  const body = (failure as { error: unknown }).error;
  const version = (body as Record<string, unknown>)['version'];
  return typeof version === 'string' && version !== '' ? version : null;
}

export function savedAtInRefusal(failure: unknown): string | null {
  if (!isChangedMeanwhile(failure)) {
    return null;
  }
  const row = currentInRefusal(failure);
  if (row === null) {
    return null;
  }
  const savedAt = row['updatedAt'] ?? row['changedAt'];
  return typeof savedAt === 'string' && savedAt !== '' ? savedAt : null;
}
