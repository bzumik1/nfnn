import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  Injectable,
  provideAppInitializer,
} from '@angular/core';

const PASSIVE_CAPTURE: AddEventListenerOptions = { passive: true, capture: true };

@Injectable({ providedIn: 'root' })
export class InputModality {
  private readonly document = inject(DOCUMENT);
  private pressedByPointer = false;
  private readonly pointerPressed = () => (this.pressedByPointer = true);
  private readonly keyPressed = () => (this.pressedByPointer = false);

  start(): void {
    this.document.addEventListener('pointerdown', this.pointerPressed, PASSIVE_CAPTURE);
    this.document.addEventListener('keydown', this.keyPressed, PASSIVE_CAPTURE);
  }

  stop(): void {
    this.document.removeEventListener('pointerdown', this.pointerPressed, PASSIVE_CAPTURE);
    this.document.removeEventListener('keydown', this.keyPressed, PASSIVE_CAPTURE);
  }

  lastPressByPointer(): boolean {
    return this.pressedByPointer;
  }
}

export const inputModalityAtStart: EnvironmentProviders = provideAppInitializer(() =>
  inject(InputModality).start(),
);
