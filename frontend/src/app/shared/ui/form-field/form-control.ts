import { Directive, ElementRef, inject } from '@angular/core';
import { NgForm, NgModel } from '@angular/forms';
import { FormField } from './form-field';

@Directive({
  selector: '[appFormControl]',
  host: {
    class: 'form-control',
    '[attr.aria-invalid]': 'showsError() ? "true" : null',
    '[attr.aria-describedby]': 'describedBy()',
  },
})
export class FormControlDirective {
  private readonly model = inject(NgModel, { self: true });
  private readonly form = inject(NgForm, { optional: true });
  private readonly field = inject(FormField);

  readonly id: string = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.id;

  showsError(): boolean {
    return (
      this.model.invalid === true && (this.model.touched === true || this.form?.submitted === true)
    );
  }

  errorKey(): string | null {
    const errors = this.model.errors;
    return errors ? (Object.keys(errors)[0] ?? null) : null;
  }

  describedBy(): string | null {
    const ids = [
      this.field.hint() ? `${this.id}-hint` : null,
      this.showsError() ? `${this.id}-error` : null,
    ].filter((id) => id !== null);
    return ids.length > 0 ? ids.join(' ') : null;
  }
}
