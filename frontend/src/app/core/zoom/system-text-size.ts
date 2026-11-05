import { EnvironmentProviders, Injectable, provideAppInitializer } from '@angular/core';

export const SYSTEM_TEXT_SIZE_CLASS = 'follows-system-text-size';

@Injectable({ providedIn: 'root' })
export class SystemTextSize {
  start(): void {
    return;
  }
}

export const systemTextSizeAtStart: EnvironmentProviders = provideAppInitializer(() => undefined);
