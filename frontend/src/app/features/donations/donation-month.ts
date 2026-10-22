/// <reference types="@angular/localize" />

const MONTH_NAMES: readonly string[] = [
  $localize`:@@donor.month.january:leden`,
  $localize`:@@donor.month.february:únor`,
  $localize`:@@donor.month.march:březen`,
  $localize`:@@donor.month.april:duben`,
  $localize`:@@donor.month.may:květen`,
  $localize`:@@donor.month.june:červen`,
  $localize`:@@donor.month.july:červenec`,
  $localize`:@@donor.month.august:srpen`,
  $localize`:@@donor.month.september:září`,
  $localize`:@@donor.month.october:říjen`,
  $localize`:@@donor.month.november:listopad`,
  $localize`:@@donor.month.december:prosinec`,
];

const NO_BREAK_SPACE = ' ';

export function formatMonth(isoMonth: string): string {
  const { year, month } = partsOf(isoMonth);
  return `${MONTH_NAMES[month - 1]}${NO_BREAK_SPACE}${year}`;
}

export function formatMonthRange(firstMonth: string, lastMonth: string): string {
  const first = partsOf(firstMonth);
  const last = partsOf(lastMonth);
  if (first.year !== last.year) {
    return `${formatMonth(firstMonth)}${NO_BREAK_SPACE}– ${formatMonth(lastMonth)}`;
  }
  if (first.month !== last.month) {
    return `${MONTH_NAMES[first.month - 1]}–${formatMonth(lastMonth)}`;
  }
  return formatMonth(lastMonth);
}

function partsOf(isoMonth: string): { readonly year: string; readonly month: number } {
  const [year, month] = isoMonth.slice(0, 7).split('-');
  return { year, month: Number(month) };
}
