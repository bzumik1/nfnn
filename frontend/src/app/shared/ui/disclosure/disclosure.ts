import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

@Directive({
  selector: '[appDisclosure]',
  host: {
    '[hidden]': 'closed()',
    '[attr.inert]': "closed() ? '' : null",
    '[attr.aria-hidden]': "closed() ? 'true' : null",
  },
})
export class Disclosure {
  readonly closed = input(false);

  constructor() {
    const element: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
    inject(DestroyRef).onDestroy(() => {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    });
  }
}
