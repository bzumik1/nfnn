export function formatDonationDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}. ${month}. ${year}`;
}
