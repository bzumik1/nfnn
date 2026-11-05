import { initialsOf } from './initials';

describe('Given the initials of an account', () => {
  it('when the name has two words, then they are the first letters of both', () => {
    expect(initialsOf('Jana Nováková')).toBe('JN');
  });

  it('when the name has more words, then they are the first letters of the first and the last', () => {
    expect(initialsOf('Jana Marie Nováková')).toBe('JN');
  });

  it('when an organisation has a legal form with dots, then the letters skip the punctuation', () => {
    expect(initialsOf('Zdravé děti, s. r. o.')).toBe('ZO');
  });

  it('when the name starts with a lower-case letter, then the letters are upper case', () => {
    expect(initialsOf('čeněk šťastný')).toBe('ČŠ');
  });

  it('when the name has one word, then it is its first letter', () => {
    expect(initialsOf('Nadace')).toBe('N');
  });

  it('when no name is kept, then there are no initials', () => {
    expect(initialsOf('  ')).toBe('');
  });
});
