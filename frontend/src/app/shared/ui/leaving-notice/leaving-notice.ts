import { AnimationCallbackEvent, Directive } from '@angular/core';
import { leaveWithClass } from '../leaving-row/leaving-row';

const leaveWithLeavingClass = leaveWithClass('ui-notice--leaving');

@Directive({
  selector: '[appLeavingNotice]',
  host: { '(animate.leave)': 'leave($event)' },
})
export class LeavingNotice {
  protected leave(event: AnimationCallbackEvent): void {
    (event.target as HTMLElement).setAttribute('aria-hidden', 'true');
    leaveWithLeavingClass(event);
  }
}
