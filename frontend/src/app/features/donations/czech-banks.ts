import { bankCodeOf } from './czech-account';

export interface CzechBankCodes {
  readonly source: string;
  readonly fetchedOn: string;
  readonly names: Readonly<Record<string, string>>;
}

export const CZECH_BANK_CODES: CzechBankCodes = {
  source: 'https://www.cnb.cz/cs/platebni-styk/.galleries/ucty_kody_bank/download/kody_bank_CR.csv',
  fetchedOn: '2026-11-06',
  names: {
    '0100': 'Komerční banka',
    '0300': 'ČSOB',
    '0600': 'MONETA Money Bank',
    '0710': 'Česká národní banka',
    '0800': 'Česká spořitelna',
    '2010': 'Fio banka',
    '2060': 'Citfin',
    '2070': 'Trinity Bank',
    '2100': 'ČSOB Hypoteční banka',
    '2200': 'Peněžní dům',
    '2220': 'Artesa',
    '2250': 'Banka CREDITAS',
    '2600': 'Citibank',
    '2700': 'UniCredit Bank',
    '3030': 'Air Bank',
    '3060': 'PKO BP',
    '3500': 'ING Bank',
    '4300': 'Národní rozvojová banka',
    '5500': 'Raiffeisenbank',
    '5800': 'J&T Banka',
    '6000': 'PPF banka',
    '6200': 'Commerzbank',
    '6210': 'mBank',
    '6300': 'BNP Paribas',
    '6363': 'Partners Banka',
    '6600': 'Banking Circle',
    '6700': 'Všeobecná úverová banka',
    '6800': 'Sberbank',
    '7910': 'Deutsche Bank',
    '7950': 'Raiffeisen stavební spořitelna',
    '7960': 'ČSOB Stavební spořitelna',
    '7970': 'MONETA Stavební Spořitelna',
    '7990': 'Modrá pyramida',
    '8030': 'Volksbank Raiffeisenbank Nordoberpfalz',
    '8040': 'Oberbank',
    '8060': 'Stavební spořitelna České spořitelny',
    '8090': 'Česká exportní banka',
    '8150': 'HSBC',
    '8198': 'FAS finance company',
    '8220': 'Payment execution',
    '8250': 'Bank of China',
    '8255': 'Bank of Communications',
    '8265': 'ICBC',
    '8500': 'Multitude Bank',
    '8610': 'Devizová burza',
    '8620': 'Comgate',
    '8660': 'Paymont',
  },
};

export function bankNameOf(accountNumber: string): string | null {
  const bankCode = bankCodeOf(accountNumber);
  return bankCode === null ? null : (CZECH_BANK_CODES.names[bankCode] ?? null);
}

const BRANCH_MARKER =
  /,|\s(?:pobočka|organizační složka|odštěpný závod|Filiale|Prague Branch|Czech Branch|v likvidaci)\b/;
const TRAILING_LEGAL_FORM =
  /\s+(?:a\.\s?s\.|s\.\s?r\.\s?o\.|S\.A\.|N\.V\.|p\.l\.c\.|plc|AG|eG|UAB|Ltd\.?|Limited|Aktiengesellschaft)$/i;

export function shortBankName(name: string): string {
  const trimmed = name.trim();
  let short = trimmed.split(BRANCH_MARKER)[0].trim();
  for (let stripped = short.replace(TRAILING_LEGAL_FORM, ''); stripped !== short;) {
    short = stripped;
    stripped = short.replace(TRAILING_LEGAL_FORM, '');
  }
  return short === '' ? trimmed : short;
}
