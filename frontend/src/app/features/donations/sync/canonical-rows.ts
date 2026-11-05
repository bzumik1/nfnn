export function canonicalRows(rows: readonly unknown[]): string {
  return canonical(rows);
}

export async function rowsSha256(rows: readonly unknown[]): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalRows(rows)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError(`Sync rows hold integers within the safe range only, not ${value}`);
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort(byCodeUnits)
      .map(
        (name) => `${JSON.stringify(name)}:${canonical((value as Record<string, unknown>)[name])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function byCodeUnits(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}
