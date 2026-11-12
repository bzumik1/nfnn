import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { NgForm } from '@angular/forms';

import { DirtyForms } from './dirty-forms';

@Directive({ selector: 'form[appTrackedForm]' })
export class TrackedForm {
  constructor() {
    const form = inject(NgForm, { self: true, optional: true });
    if (form === null) {
      return;
    }
    const element = inject<ElementRef<HTMLFormElement>>(ElementRef).nativeElement;
    const unregister = inject(DirtyForms).register(
      () => form.dirty === true && element.isConnected,
    );
    inject(DestroyRef).onDestroy(unregister);
  }
}
