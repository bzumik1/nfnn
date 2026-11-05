import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken } from '@angular/core';

export type SessionKind = 'APP' | 'REMEMBERED' | 'BROWSER' | 'PUBLIC';

export type BrowserSessionKind = Exclude<SessionKind, 'APP'>;

export const SESSION_HEADER = 'Nfnn-Session';

export interface SessionJar {
  readonly installed: boolean;
  readonly lockName: string;
  readonly channelName: string;
  readonly hintKey: string;
}

export const BROWSER_JAR: SessionJar = {
  installed: false,
  lockName: 'nfnn-refresh',
  channelName: 'nfnn-session',
  hintKey: 'nfnn.donor-session',
};

export const APP_JAR: SessionJar = {
  installed: true,
  lockName: 'nfnn-refresh-app',
  channelName: 'nfnn-session-app',
  hintKey: 'nfnn.donor-session-app',
};

export const SESSION_JAR = new InjectionToken<SessionJar>('SESSION_JAR', {
  providedIn: 'root',
  factory: () => (runsInstalled(inject(DOCUMENT).defaultView) ? APP_JAR : BROWSER_JAR),
});

export function sessionKindFor(jar: SessionJar, chosen: BrowserSessionKind): SessionKind {
  return jar.installed ? 'APP' : chosen;
}

export function runsInstalled(view: Window | null): boolean {
  if (!view) {
    return false;
  }
  const homeScreen = (view.navigator as Navigator & { readonly standalone?: boolean }).standalone;
  return (
    homeScreen === true ||
    (typeof view.matchMedia === 'function' && view.matchMedia('(display-mode: standalone)').matches)
  );
}
