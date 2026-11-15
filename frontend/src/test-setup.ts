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

const jsdomWindowProperties = new Map(
  [
    'scrollTo',
    'scrollX',
    'scrollY',
    'innerWidth',
    'innerHeight',
    'matchMedia',
    'visualViewport',
  ].map((name) => [name, Object.getOwnPropertyDescriptor(window, name)] as const),
);

beforeEach(() => {
  for (const [name, descriptor] of jsdomWindowProperties) {
    if (descriptor) {
      Object.defineProperty(window, name, descriptor);
    } else {
      delete (window as unknown as Record<string, unknown>)[name];
    }
  }
});

afterEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    return;
  }
});
