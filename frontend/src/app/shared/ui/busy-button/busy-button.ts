import { DestroyRef, Directive, DOCUMENT, ElementRef, inject, input } from '@angular/core';

const ACTIVATION_KEYS = new Set(['Enter', ' ']);

@Directive({
  selector: 'button[appBusy]',
  host: { '[attr.aria-disabled]': "appBusy() ? 'true' : null" },
})
export class BusyButton {
  readonly appBusy = input.required<boolean>();
  private readonly button: HTMLButtonElement = inject(ElementRef<HTMLButtonElement>).nativeElement;

  constructor() {
    const document = inject(DOCUMENT);
    const ignoreWhileBusy = (event: Event) => {
      if (this.appBusy()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const ignoreKeyWhileBusy = (event: KeyboardEvent) => {
      if (ACTIVATION_KEYS.has(event.key)) {
        ignoreWhileBusy(event);
      }
    };
    const ignoreSubmitWhileBusy = (event: Event) => {
      if (this.button.type === 'submit' && event.target === this.button.form) {
        ignoreWhileBusy(event);
      }
    };
    this.button.addEventListener('click', ignoreWhileBusy, { capture: true });
    this.button.addEventListener('keydown', ignoreKeyWhileBusy, { capture: true });
    document.addEventListener('submit', ignoreSubmitWhileBusy, { capture: true });
    inject(DestroyRef).onDestroy(() => {
      this.button.removeEventListener('click', ignoreWhileBusy, { capture: true });
      this.button.removeEventListener('keydown', ignoreKeyWhileBusy, { capture: true });
      document.removeEventListener('submit', ignoreSubmitWhileBusy, { capture: true });
    });
  }
}
