import { Directive } from '@angular/core';
import { leaveWithClass } from '../leaving-row/leave-with-class';

@Directive({
  selector: '[appLeavingNotice]',
  host: { '(animate.leave)': 'leave($event)' },
})
export class LeavingNotice {
  protected readonly leave = leaveWithClass('ui-notice--leaving');
}
