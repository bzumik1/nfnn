const MINOR_SUFFIX = 'Minor';
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const pragueTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function crownsOf(minor: number): number {
  return minor / 100;
}

export function pragueInstant(iso: string): string {
  const instant = new Date(iso);
  const seconds = Math.floor(instant.getTime() / 1000) * 1000;
  const parts = Object.fromEntries(
    pragueTime.formatToParts(new Date(seconds)).map((part) => [part.type, part.value]),
  );
  const wall = Date.UTC(
    Number(parts['year']),
    Number(parts['month']) - 1,
    Number(parts['day']),
    Number(parts['hour']),
    Number(parts['minute']),
    Number(parts['second']),
  );
  const offsetMinutes = Math.round((wall - seconds) / 60000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const hours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}:${parts['second']}${sign}${hours}:${minutes}`;
}

export function shape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(shape);
  }
  if (typeof value === 'string') {
    return ISO_INSTANT.test(value) ? pragueInstant(value) : value;
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const shaped: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.endsWith(MINOR_SUFFIX) && typeof entry === 'number') {
      shaped[key.slice(0, -MINOR_SUFFIX.length)] = crownsOf(entry);
    } else {
      shaped[key] = shape(entry);
    }
  }
  return shaped;
}

export function asText(value: unknown): string {
  return JSON.stringify(shape(value));
}
