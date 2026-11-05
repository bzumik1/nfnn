import { InjectionToken } from '@angular/core';
import { AuthResponse } from './donor';

export const REFRESH_LOCK_NAME = 'nfnn-refresh';
export const SESSION_CHANNEL_NAME = 'nfnn-session';
export const REFRESH_REQUEST_TIMEOUT_MS = 15_000;
export const REFRESH_LOCK_WAIT_MS = 20_000;

export type TabLocks = Pick<LockManager, 'request'>;

export type SessionChannel = Pick<BroadcastChannel, 'postMessage' | 'addEventListener' | 'close'>;

export interface SessionRefreshed {
  readonly kind: 'session-refreshed';
  readonly response: AuthResponse;
}

export const TAB_LOCKS = new InjectionToken<TabLocks | null>('TAB_LOCKS', {
  providedIn: 'root',
  factory: () => (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null),
});

export const SESSION_CHANNEL = new InjectionToken<() => SessionChannel | null>('SESSION_CHANNEL', {
  providedIn: 'root',
  factory: () => () =>
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SESSION_CHANNEL_NAME),
});

export function sessionRefreshed(response: AuthResponse): SessionRefreshed {
  return { kind: 'session-refreshed', response };
}

export function isSessionRefreshed(message: unknown): message is SessionRefreshed {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const candidate = message as { kind?: unknown; response?: unknown };
  if (candidate.kind !== 'session-refreshed') {
    return false;
  }
  const response = candidate.response as Partial<AuthResponse> | null | undefined;
  return (
    typeof response === 'object' &&
    response !== null &&
    typeof response.accessToken === 'string' &&
    response.accessToken.length > 0 &&
    typeof response.user === 'object' &&
    response.user !== null
  );
}
