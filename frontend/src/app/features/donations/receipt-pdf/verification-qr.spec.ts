import { sharedCases } from '../../../../testing/shared-cases';
import { decodeMatrix } from '../../../shared/ui/qr-code/testing/plain-qr-decoder';
import {
  INLINE_SYMBOL_MM,
  MINIMUM_INLINE_MODULE_MM,
  MINIMUM_OWN_AREA_MODULE_MM,
  qrPlacement,
  verificationSymbol,
} from './verification-qr';

const ENCODED = sharedCases('verification/payload.json').flatMap((sharedCase) =>
  'qrText' in sharedCase.expected
    ? [{ name: sharedCase.name, qrText: sharedCase.expected.qrText, qr: sharedCase.expected.qr }]
    : [],
);

describe('Given the encoding cases of the verification proof', () => {
  it('when they are read, then the symbols of 1, 40, 120 and 366 gifts are among them', () => {
    expect(ENCODED.map((encoded) => encoded.name)).toEqual(
      expect.arrayContaining([
        'a single receipt of one gift',
        'a yearly receipt of 40 gifts',
        'a yearly receipt of 120 gifts',
        'a yearly receipt of 366 gifts, two on the last day',
      ]),
    );
  });

  for (const encoded of ENCODED) {
    const qr = encoded.qr;
    if ('refusal' in qr) {
      it(`when ${encoded.name} is drawn, then it is refused, as the server refuses to issue it`, () => {
        expect(() => verificationSymbol(encoded.qrText)).toThrow();
      });
    } else {
      it(`when ${encoded.name} is drawn, then the symbol has version ${qr.version} at level ${qr.errorCorrection} and decodes to the proof`, () => {
        const symbol = verificationSymbol(encoded.qrText);

        expect({ version: symbol.version, errorCorrection: symbol.errorCorrection }).toEqual(qr);
        expect(decodeMatrix(symbol)?.data).toBe(encoded.qrText);
      });
    }
  }
});

describe('Given a proof that level M holds only from version 14 but level L holds at version 13', () => {
  it('when it is drawn, then it takes level L at version 14, as the server counts it', () => {
    const digits = '1'.repeat(774);
    const symbol = verificationSymbol(`https://nfnn.cz/overit#${digits}`);

    expect({ version: symbol.version, errorCorrection: symbol.errorCorrection }).toEqual({
      version: 14,
      errorCorrection: 'L',
    });
  });
});

describe('Given a text that is not a verification proof', () => {
  it('when it is drawn, then it is refused', () => {
    expect(() => verificationSymbol('https://example.org/overit#1123')).toThrow();
  });
});

describe('Given verification symbols of every version', () => {
  it('when one up to version 13 is placed, then it fills the 35 mm block with modules of at least 0.5 mm', () => {
    for (const encoded of ENCODED.filter((each) => !('refusal' in each.qr))) {
      const symbol = verificationSymbol(encoded.qrText);
      const placement = qrPlacement(symbol);
      if (symbol.version <= 13) {
        expect(placement.area).toBe('inline');
        expect(placement.symbolMm).toBe(INLINE_SYMBOL_MM);
        expect(placement.moduleMm).toBeGreaterThanOrEqual(MINIMUM_INLINE_MODULE_MM);
      } else {
        expect(placement.area).toBe('own');
        expect(placement.moduleMm).toBeGreaterThanOrEqual(MINIMUM_OWN_AREA_MODULE_MM);
        expect(placement.symbolMm).toBeCloseTo(placement.moduleMm * symbol.size, 6);
      }
    }
  });
});
