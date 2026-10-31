import { FormControl } from '@angular/forms';
import { sharedCases } from '../../../testing/shared-cases';
import { PrintableOnReceiptValidator } from './printable-on-receipt';

describe('Given a donor field whose text goes onto the receipt', () => {
  const validator = new PrintableOnReceiptValidator();

  for (const sharedCase of sharedCases('receipts/printable.json')) {
    describe(`Given the shared case ${sharedCase.name}`, () => {
      it('when the donor types its text, then the field refuses it exactly when some character lies outside the printable set', () => {
        const refused = validator.validate(new FormControl(sharedCase.input.text)) !== null;

        expect(refused).toBe(sharedCase.expected.outside.length > 0);
      });
    });
  }

  it('when the field is empty, then this check leaves it to the required rule', () => {
    expect(validator.validate(new FormControl(''))).toBeNull();
    expect(validator.validate(new FormControl(null))).toBeNull();
  });

  it('when the text holds an emoji, then the field names the printable rule', () => {
    expect(validator.validate(new FormControl('Dlouhá 12 🏠'))).toEqual({ printableOnReceipt: true });
  });
});
