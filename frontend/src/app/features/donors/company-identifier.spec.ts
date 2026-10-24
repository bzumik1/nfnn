import { FormControl } from '@angular/forms';
import { CompanyIdentifierValidator, hasValidCheckDigit } from './company-identifier';

describe('Given a company identification number (IČO)', () => {
  it('when its eighth digit matches the checksum, then it is valid, spaces or not', () => {
    expect(hasValidCheckDigit('45274649')).toBe(true);
    expect(hasValidCheckDigit('452 746 49')).toBe(true);
    expect(hasValidCheckDigit('25596641')).toBe(true);
  });

  it('when its eighth digit does not match the checksum, then it is invalid', () => {
    expect(hasValidCheckDigit('45274648')).toBe(false);
    expect(hasValidCheckDigit('12345678')).toBe(false);
  });

  describe('when the field validates it', () => {
    const validator = new CompanyIdentifierValidator();

    it('then a wrong checksum is reported under its own key', () => {
      expect(validator.validate(new FormControl('12345678'))).toEqual({
        companyIdentifier: true,
      });
    });

    it('then an empty value or one of another length is left to the required and pattern rules', () => {
      expect(validator.validate(new FormControl(''))).toBeNull();
      expect(validator.validate(new FormControl('1234567'))).toBeNull();
      expect(validator.validate(new FormControl(null))).toBeNull();
    });

    it('then a valid number passes', () => {
      expect(validator.validate(new FormControl(' 452 746 49 '))).toBeNull();
    });
  });
});
