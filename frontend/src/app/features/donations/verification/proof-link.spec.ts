import { proofFragment } from './proof-link';

const DIGITS = '10031885061882060800046343990168929322040303989858395561963591784434255';

describe('Given a text that may be the link of a verification QR code', () => {
  it('when it is the foundation address followed by digits, then it gives the digits', () => {
    expect(proofFragment(`https://nfnn.cz/overit#${DIGITS}`)).toBe(DIGITS);
  });

  it('when it is surrounded by spaces or line breaks, then it gives the digits', () => {
    expect(proofFragment(`  https://nfnn.cz/overit#${DIGITS}\n`)).toBe(DIGITS);
  });

  for (const [name, text] of [
    ['empty', ''],
    ['the address alone', 'https://nfnn.cz/overit#'],
    ['the address without a fragment', 'https://nfnn.cz/overit'],
    ['another host', `https://nfnn.cz.example/overit#${DIGITS}`],
    ['a look-alike host', `https://nfnn.com/overit#${DIGITS}`],
    ['plain http', `http://nfnn.cz/overit#${DIGITS}`],
    ['the staging host', `https://nfnn.znamenacek.duckdns.org/overit#${DIGITS}`],
    ['a www address', `https://www.nfnn.cz/overit#${DIGITS}`],
    ['letters in the fragment', `https://nfnn.cz/overit#${DIGITS}a`],
    ['a space inside the fragment', `https://nfnn.cz/overit#1003 1885`],
    ['the digits alone', DIGITS],
    ['a query before the fragment', `https://nfnn.cz/overit?x=1#${DIGITS}`],
    ['an upper-case address', `HTTPS://NFNN.CZ/OVERIT#${DIGITS}`],
  ]) {
    it(`when it is ${name}, then it gives nothing`, () => {
      expect(proofFragment(text)).toBeNull();
    });
  }

  it('when it is longer than any verification code can be, then it gives nothing', () => {
    expect(proofFragment(`https://nfnn.cz/overit#1${'0'.repeat(8000)}`)).toBeNull();
  });
});
