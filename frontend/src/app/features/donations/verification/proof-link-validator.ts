import { Directive } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from '@angular/forms';
import { proofFragment } from './proof-link';

@Directive({
  selector: '[appProofLink][ngModel]',
  providers: [{ provide: NG_VALIDATORS, useExisting: ProofLinkValidator, multi: true }],
})
export class ProofLinkValidator implements Validator {
  validate(control: AbstractControl<string | null>): ValidationErrors | null {
    const value = control.value ?? '';
    return value.trim() === '' || proofFragment(value) !== null ? null : { proofLink: true };
  }
}
