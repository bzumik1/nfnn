import { PaymentDetails } from './payment-details-api';

export type PaymentPurpose = 'DONATION' | 'ACCOUNT_VERIFICATION';

export type SpaydField = 'amountMinor' | 'variableSymbol' | 'details';

export interface SpaydPayment {
  readonly amountMinor: number;
  readonly variableSymbol?: string | null;
  readonly purpose?: PaymentPurpose;
}

export type SpaydOutcome =
  { readonly spayd: string } | { readonly refused: { readonly fields: readonly SpaydField[] } };

const HEADER = 'SPD*1.0';
const SEPARATOR = '*';
const SMALLEST_AMOUNT_MINOR = 1;
const LARGEST_AMOUNT_MINOR = 999_999_999;
const MINOR_PER_MAJOR = 100;
const MINOR_DIGITS = 2;
const VARIABLE_SYMBOL = /^[0-9]{1,10}$/;
const SPAYD_TEXT = /^(?:[0-9A-Z$+./:-]+(?: [0-9A-Z$+./:-]+)*)?$/;
const RECIPIENT_NAME_LENGTH = 35;
const MESSAGE_LENGTH = 60;
const IBAN = /^[A-Z]{2}[0-9]{2}[0-9A-Z]{1,30}$/;
const CURRENCY = /^[A-Z]{3}$/;

export function spayd(details: PaymentDetails, payment: SpaydPayment): SpaydOutcome {
  const purpose = payment.purpose ?? 'DONATION';
  const variableSymbol = payment.variableSymbol ?? null;
  const refused: SpaydField[] = [];
  if (!isAmount(payment.amountMinor)) {
    refused.push('amountMinor');
  }
  if (
    variableSymbol === null
      ? purpose === 'ACCOUNT_VERIFICATION'
      : !VARIABLE_SYMBOL.test(variableSymbol)
  ) {
    refused.push('variableSymbol');
  }
  if (!isSpaydReady(details)) {
    refused.push('details');
  }
  if (refused.length > 0) {
    return { refused: { fields: refused } };
  }
  const fields = [
    HEADER,
    `ACC:${details.account.iban}`,
    `AM:${amountText(payment.amountMinor)}`,
    `CC:${details.currency}`,
  ];
  if (variableSymbol !== null) {
    fields.push(`X-VS:${variableSymbol}`);
  }
  if (details.account.recipientName !== '') {
    fields.push(`RN:${details.account.recipientName}`);
  }
  fields.push(
    `MSG:${purpose === 'ACCOUNT_VERIFICATION' ? details.messages.accountVerification : details.messages.donation}`,
  );
  return { spayd: fields.join(SEPARATOR) };
}

function isAmount(amountMinor: number): boolean {
  return (
    Number.isSafeInteger(amountMinor) &&
    amountMinor >= SMALLEST_AMOUNT_MINOR &&
    amountMinor <= LARGEST_AMOUNT_MINOR
  );
}

function amountText(amountMinor: number): string {
  const crowns = Math.floor(amountMinor / MINOR_PER_MAJOR);
  const hellers = String(amountMinor % MINOR_PER_MAJOR).padStart(MINOR_DIGITS, '0');
  return `${crowns}.${hellers}`;
}

function isSpaydReady(details: PaymentDetails): boolean {
  return (
    IBAN.test(details.account.iban) &&
    CURRENCY.test(details.currency) &&
    isSpaydText(details.account.recipientName, RECIPIENT_NAME_LENGTH, false) &&
    isSpaydText(details.messages.donation, MESSAGE_LENGTH, true) &&
    isSpaydText(details.messages.accountVerification, MESSAGE_LENGTH, true)
  );
}

function isSpaydText(text: string, longest: number, required: boolean): boolean {
  return text.length <= longest && (!required || text.length > 0) && SPAYD_TEXT.test(text);
}
