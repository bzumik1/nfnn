import { Directive, effect, ElementRef, inject, input } from '@angular/core';
import { titleParts } from './title-parts';

@Directive({
  selector: '[appTitleBreaks]',
})
export class TitleBreaks {
  readonly appTitleBreaks = input.required<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect(() => {
      const element = this.host.nativeElement;
      const nodes = titleParts(this.appTitleBreaks()).flatMap((part, index) =>
        index === 0 ? [part] : [element.ownerDocument.createElement('wbr'), part],
      );
      element.replaceChildren(...nodes);
    });
  }
}
