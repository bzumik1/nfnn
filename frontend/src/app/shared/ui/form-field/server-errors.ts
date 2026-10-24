import { NgForm } from '@angular/forms';

export interface ServerFieldError {
  field: string;
  message: string;
}

export function placeServerErrors<T extends ServerFieldError>(
  form: NgForm,
  errors: readonly T[],
  controlNames: Readonly<Record<string, string>>,
): T[] {
  return errors.filter((error) => {
    const name = controlNames[error.field];
    const control = name === undefined ? null : form.controls[name];
    if (!control || error.message === '') {
      return true;
    }
    control.setErrors({ server: error.message });
    control.markAsTouched();
    return false;
  });
}
