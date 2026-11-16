const NO_BREAK_SPACE = '\u00a0';

export function formatDonationDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return joinDate(day, month, year);
}

const BANK_TIME = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function formatBankTime(isoInstant: string): string {
  const parts = pragueParts(isoInstant);
  return `${joinDate(parts['day'], parts['month'], parts['year'])} ${Number(parts['hour'])}:${parts['minute']}`;
}

export function formatPragueClock(isoInstant: string): string {
  const parts = pragueParts(isoInstant);
  return `${Number(parts['hour'])}:${parts['minute']}`;
}

export function pragueDay(isoInstant: string): string {
  const parts = pragueParts(isoInstant);
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}

export function pragueTime(isoInstant: string): string {
  const parts = pragueParts(isoInstant);
  return `${Number(parts['hour'])}:${parts['minute']}:${parts['second']}`;
}

export function pragueHour(isoInstant: string): number {
  return Number(pragueParts(isoInstant)['hour']);
}

function pragueParts(isoInstant: string): Record<string, string> {
  return Object.fromEntries(
    BANK_TIME.formatToParts(new Date(isoInstant)).map((part) => [part.type, part.value]),
  );
}

function joinDate(day: string, month: string, year: string): string {
  return `${Number(day)}.${NO_BREAK_SPACE}${Number(month)}.${NO_BREAK_SPACE}${year}`;
}
