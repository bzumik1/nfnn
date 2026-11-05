import { DestroyRef, Directive, DOCUMENT, effect, ElementRef, inject } from '@angular/core';

import { Connectivity } from '../../../core/connectivity/connectivity';

const BLOCKED_CLASS = 'needs-connection-offline';
const HINT_CLASS = 'ui-needs-connection';

let nextHint = 0;

@Directive({ selector: '[appNeedsConnection]' })
export class NeedsConnection {
  private readonly connectivity = inject(Connectivity);
  private readonly element: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly hintId = `needs-connection-${++nextHint}`;
  private hint: HTMLElement | null = null;
  private ariaDisabledBefore: string | null = null;

  constructor() {
    const swallowWhileOffline = (event: Event) => {
      if (this.connectivity.offline()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    this.element.addEventListener('click', swallowWhileOffline, { capture: true });
    const swallowSubmitWhileOffline = (event: Event) => {
      if (event.target !== null && event.target === this.submittedForm()) {
        swallowWhileOffline(event);
      }
    };
    this.document.addEventListener('submit', swallowSubmitWhileOffline, { capture: true });
    effect(() => {
      if (this.connectivity.offline()) {
        this.block();
      } else {
        this.unblock();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.element.removeEventListener('click', swallowWhileOffline, { capture: true });
      this.document.removeEventListener('submit', swallowSubmitWhileOffline, { capture: true });
      this.hint?.remove();
    });
  }

  private submittedForm(): HTMLFormElement | null {
    const element = this.element;
    return element instanceof HTMLButtonElement && element.type === 'submit' ? element.form : null;
  }

  private block(): void {
    if (this.hint !== null) {
      return;
    }
    this.ariaDisabledBefore = this.element.getAttribute('aria-disabled');
    this.element.setAttribute('aria-disabled', 'true');
    this.element.classList.add(BLOCKED_CLASS);
    this.setDescribedBy([...this.describedBy(), this.hintId]);
    const hint = this.document.createElement('span');
    hint.id = this.hintId;
    hint.className = HINT_CLASS;
    hint.textContent = $localize`:@@ui.needsConnection.hint:Potřebuje připojení`;
    this.element.after(hint);
    this.hint = hint;
  }

  private unblock(): void {
    if (this.hint === null) {
      return;
    }
    this.hint.remove();
    this.hint = null;
    this.element.classList.remove(BLOCKED_CLASS);
    if (this.ariaDisabledBefore === null) {
      this.element.removeAttribute('aria-disabled');
    } else {
      this.element.setAttribute('aria-disabled', this.ariaDisabledBefore);
    }
    this.setDescribedBy(this.describedBy().filter((id) => id !== this.hintId));
  }

  private describedBy(): string[] {
    return (this.element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  }

  private setDescribedBy(ids: readonly string[]): void {
    if (ids.length === 0) {
      this.element.removeAttribute('aria-describedby');
    } else {
      this.element.setAttribute('aria-describedby', ids.join(' '));
    }
  }
}
