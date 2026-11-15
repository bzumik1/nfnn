const WATCHED_PROPERTIES = [
  'scrollTo',
  'scrollX',
  'scrollY',
  'innerWidth',
  'innerHeight',
  'matchMedia',
  'visualViewport',
] as const;

const FIRST_SNAPSHOT = Symbol.for('nfnn.test.jsdom-window-properties');

export type JsdomWindowProperties = ReadonlyMap<string, PropertyDescriptor | undefined>;

type WorkerGlobal = typeof globalThis & { [FIRST_SNAPSHOT]?: JsdomWindowProperties };

export function jsdomWindowProperties(): JsdomWindowProperties {
  const worker = globalThis as WorkerGlobal;
  worker[FIRST_SNAPSHOT] ??= snapshot();
  return worker[FIRST_SNAPSHOT];
}

function snapshot(): JsdomWindowProperties {
  if (typeof window === 'undefined') {
    return new Map();
  }
  return new Map(
    WATCHED_PROPERTIES.map(
      (name) => [name, Object.getOwnPropertyDescriptor(window, name)] as const,
    ),
  );
}

export function restoreJsdomWindow(properties: JsdomWindowProperties): void {
  for (const [name, descriptor] of properties) {
    if (descriptor) {
      Object.defineProperty(window, name, descriptor);
    } else {
      delete (window as unknown as Record<string, unknown>)[name];
    }
  }
}
