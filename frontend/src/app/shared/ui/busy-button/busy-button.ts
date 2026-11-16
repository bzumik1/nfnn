import { DestroyRef, Directive, DOCUMENT, effect, ElementRef, inject, input } from '@angular/core';

import { NeedsConnection } from '../needs-connection/needs-connection';

const ACTIVATION_KEYS = new Set(['Enter', ' ']);

@Directive({ selector: 'button[appBusy]' })
export class BusyButton {
  readonly appBusy = input(false);
  private readonly button: HTMLButtonElement = inject(ElementRef<HTMLButtonElement>).nativeElement;

  constructor() {
    const needsConnection = inject(NeedsConnection, { optional: true, self: true });
    if (needsConnection === null) {
      effect(() => {
        if (this.appBusy()) {
          this.button.setAttribute('aria-disabled', 'true');
        } else {
          this.button.removeAttribute('aria-disabled');
        }
      });
    } else {
      needsConnection.alsoUnavailableWhile(this.appBusy);
    }
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
