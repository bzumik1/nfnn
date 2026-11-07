import { bankNameOf, CZECH_BANK_CODES } from './czech-banks';

const LEGAL_FORMS =
  /a\.\s?s\.|s\.r\.o\.|organizační složka|odštěpný závod|pobočka|spořitelní družstvo|v likvidaci|\beG\b|\bAG\b|S\.A\.|p\.l\.c\.|N\.V\.|UAB|Ltd|Limited|Aktiengesellschaft|Branch|\bplc\b|Filiale/i;

describe('Given the ČNB list of Czech bank codes', () => {
  it('when a Czech account names a listed bank code, then it gives the short name of that bank', () => {
    expect(bankNameOf('19-2000145399/0800')).toBe('Česká spořitelna');
  });

  it('when the bank code is not on the list, then it gives no name', () => {
    expect(bankNameOf('2000145399/9999')).toBeNull();
  });

  it('when the account is not a Czech account with a bank code, then it gives no name', () => {
    expect(bankNameOf('CZ6508000000192000145399')).toBeNull();
  });

  it('when the list is read, then every code has four digits and a short name without a legal form', () => {
    for (const [code, name] of Object.entries(CZECH_BANK_CODES.names)) {
      expect(code).toMatch(/^[0-9]{4}$/);
      expect(name).not.toMatch(LEGAL_FORMS);
    }
  });

  it('when the list is read, then it names its source at the ČNB and the day it was fetched', () => {
    expect(CZECH_BANK_CODES.source).toMatch(/^https:\/\/www\.cnb\.cz\/.*kody_bank_CR\.csv$/);
    expect(CZECH_BANK_CODES.fetchedOn).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  });
});
