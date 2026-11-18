import { AnimationCallbackEvent, Directive } from '@angular/core';

const LEAVING = 'ui-notice--leaving';

@Directive({
  selector: '[appLeavingNotice]',
  host: { '(animate.leave)': 'leave($event)' },
})
export class LeavingNotice {
  protected leave(event: AnimationCallbackEvent): void {
    const notice = event.target as HTMLElement;
    notice.inert = true;
    notice.addEventListener('animationend', (ended) => {
      if (ended.target === notice) {
        event.animationComplete();
      }
    });
    notice.classList.add(LEAVING);
  }
}
