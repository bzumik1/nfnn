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

export function formatReceiptAmountEn(amountMinor: number): string {
  throw new Error(`not implemented ${amountMinor}`);
}

export function formatReceiptDateEn(day: string): string {
  throw new Error(`not implemented ${day}`);
}

export function fillReceiptText(template: string, ...values: readonly string[]): string {
  throw new Error(`not implemented ${template} ${values.length}`);
}
