import { sharedCases } from '../../../../testing/shared-cases';
import { printedText } from './receipt-characters';

function named(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

describe('Given the characters a receipt can print', () => {
  for (const sharedCase of sharedCases('receipts/printable.json')) {
    describe(`Given the shared case ${sharedCase.name}`, () => {
      it('when the browser prints the text, then it gives the printed text and the code points outside the printable set', () => {
        const printed = printedText(sharedCase.input.text);

        expect({ text: printed.text, outside: printed.outside.map(named) }).toEqual(
          sharedCase.expected,
        );
      });
    });
  }
});
