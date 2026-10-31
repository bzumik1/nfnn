import {
  type PaymentDetailsExpected,
  type SpaydInput,
  sharedCases,
} from '../../../testing/shared-cases';
import { encodeText, textSegments } from '../../shared/ui/qr-code/qr-encoder';
import { PaymentDetails } from './payment-details-api';
import { spayd } from './spayd';

const QR_ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]+$/;

function servedDetails(input: SpaydInput): PaymentDetailsExpected {
  if (input.servedDetails !== undefined) {
    return input.servedDetails;
  }
  const answer = sharedCases('payment/details.json').find(
    (detailsCase) => detailsCase.name === input.details,
  );
  if (answer === undefined) {
    throw new Error(`payment/details.json has no case named ${input.details}`);
  }
  return answer.expected;
}

function composed(input: SpaydInput) {
  return spayd(structuredClone(servedDetails(input)) as PaymentDetails, {
    amountMinor: input.amountMinor,
    variableSymbol: input.variableSymbol,
    purpose: input.purpose,
  });
}

function rows(size: number, modules: string): string[] {
  return Array.from({ length: size }, (_, row) => modules.slice(row * size, (row + 1) * size));
}

for (const sharedCase of sharedCases('payment/spayd.json')) {
  describe(`Given the shared case ${sharedCase.name}`, () => {
    it('when the browser composes the payment from the payment details it holds, then it gives the expected SPAYD text or refusal', () => {
      expect(composed(sharedCase.input)).toEqual(sharedCase.expected);
    });

    if ('spayd' in sharedCase.expected) {
      const text = sharedCase.expected.spayd;
      it('and the text is encoded at level H, then the QR is the symbol of its namesake in qr/payment.json, in alphanumeric mode', () => {
        const qrCase = sharedCases('qr/payment.json').find(
          (candidate) => candidate.name === sharedCase.name,
        );
        const symbol = encodeText(text, 'H');

        expect(QR_ALPHANUMERIC.test(text)).toBe(true);
        expect(textSegments(text).map((segment) => segment.mode)).toEqual(['ALPHANUMERIC']);
        expect({
          version: symbol.version,
          mask: symbol.mask,
          size: symbol.size,
          matrix: rows(symbol.size, symbol.modules),
        }).toEqual({
          version: qrCase?.expected.version,
          mask: qrCase?.expected.mask,
          size: qrCase?.expected.size,
          matrix: qrCase?.expected.matrix,
        });
      });
    }
  });
}

describe('Given the payment details of the foundation', () => {
  const foundation = (): PaymentDetails =>
    structuredClone(
      sharedCases('payment/details.json').find(
        (detailsCase) => detailsCase.name === "the foundation's account",
      )!.expected,
    );

  it('when two fields are wrong at once, then the refusal names both in the order amount, symbol', () => {
    expect(spayd(foundation(), { amountMinor: 0, variableSymbol: 'x' })).toEqual({
      refused: { fields: ['amountMinor', 'variableSymbol'] },
    });
  });

  it('when an amount is not a safe integer, then it is refused instead of written in exponent form', () => {
    expect(spayd(foundation(), { amountMinor: Number.POSITIVE_INFINITY })).toEqual({
      refused: { fields: ['amountMinor'] },
    });
  });

  it('when the IBAN holds the field separator, then the details are refused', () => {
    const details = foundation();
    const withSeparator = { ...details, account: { ...details.account, iban: 'CZ26*AM:1' } };

    expect(spayd(withSeparator, { amountMinor: 50000 })).toEqual({
      refused: { fields: ['details'] },
    });
  });

  it('when the currency is not three capital letters, then the details are refused', () => {
    expect(spayd({ ...foundation(), currency: 'Kč' }, { amountMinor: 50000 })).toEqual({
      refused: { fields: ['details'] },
    });
  });
});
