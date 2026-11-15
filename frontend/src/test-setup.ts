import { jsdomWindowProperties, restoreJsdomWindow } from './testing/jsdom-window';

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

const windowAsJsdomMadeIt = jsdomWindowProperties();

beforeEach(() => restoreJsdomWindow(windowAsJsdomMadeIt));

afterEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    return;
  }
});
