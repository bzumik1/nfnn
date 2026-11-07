import { bankNameOf, CZECH_BANK_CODES, shortBankName } from './czech-banks';

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

describe('Given a bank name as the ČNB writes it', () => {
  it.each([
    ['Česká spořitelna, a.s.', 'Česká spořitelna'],
    ['Československá obchodní banka, a. s.', 'Československá obchodní banka'],
    ['TRINITY BANK a.s.', 'TRINITY BANK'],
    ['Citfin, spořitelní družstvo', 'Citfin'],
    ['Citibank Europe plc, organizační složka', 'Citibank Europe'],
    ['Sberbank CZ, a.s. v likvidaci', 'Sberbank CZ'],
    ['FAS finance company s.r.o.', 'FAS finance company'],
    ['BNP Paribas S.A., pobočka Česká republika', 'BNP Paribas'],
    [
      'Bank of Communications Co., Ltd., Prague Branch odštěpný závod',
      'Bank of Communications Co.',
    ],
    ['ING Bank N.V.', 'ING Bank'],
    ['Multitude Bank p.l.c.', 'Multitude Bank'],
    ['PAYMONT, UAB', 'PAYMONT'],
    ['Oberbank AG pobočka Česká republika', 'Oberbank'],
    ['Deutsche Bank Aktiengesellschaft Filiale Prag, organizační složka', 'Deutsche Bank'],
    ['Bank of China (CEE) Ltd. Prague Branch', 'Bank of China (CEE)'],
    ['Nová banka', 'Nová banka'],
  ])('when %j is shortened, then it reads %j', (name, short) => {
    expect(shortBankName(name)).toBe(short);
  });

  it('when nothing would be left after the legal form, then the name stays as the ČNB wrote it', () => {
    expect(shortBankName('a.s.')).toBe('a.s.');
  });
});
