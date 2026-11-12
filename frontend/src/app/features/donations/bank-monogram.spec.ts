import { bankMonogram } from './bank-monogram';

describe('Given the short name of a bank', () => {
  it('when the name has two or more words, then the monogram is their first letters in capitals', () => {
    expect(bankMonogram('Česká spořitelna')).toBe('ČS');
    expect(bankMonogram('Komerční banka')).toBe('KB');
    expect(bankMonogram('Fio banka')).toBe('FB');
    expect(bankMonogram('Air Bank')).toBe('AB');
    expect(bankMonogram('MONETA Money Bank')).toBe('MM');
  });

  it('when the name is one word, then the monogram is its first two letters in capitals', () => {
    expect(bankMonogram('Raiffeisenbank')).toBe('RA');
    expect(bankMonogram('mBank')).toBe('MB');
    expect(bankMonogram('Citfin')).toBe('CI');
  });

  it('when the name starts with an abbreviation of up to four capitals, then the abbreviation is kept whole', () => {
    expect(bankMonogram('ČSOB')).toBe('ČSOB');
    expect(bankMonogram('ČSOB Hypoteční banka')).toBe('ČSOB');
    expect(bankMonogram('PPF banka')).toBe('PPF');
    expect(bankMonogram('ING Bank')).toBe('ING');
    expect(bankMonogram('J&T Banka')).toBe('J&T');
  });

  it('when the name has extra spaces or is empty, then the monogram still reads right or is empty', () => {
    expect(bankMonogram('  šárka   banka ')).toBe('ŠB');
    expect(bankMonogram('   ')).toBe('');
  });
});
