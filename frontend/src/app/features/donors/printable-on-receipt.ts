import { Directive } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from '@angular/forms';
import { printedText } from '../donations/receipt-pdf/receipt-characters';

@Directive({
  selector: '[appPrintableOnReceipt][ngModel]',
  providers: [{ provide: NG_VALIDATORS, useExisting: PrintableOnReceiptValidator, multi: true }],
})
export class PrintableOnReceiptValidator implements Validator {
  validate(control: AbstractControl<string | null>): ValidationErrors | null {
    const value = control.value ?? '';
    if (value === '' || printedText(value).outside.length === 0) {
      return null;
    }
    return { printableOnReceipt: true };
  }
}
