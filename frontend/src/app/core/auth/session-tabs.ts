import { inject, InjectionToken } from '@angular/core';
import { AuthResponse } from './donor';
import { BROWSER_JAR, SESSION_JAR } from './session-jar';

export const REFRESH_LOCK_NAME = BROWSER_JAR.lockName;
export const SESSION_CHANNEL_NAME = BROWSER_JAR.channelName;
export const SESSION_MESSAGE_VERSION = 1;
export const REFRESH_REQUEST_TIMEOUT_MS = 15_000;
export const REFRESH_LOCK_WAIT_MS = 20_000;
export const SLOW_RESTORE_PAUSE_MS = 10_000;

export type TabLocks = Pick<LockManager, 'request'>;

export type SessionChannel = Pick<BroadcastChannel, 'postMessage' | 'addEventListener' | 'close'>;

export interface SessionRefreshed {
  readonly kind: 'session-refreshed';
  readonly version: typeof SESSION_MESSAGE_VERSION;
  readonly response: AuthResponse;
}

export interface SignedOut {
  readonly kind: 'signed-out';
  readonly version: typeof SESSION_MESSAGE_VERSION;
}

export const TAB_LOCKS = new InjectionToken<TabLocks | null>('TAB_LOCKS', {
  providedIn: 'root',
  factory: () => (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null),
});

export const SESSION_CHANNEL = new InjectionToken<() => SessionChannel | null>('SESSION_CHANNEL', {
  providedIn: 'root',
  factory: () => {
    const name = inject(SESSION_JAR).channelName;
    return () => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name));
  },
});

export function sessionRefreshed(response: AuthResponse): SessionRefreshed {
  return { kind: 'session-refreshed', version: SESSION_MESSAGE_VERSION, response };
}

export function signedOut(): SignedOut {
  return { kind: 'signed-out', version: SESSION_MESSAGE_VERSION };
}

export function isSessionRefreshed(message: unknown): message is SessionRefreshed {
  if (!isMessageOfKind(message, 'session-refreshed')) {
    return false;
  }
  const response = (message as { response?: unknown }).response as
    Partial<AuthResponse> | null | undefined;
  if (typeof response !== 'object' || response === null) {
    return false;
  }
  const user = response.user as Partial<AuthResponse['user']> | null | undefined;
  return (
    typeof response.accessToken === 'string' &&
    response.accessToken.length > 0 &&
    typeof response.accessTokenExpiresAt === 'string' &&
    typeof user === 'object' &&
    user !== null &&
    typeof user.id === 'string' &&
    user.id.length > 0 &&
    Array.isArray(user.roles) &&
    user.roles.every((role) => typeof role === 'string')
  );
}

export function isSignedOut(message: unknown): message is SignedOut {
  return isMessageOfKind(message, 'signed-out');
}

function isMessageOfKind(message: unknown, kind: string): boolean {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const candidate = message as { kind?: unknown; version?: unknown };
  return candidate.kind === kind && candidate.version === SESSION_MESSAGE_VERSION;
}
