import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  Injectable,
  provideAppInitializer,
} from '@angular/core';
import { isTextEntry } from '../layout/soft-keyboard';

const PASSIVE_CAPTURE: AddEventListenerOptions = { passive: true, capture: true };
const LAST_INPUT_ATTRIBUTE = 'data-input';
export const LONE_MODIFIERS: ReadonlySet<string> = new Set([
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'CapsLock',
  'Fn',
]);
const COMPOSING_KEYS: ReadonlySet<string> = new Set(['Unidentified', 'Process']);
const COMPOSING_KEY_CODE = 229;
const KEYS_THAT_LEAVE_TEXT: ReadonlySet<string> = new Set(['Tab', 'Escape']);
const PRESSABLE_CONTROL =
  'button, a[href], summary, [role="button"], [role="switch"], [role="tab"], [role="menuitem"]';

type LastInput = 'pointer' | 'keyboard';

function composes(event: KeyboardEvent): boolean {
  return event.isComposing || COMPOSING_KEYS.has(event.key) || event.keyCode === COMPOSING_KEY_CODE;
}

function namesTheKeyboard(event: KeyboardEvent): boolean {
  if (composes(event) || LONE_MODIFIERS.has(event.key)) {
    return false;
  }
  return (
    !(event.target instanceof Element && isTextEntry(event.target)) ||
    KEYS_THAT_LEAVE_TEXT.has(event.key)
  );
}

@Injectable({ providedIn: 'root' })
export class InputModality {
  private readonly document = inject(DOCUMENT);
  private pressedByPointer = false;
  private pressed: Element | null = null;
  private readonly pointerPressed = () => this.record('pointer');
  private readonly activated = (event: Event) => {
    this.pressed = event.target instanceof Element ? event.target : null;
  };
  private readonly keyPressed = (event: Event) => {
    this.pressed = null;
    if (event instanceof KeyboardEvent && namesTheKeyboard(event)) {
      this.record('keyboard');
    }
  };

  start(): void {
    this.document.addEventListener('pointerdown', this.pointerPressed, PASSIVE_CAPTURE);
    this.document.addEventListener('keydown', this.keyPressed, PASSIVE_CAPTURE);
    this.document.addEventListener('click', this.activated, PASSIVE_CAPTURE);
  }

  stop(): void {
    this.document.removeEventListener('pointerdown', this.pointerPressed, PASSIVE_CAPTURE);
    this.document.removeEventListener('keydown', this.keyPressed, PASSIVE_CAPTURE);
    this.document.removeEventListener('click', this.activated, PASSIVE_CAPTURE);
    this.document.documentElement.removeAttribute(LAST_INPUT_ATTRIBUTE);
    this.pressed = null;
  }

  lastPressByPointer(): boolean {
    return this.pressedByPointer;
  }

  lastPressedControl(): HTMLElement | null {
    const control = this.pressed?.closest<HTMLElement>(PRESSABLE_CONTROL) ?? null;
    return control?.isConnected ? control : null;
  }

  takePressedControl(): HTMLElement | null {
    const control = this.lastPressedControl();
    this.pressed = null;
    return control;
  }

  private record(input: LastInput): void {
    this.pressedByPointer = input === 'pointer';
    this.pressed = null;
    const root = this.document.documentElement;
    if (root.getAttribute(LAST_INPUT_ATTRIBUTE) !== input) {
      root.setAttribute(LAST_INPUT_ATTRIBUTE, input);
    }
  }
}

export const inputModalityAtStart: EnvironmentProviders = provideAppInitializer(() =>
  inject(InputModality).start(),
);
