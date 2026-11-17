import { Directive, input } from '@angular/core';

@Directive({ selector: '[appDisclosure]' })
export class Disclosure {
  readonly closed = input(false);
}
