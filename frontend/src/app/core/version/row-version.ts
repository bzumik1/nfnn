import { HttpHeaders } from '@angular/common/http';

import { problemOf } from '../auth/api-problem';

const CHANGED_MEANWHILE = '/changed-meanwhile';

export function ifMatch(version: string): { headers: HttpHeaders } {
  return { headers: new HttpHeaders({ 'If-Match': `"${version}"` }) };
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
  const current = ((failure as { error: unknown }).error as Record<string, unknown>)['current'];
  if (current === null || typeof current !== 'object') {
    return null;
  }
  const row = current as Record<string, unknown>;
  const savedAt = row['updatedAt'] ?? row['changedAt'];
  return typeof savedAt === 'string' && savedAt !== '' ? savedAt : null;
}
