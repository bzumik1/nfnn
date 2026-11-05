import { EnvironmentProviders, Injectable, provideAppInitializer } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PagePinchLock {
  start(): void {}

  stop(): void {}
}

export const pagePinchLockAtStart: EnvironmentProviders = provideAppInitializer(() => undefined);
