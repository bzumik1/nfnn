import { DestroyRef, Directive, inject } from '@angular/core';
import { NgForm } from '@angular/forms';

import { DirtyForms } from './dirty-forms';

@Directive({ selector: 'form[appTrackedForm]' })
export class TrackedForm {
  constructor() {
    const form = inject(NgForm, { self: true, optional: true });
    if (form === null) {
      return;
    }
    const unregister = inject(DirtyForms).register(() => form.dirty === true);
    inject(DestroyRef).onDestroy(unregister);
  }
}
