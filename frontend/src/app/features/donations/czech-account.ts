const ACCOUNT_NUMBER = /^(?:([0-9]{1,6})-)?([0-9]{1,10})\/([0-9]{4})$/;
const WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];
const CHECK_MODULUS = 11;
const PREFIX_DIGITS = 6;
const NUMBER_DIGITS = 10;
const COUNTRY = 'CZ';
const COUNTRY_AS_DIGITS = '123500';
const IBAN_MODULUS = 97;
const IBAN_CHECK_BASE = 98;
const CHECK_DIGITS = 2;

export function ibanOfAccountNumber(accountNumber: string): string | null {
  const parts = ACCOUNT_NUMBER.exec(accountNumber);
  if (parts === null) {
    return null;
  }
  const [, prefix = '', number, bankCode] = parts;
  if (
    (prefix !== '' && !passesModulo11(prefix)) ||
    !passesModulo11(number) ||
    /^0+$/.test(number)
  ) {
    return null;
  }
  const basicBankAccountNumber =
    bankCode + prefix.padStart(PREFIX_DIGITS, '0') + number.padStart(NUMBER_DIGITS, '0');
  const checkDigits = IBAN_CHECK_BASE - remainder(basicBankAccountNumber + COUNTRY_AS_DIGITS);
  return `${COUNTRY}${String(checkDigits).padStart(CHECK_DIGITS, '0')}${basicBankAccountNumber}`;
}

export function accountMatchesIban(accountNumber: string, iban: string): boolean {
  const expected = ibanOfAccountNumber(accountNumber);
  return expected !== null && expected === iban;
}

function passesModulo11(digits: string): boolean {
  const padded = digits.padStart(NUMBER_DIGITS, '0');
  const sum = WEIGHTS.reduce((total, weight, index) => total + Number(padded[index]) * weight, 0);
  return sum % CHECK_MODULUS === 0;
}

function remainder(digits: string): number {
  return [...digits].reduce((rest, digit) => (rest * 10 + Number(digit)) % IBAN_MODULUS, 0);
}
