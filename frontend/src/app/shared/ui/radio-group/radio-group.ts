import { Directive, ElementRef, inject } from '@angular/core';

const STEPS: Readonly<Record<string, number | 'first' | 'last'>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  Home: 'first',
  End: 'last',
};

@Directive({
  selector: '[appRadioGroup]',
  host: { role: 'radiogroup', '(keydown)': 'move($event)' },
})
export class RadioGroup {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected move(event: KeyboardEvent): void {
    const step = STEPS[event.key];
    const radios = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'),
    );
    const current = radios.indexOf(event.target as HTMLElement);
    if (step === undefined || current < 0) {
      return;
    }
    event.preventDefault();
    const next =
      step === 'first'
        ? 0
        : step === 'last'
          ? radios.length - 1
          : (current + step + radios.length) % radios.length;
    radios[next].focus();
    radios[next].click();
  }
}
