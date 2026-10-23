const MINOR_SUFFIX = 'Minor';
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const crowns = new Intl.NumberFormat('cs-CZ', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const pragueTime = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function formatCrowns(minor: number): string {
  return `${crowns.format(minor / 100)} Kč`.replace(/ /g, ' ');
}

export function formatPragueInstant(iso: string): string {
  const parts = Object.fromEntries(
    pragueTime.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return `${parts['day']}. ${parts['month']}. ${parts['year']} ${parts['hour']}:${parts['minute']}:${parts['second']}`;
}

export function shape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(shape);
  }
  if (typeof value === 'string') {
    return ISO_INSTANT.test(value) ? formatPragueInstant(value) : value;
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const shaped: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.endsWith(MINOR_SUFFIX) && typeof entry === 'number') {
      shaped[key.slice(0, -MINOR_SUFFIX.length)] = formatCrowns(entry);
    } else {
      shaped[key] = shape(entry);
    }
  }
  return shaped;
}

export function asText(value: unknown): string {
  return JSON.stringify(shape(value), null, 2);
}
