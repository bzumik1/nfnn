const PRAGUE_PARTS = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDataTime(at: number, now: number): string {
  const shown = partsOf(at);
  const time = `${Number(shown['hour'])}:${shown['minute']}`;
  if (dayOf(shown) === dayOf(partsOf(now))) {
    return time;
  }
  const dayAndMonth = `${Number(shown['day'])}. ${Number(shown['month'])}.`;
  if (dayOf(shown) === dayOf(partsOf(now - DAY_MS))) {
    return `${dayAndMonth} ${time}`;
  }
  return `${dayAndMonth} ${shown['year']}`;
}

export function formatDataDay(at: number): string {
  const shown = partsOf(at);
  return `${Number(shown['day'])}. ${Number(shown['month'])}. ${shown['year']}`;
}

function partsOf(instant: number): Record<string, string> {
  return Object.fromEntries(
    PRAGUE_PARTS.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
}

function dayOf(parts: Record<string, string>): string {
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}
