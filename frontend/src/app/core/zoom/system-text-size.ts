import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  Injectable,
  provideAppInitializer,
} from '@angular/core';

export const SYSTEM_TEXT_SIZE_CLASS = 'follows-system-text-size';

type HomeScreenNavigator = Navigator & { readonly standalone?: boolean };

@Injectable({ providedIn: 'root' })
export class SystemTextSize {
  private readonly document = inject(DOCUMENT);

  start(): void {
    const navigator = this.document.defaultView?.navigator as HomeScreenNavigator | undefined;
    if (navigator?.standalone === true && navigator.maxTouchPoints > 0) {
      this.document.documentElement.classList.add(SYSTEM_TEXT_SIZE_CLASS);
    }
  }
}

export const systemTextSizeAtStart: EnvironmentProviders = provideAppInitializer(() =>
  inject(SystemTextSize).start(),
);
