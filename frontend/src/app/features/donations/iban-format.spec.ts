import { formatIban } from './iban-format';

describe('Given an IBAN as the API sends it', () => {
  it('when it is shown, then it reads in groups of four', () => {
    expect(formatIban('CZ2620100000005544332217')).toBe('CZ26 2010 0000 0055 4433 2217');
  });

  it('when its length is not a multiple of four, then the last group is shorter and nothing trails it', () => {
    expect(formatIban('DE89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });
});
