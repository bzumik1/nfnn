import { Directive, ElementRef, inject } from '@angular/core';

@Directive({
  selector: 'form[appFocusFirstInvalid]',
  host: { '(submit)': 'focusFirstInvalid()' },
})
export class FocusFirstInvalid {
  private readonly form = inject<ElementRef<HTMLFormElement>>(ElementRef).nativeElement;

  focusFirstInvalid(): void {
    this.form.querySelector<HTMLElement>('.form-control.ng-invalid')?.focus();
  }
}
