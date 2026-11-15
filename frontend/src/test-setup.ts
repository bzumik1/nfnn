import { TestBed } from '@angular/core/testing';
import { restoreWindowProperties, windowPropertiesOf } from './testing/window-properties';

type KeptWindowProperties = WeakMap<object, Map<string, PropertyDescriptor | undefined>>;

const KEPT_WINDOW_PROPERTIES = Symbol.for('nfnn.keptWindowProperties');

if (
  typeof HTMLDialogElement !== 'undefined' &&
  typeof HTMLDialogElement.prototype.showModal !== 'function'
) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
    this.querySelector<HTMLElement>('[autofocus]')?.focus();
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (this.open) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    }
  };
}

const keptWindowProperties = ((globalThis as { [KEPT_WINDOW_PROPERTIES]?: KeptWindowProperties })[
  KEPT_WINDOW_PROPERTIES
] ??= new WeakMap());

if (typeof window !== 'undefined') {
  windowPropertiesOf(window, keptWindowProperties);
}

beforeEach(() => {
  if (typeof window !== 'undefined') {
    restoreWindowProperties(window, windowPropertiesOf(window, keptWindowProperties));
  }
});

afterEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    return;
  }
});

beforeEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    TestBed.resetTestingModule();
    return;
  }
  TestBed.resetTestingModule();
});
