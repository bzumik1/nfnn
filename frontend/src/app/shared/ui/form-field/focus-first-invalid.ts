import { Directive, ElementRef, inject } from '@angular/core';

import { TrackedForm } from '../../../core/updates/tracked-form';

@Directive({
  selector: 'form[appFocusFirstInvalid]',
  hostDirectives: [TrackedForm],
  host: { '(submit)': 'focusFirstInvalid()' },
})
export class FocusFirstInvalid {
  private readonly form = inject<ElementRef<HTMLFormElement>>(ElementRef).nativeElement;

  focusFirstInvalid(): void {
    this.form.querySelector<HTMLElement>('.form-control.ng-invalid')?.focus();
  }
}
