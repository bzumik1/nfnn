import { Directive, ElementRef, inject, signal } from '@angular/core';

@Directive({
  selector: 'details[appDetailsState]',
  exportAs: 'appDetailsState',
  host: { '(toggle)': 'toggled()' },
})
export class DetailsState {
  private readonly element: HTMLDetailsElement = inject(ElementRef<HTMLDetailsElement>)
    .nativeElement;
  private readonly openState = signal(this.element.open);
  readonly open = this.openState.asReadonly();

  protected toggled(): void {
    this.openState.set(this.element.open);
  }
}
