export function formatDonationDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}. ${month}. ${year}`;
}

const BANK_TIME = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatBankTime(isoInstant: string): string {
  const parts = Object.fromEntries(BANK_TIME.formatToParts(new Date(isoInstant)).map((part) => [part.type, part.value]));
  return `${parts['day']}. ${parts['month']}. ${parts['year']} ${parts['hour']}:${parts['minute']}`;
}
