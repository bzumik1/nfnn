import {
  afterRenderEffect,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';

const UNFOLDING_PROPERTY = 'grid-template-rows';

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
  readonly unfolded = output();

  private readonly element: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private openings = 0;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.element.setAttribute('inert', '');
      this.element.setAttribute('aria-hidden', 'true');
    });
    let wasClosed: boolean | null = null;
    afterRenderEffect(() => {
      const closed = this.closed();
      const opened = wasClosed === true && !closed;
      wasClosed = closed;
      if (opened) {
        this.announceOnceUnfolded();
      }
    });
  }

  private announceOnceUnfolded(): void {
    const opening = ++this.openings;
    const unfolding = (this.element.getAnimations?.() ?? []).filter(unfoldsHeight);
    void Promise.allSettled(unfolding.map((motion) => motion.finished)).then(() => {
      if (!this.destroyed && opening === this.openings && !this.closed()) {
        this.unfolded.emit();
      }
    });
  }
}

function unfoldsHeight(motion: Animation): boolean {
  return 'transitionProperty' in motion && motion.transitionProperty === UNFOLDING_PROPERTY;
}
