const WHOLE_CROWNS = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
const CROWNS_WITH_HELLERS = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatCrowns(value: number): string {
  return Number.isInteger(value) ? WHOLE_CROWNS.format(value) : CROWNS_WITH_HELLERS.format(value);
}
