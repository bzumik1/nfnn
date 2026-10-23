const MONTH_NAMES = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' });

export function formatReportMonth(isoMonth: string): string {
  const [year, month] = isoMonth.split('-').map(Number);
  return MONTH_NAMES.format(new Date(Date.UTC(year, month - 1, 15)));
}

export function previousMonths(lastIsoMonth: string, count: number): string[] {
  const [year, month] = lastIsoMonth.split('-').map(Number);
  const months: string[] = [];
  for (let offset = 0; offset < count; offset++) {
    const index = year * 12 + (month - 1) - offset;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    months.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return months;
}
