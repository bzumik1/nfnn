import { Directive, ElementRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgForm, NgModel } from '@angular/forms';
import { merge } from 'rxjs';
import { FormField } from './form-field';

@Directive({
  selector: '[appFormControl]',
  host: {
    class: 'form-control',
    '[attr.aria-invalid]': 'showsError() ? "true" : null',
    '[attr.aria-describedby]': 'describedBy()',
    '(document:pointerdown)': 'pressStarted()',
    '(document:pointerup)': 'pressEnded()',
    '(document:pointercancel)': 'pressEnded()',
  },
})
export class FormControlDirective {
  private readonly model = inject(NgModel, { self: true });
  private readonly form = inject(NgForm, { optional: true });
  private readonly field = inject(FormField);
  private readonly lastEvent = toSignal(
    this.form ? merge(this.model.control.events, this.form.form.events) : this.model.control.events,
  );

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  get id(): string {
    return this.element.id;
  }

  private readonly pressing = signal(false);
  private readonly touchedBeforePress = signal(false);

  readonly showsError = computed(() => {
    this.lastEvent();
    const touchedDuringPress = this.pressing() && !this.touchedBeforePress();
    return (
      this.model.invalid === true &&
      ((this.model.touched === true && !touchedDuringPress) || this.form?.submitted === true)
    );
  });

  readonly errorKey = computed(() => {
    this.lastEvent();
    const errors = this.model.errors;
    return errors ? (Object.keys(errors)[0] ?? null) : null;
  });

  readonly errorText = computed(() => {
    const key = this.errorKey();
    const value: unknown = key === null ? null : this.model.errors?.[key];
    return typeof value === 'string' ? value : '';
  });

  pressStarted(): void {
    this.touchedBeforePress.set(this.model.touched === true);
    this.pressing.set(true);
  }

  pressEnded(): void {
    this.pressing.set(false);
  }

  readonly describedBy = computed(() => {
    const ids = [
      this.field.hint() ? `${this.id}-hint` : null,
      this.showsError() ? `${this.id}-error` : null,
    ].filter((id) => id !== null);
    return ids.length > 0 ? ids.join(' ') : null;
  });
}
