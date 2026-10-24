import { Directive } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from '@angular/forms';

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2];
const EIGHT_DIGITS = /^\d{8}$/;

export function hasValidCheckDigit(candidate: string): boolean {
  const digits = candidate.replace(/\s+/g, '');
  if (!EIGHT_DIGITS.test(digits)) {
    return false;
  }
  const sum = WEIGHTS.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
  return Number(digits[7]) === (11 - (sum % 11)) % 10;
}

@Directive({
  selector: '[appCompanyIdentifier][ngModel]',
  providers: [{ provide: NG_VALIDATORS, useExisting: CompanyIdentifierValidator, multi: true }],
})
export class CompanyIdentifierValidator implements Validator {
  validate(control: AbstractControl<string | null>): ValidationErrors | null {
    const digits = (control.value ?? '').replace(/\s+/g, '');
    if (!EIGHT_DIGITS.test(digits) || hasValidCheckDigit(digits)) {
      return null;
    }
    return { companyIdentifier: true };
  }
}
