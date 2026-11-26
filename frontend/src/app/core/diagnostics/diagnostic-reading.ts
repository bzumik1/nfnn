export type Reading = Readonly<Record<string, unknown>>;

export function record(value: unknown): Reading | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Reading;
}

export function field(from: Reading | null, key: string): unknown {
  return from !== null && Object.prototype.hasOwnProperty.call(from, key) ? from[key] : undefined;
}

export function whole(value: unknown, max: number, min = 0): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : null;
}

export function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
    ? (value as T)
    : null;
}
