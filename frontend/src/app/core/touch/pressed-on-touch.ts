import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  Injectable,
  provideAppInitializer,
} from '@angular/core';

const PASSIVE: AddEventListenerOptions = { passive: true };

const noticeTouch = (): undefined => undefined;

@Injectable({ providedIn: 'root' })
export class PressedOnTouch {
  private readonly document = inject(DOCUMENT);

  start(): void {
    this.document.addEventListener('touchstart', noticeTouch, PASSIVE);
  }

  stop(): void {
    this.document.removeEventListener('touchstart', noticeTouch, PASSIVE);
  }
}

export const pressedOnTouchAtStart: EnvironmentProviders = provideAppInitializer(() =>
  inject(PressedOnTouch).start(),
);
