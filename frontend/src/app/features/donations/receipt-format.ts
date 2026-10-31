import { formatMinorUnits } from './donation-amount';
import { formatDonationDate } from './donation-date';
import type { SignedReceipt } from './verification/receipt-proof';

export interface ReceiptDonorFields {
  readonly company: boolean;
  readonly name: string;
  readonly companyIdentifier: string | null;
  readonly street: string;
  readonly city: string;
  readonly postalCode: string;
}

export interface ReceiptDonorLines {
  readonly company: boolean;
  readonly donorName: string;
  readonly donorIdentifier: string | null;
  readonly donorAddress: string;
}

export interface ReceiptGiftLine {
  readonly receivedOn: string;
  readonly amount: string;
}

export interface ReceiptDisplay extends ReceiptDonorLines {
  readonly number: string;
  readonly issuedOn: string;
  readonly replaces: { readonly number: string; readonly issuedOn: string } | null;
  readonly year: number | null;
  readonly gifts: readonly ReceiptGiftLine[];
  readonly total: string;
}

export function formatReceiptAmount(amountMinor: number): string {
  return `${formatMinorUnits(amountMinor)}\u00a0Kč`;
}

export function formatReceiptDate(day: string): string {
  return formatDonationDate(day);
}

export function formatReceiptDonor(donor: ReceiptDonorFields): ReceiptDonorLines {
  return {
    company: donor.company,
    donorName: donor.name.trim(),
    donorIdentifier: donor.company ? donor.companyIdentifier : null,
    donorAddress: `${donor.street.trim()}, ${donor.postalCode.trim()} ${donor.city.trim()}`,
  };
}

export function receiptDisplay(receipt: SignedReceipt): ReceiptDisplay {
  return {
    number: receipt.number,
    issuedOn: formatReceiptDate(receipt.issuedOn),
    replaces:
      receipt.replaces === null
        ? null
        : {
            number: receipt.replaces.number,
            issuedOn: formatReceiptDate(receipt.replaces.issuedOn),
          },
    ...formatReceiptDonor({ ...receipt.donor, company: receipt.donor.type === 'company' }),
    year: receipt.year,
    gifts: receipt.gifts.map((gift) => ({
      receivedOn: formatReceiptDate(gift.receivedOn),
      amount: formatReceiptAmount(gift.amountMinor),
    })),
    total: formatReceiptAmount(receipt.totalMinor),
  };
}

const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function formatReceiptAmountEn(amountMinor: number): string {
  const crowns = Math.floor(amountMinor / 100);
  const hellers = amountMinor % 100;
  const grouped = String(crowns).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return hellers === 0 ? `CZK ${grouped}` : `CZK ${grouped}.${String(hellers).padStart(2, '0')}`;
}

export function formatReceiptDateEn(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return `${date} ${ENGLISH_MONTHS[month - 1]} ${year}`;
}

export function fillReceiptText(template: string, ...values: readonly string[]): string {
  let text = '';
  let quoted = false;
  for (let index = 0; index < template.length; index++) {
    const character = template[index];
    if (character === "'") {
      if (template[index + 1] === "'") {
        text += "'";
        index++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    const placeholder = quoted ? null : /^\{(\d+)\}/.exec(template.slice(index));
    if (placeholder === null) {
      text += character;
      continue;
    }
    const value = values[Number(placeholder[1])];
    if (value === undefined) {
      throw new Error(`The receipt text has no value for ${placeholder[0]}.`);
    }
    text += value;
    index += placeholder[0].length - 1;
  }
  return text;
}
