import { hkdfSha256 } from './hkdf';
import { bytesToHex, hexToBytes } from './testing/hex';

function counting(from: number, to: number): string {
  let hex = '';
  for (let value = from; value <= to; value++) {
    hex += value.toString(16).padStart(2, '0');
  }
  return hex;
}

const RFC_5869_SHA_256 = [
  {
    name: 'test case 1 (basic)',
    ikm: '0b'.repeat(22),
    salt: counting(0x00, 0x0c),
    info: counting(0xf0, 0xf9),
    length: 42,
    okm: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
  },
  {
    name: 'test case 2 (longer inputs and outputs)',
    ikm: counting(0x00, 0x4f),
    salt: counting(0x60, 0xaf),
    info: counting(0xb0, 0xff),
    length: 82,
    okm:
      'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c' +
      '59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71' +
      'cc30c58179ec3e87c14c01d5c1f3434f1d87',
  },
  {
    name: 'test case 3 (zero-length salt and info)',
    ikm: '0b'.repeat(22),
    salt: '',
    info: '',
    length: 42,
    okm: '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8',
  },
];

describe('Given HKDF-SHA-256 over WebCrypto', () => {
  for (const vector of RFC_5869_SHA_256) {
    it(`when it derives the RFC 5869 ${vector.name}, then it gives the published output`, async () => {
      const okm = await hkdfSha256(
        hexToBytes(vector.ikm),
        hexToBytes(vector.salt),
        hexToBytes(vector.info),
        vector.length,
      );

      expect(bytesToHex(okm)).toBe(vector.okm);
    });
  }
});
