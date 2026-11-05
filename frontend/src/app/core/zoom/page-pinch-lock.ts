import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  Injectable,
  provideAppInitializer,
} from '@angular/core';

const SAFARI_PINCH_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'] as const;

const ACTIVE: AddEventListenerOptions = { passive: false };

function cancel(event: Event): void {
  event.preventDefault();
}

@Injectable({ providedIn: 'root' })
export class PagePinchLock {
  private readonly document = inject(DOCUMENT);

  start(): void {
    for (const type of SAFARI_PINCH_EVENTS) {
      this.document.addEventListener(type, cancel, ACTIVE);
    }
  }

  stop(): void {
    for (const type of SAFARI_PINCH_EVENTS) {
      this.document.removeEventListener(type, cancel, ACTIVE);
    }
  }
}

export const pagePinchLockAtStart: EnvironmentProviders = provideAppInitializer(() =>
  inject(PagePinchLock).start(),
);
