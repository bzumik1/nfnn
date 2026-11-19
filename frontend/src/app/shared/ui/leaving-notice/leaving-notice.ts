import { AnimationCallbackEvent, Directive } from '@angular/core';

const LEAVING = 'ui-notice--leaving';
const LEAVE_GRACE_MS = 300;

@Directive({
  selector: '[appLeavingNotice]',
  host: { '(animate.leave)': 'leave($event)' },
})
export class LeavingNotice {
  protected leave(event: AnimationCallbackEvent): void {
    const notice = event.target as HTMLElement;
    notice.inert = true;
    let left = false;
    const leaves = (): void => {
      if (!left) {
        left = true;
        clearTimeout(fallback);
        event.animationComplete();
      }
    };
    for (const type of ['animationend', 'animationcancel']) {
      notice.addEventListener(type, (ended) => {
        if (ended.target === notice) {
          leaves();
        }
      });
    }
    notice.classList.add(LEAVING);
    const longest = Math.max(
      0,
      ...(notice.getAnimations?.() ?? []).map((motion) =>
        Number(motion.effect?.getComputedTiming().endTime ?? 0),
      ),
    );
    const fallback = setTimeout(leaves, longest + LEAVE_GRACE_MS);
  }
}
