const JSDOM_WINDOW_PROPERTIES = [
  'scrollTo',
  'scrollX',
  'scrollY',
  'innerWidth',
  'innerHeight',
  'matchMedia',
  'visualViewport',
];

export function windowPropertiesOf(
  window: Window,
  kept: WeakMap<object, Map<string, PropertyDescriptor | undefined>>,
): Map<string, PropertyDescriptor | undefined> {
  const known = kept.get(window);
  if (known) {
    return known;
  }
  const captured = new Map(
    JSDOM_WINDOW_PROPERTIES.map(
      (name) => [name, Object.getOwnPropertyDescriptor(window, name)] as const,
    ),
  );
  kept.set(window, captured);
  return captured;
}

export function restoreWindowProperties(
  window: Window,
  properties: Map<string, PropertyDescriptor | undefined>,
): void {
  for (const [name, descriptor] of properties) {
    if (descriptor) {
      Object.defineProperty(window, name, descriptor);
    } else {
      delete (window as unknown as Record<string, unknown>)[name];
    }
  }
}
