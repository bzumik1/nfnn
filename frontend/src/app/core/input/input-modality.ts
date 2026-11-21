import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  Injectable,
  provideAppInitializer,
} from '@angular/core';

const PASSIVE_CAPTURE: AddEventListenerOptions = { passive: true, capture: true };
const LAST_INPUT_ATTRIBUTE = 'data-input';
const LONE_MODIFIERS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta']);

type LastInput = 'pointer' | 'keyboard';

@Injectable({ providedIn: 'root' })
export class InputModality {
  private readonly document = inject(DOCUMENT);
  private pressedByPointer = false;
  private readonly pointerPressed = () => this.record('pointer');
  private readonly keyPressed = (event: Event) => {
    if (!(event instanceof KeyboardEvent && LONE_MODIFIERS.has(event.key))) {
      this.record('keyboard');
    }
  };

  start(): void {
    this.document.addEventListener('pointerdown', this.pointerPressed, PASSIVE_CAPTURE);
    this.document.addEventListener('keydown', this.keyPressed, PASSIVE_CAPTURE);
  }

  stop(): void {
    this.document.removeEventListener('pointerdown', this.pointerPressed, PASSIVE_CAPTURE);
    this.document.removeEventListener('keydown', this.keyPressed, PASSIVE_CAPTURE);
    this.document.documentElement.removeAttribute(LAST_INPUT_ATTRIBUTE);
  }

  lastPressByPointer(): boolean {
    return this.pressedByPointer;
  }

  private record(input: LastInput): void {
    this.pressedByPointer = input === 'pointer';
    this.document.documentElement.setAttribute(LAST_INPUT_ATTRIBUTE, input);
  }
}

export const inputModalityAtStart: EnvironmentProviders = provideAppInitializer(() =>
  inject(InputModality).start(),
);
