import { sharedCases } from '../../../../testing/shared-cases';
import { decodeMatrix } from '../../../shared/ui/qr-code/testing/plain-qr-decoder';
import {
  INLINE_SYMBOL_MM,
  LAST_INLINE_VERSION,
  MINIMUM_INLINE_MODULE_MM,
  MINIMUM_OWN_AREA_MODULE_MM,
  OWN_AREA_MODULE_MM,
  OWN_AREA_SYMBOL_MM,
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

describe('Given proofs around what level H holds at version 40', () => {
  it('when the largest one H holds is drawn, then it takes level H at version 40, so the receipt can draw its star', () => {
    const symbol = verificationSymbol(`https://nfnn.cz/overit#${'1'.repeat(2995)}`);

    expect({ version: symbol.version, errorCorrection: symbol.errorCorrection }).toEqual({
      version: 40,
      errorCorrection: 'H',
    });
  });

  it('when one digit more is drawn, then it takes level L at the smallest version that holds it, as the server counts it', () => {
    const symbol = verificationSymbol(`https://nfnn.cz/overit#${'1'.repeat(2996)}`);

    expect({ version: symbol.version, errorCorrection: symbol.errorCorrection }).toEqual({
      version: 25,
      errorCorrection: 'L',
    });
  });
});

describe('Given a text that is not a verification proof', () => {
  it('when it is drawn, then it is refused', () => {
    expect(() => verificationSymbol('https://example.org/overit#1123')).toThrow();
  });
});

describe('Given the largest verification symbol that stands beside the signature', () => {
  it('when it is placed, then its modules are at least 0.6 mm', () => {
    const size = 17 + 4 * LAST_INLINE_VERSION;

    expect(MINIMUM_INLINE_MODULE_MM).toBe(0.6);
    expect(INLINE_SYMBOL_MM / size).toBeGreaterThanOrEqual(MINIMUM_INLINE_MODULE_MM);
  });
});

describe('Given verification symbols of every version', () => {
  it('when one up to version 15 is placed, then it stands beside the signature at 46.2 mm, and a larger one in its own area', () => {
    for (const encoded of ENCODED.filter((each) => !('refusal' in each.qr))) {
      const symbol = verificationSymbol(encoded.qrText);
      const placement = qrPlacement(symbol);
      if (symbol.version <= LAST_INLINE_VERSION) {
        expect(placement.area).toBe('inline');
        expect(placement.symbolMm).toBe(INLINE_SYMBOL_MM);
        expect(placement.moduleMm).toBeCloseTo(INLINE_SYMBOL_MM / symbol.size, 9);
      } else {
        expect(placement.area).toBe('own');
        expect(placement.moduleMm).toBeGreaterThanOrEqual(MINIMUM_OWN_AREA_MODULE_MM);
        expect(placement.symbolMm).toBeCloseTo(placement.moduleMm * symbol.size, 6);
      }
    }
  });
});

describe('Given verification symbols above version 15', () => {
  it('when they are placed in their own area, then the modules grow up to 0.8 mm as long as the symbol stays within 100 mm, never below 0.6 mm', () => {
    const own = ENCODED.filter(
      (each) => !('refusal' in each.qr) && each.qr.version > LAST_INLINE_VERSION,
    ).map((each) => verificationSymbol(each.qrText));
    expect(own.length).toBeGreaterThan(2);
    for (const symbol of own) {
      const placement = qrPlacement(symbol);
      expect(placement.moduleMm).toBeLessThanOrEqual(OWN_AREA_MODULE_MM);
      expect(placement.moduleMm).toBeGreaterThanOrEqual(MINIMUM_OWN_AREA_MODULE_MM);
      expect(
        placement.moduleMm === OWN_AREA_MODULE_MM ||
          placement.moduleMm === MINIMUM_OWN_AREA_MODULE_MM ||
          Math.abs(placement.symbolMm - OWN_AREA_SYMBOL_MM) < 1e-9,
      ).toBe(true);
    }
  });
});
