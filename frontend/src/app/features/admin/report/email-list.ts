import { Directive } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from '@angular/forms';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_REPORT_RECIPIENTS = 10;

export function parseEmailList(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/[\n,;]+/)
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
}

@Directive({
  selector: '[appEmailList][ngModel]',
  providers: [{ provide: NG_VALIDATORS, useExisting: EmailListValidator, multi: true }],
})
export class EmailListValidator implements Validator {
  validate(control: AbstractControl<string | null>): ValidationErrors | null {
    const addresses = parseEmailList(control.value);
    if (addresses.length === 0) {
      return null;
    }
    if (addresses.some((address) => !EMAIL_SHAPE.test(address) || address.length > 254)) {
      return { emailList: true };
    }
    if (addresses.length > MAX_REPORT_RECIPIENTS) {
      return { emailListLength: true };
    }
    if (new Set(addresses.map((address) => address.toLowerCase())).size !== addresses.length) {
      return { emailListDuplicate: true };
    }
    return null;
  }
}
