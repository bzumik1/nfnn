import { AnimationCallbackEvent } from '@angular/core';

export interface LeaveWithClass {
  readonly leaves?: (target: HTMLElement) => boolean;
  readonly left?: (target: HTMLElement) => void;
  readonly settling?: string;
}

export const LEAVE_GRACE_MS = 300;
const DOUBLE_TAP_MS = 300;
const LEAVE_ENDS = ['animationend', 'animationcancel'] as const;
const settlingHolds = new WeakMap<Element, number>();

function settleRowsBelow(row: Element, className: string): () => void {
  const below: Element[] = [];
  for (let next = row.nextElementSibling; next !== null; next = next.nextElementSibling) {
    below.push(next);
    settlingHolds.set(next, (settlingHolds.get(next) ?? 0) + 1);
    next.classList.add(className);
  }
  return () => {
    setTimeout(() => {
      for (const settled of below) {
        const holds = (settlingHolds.get(settled) ?? 1) - 1;
        settlingHolds.set(settled, holds);
        if (holds === 0) {
          settled.classList.remove(className);
        }
      }
    }, DOUBLE_TAP_MS);
  };
}

export function leaveWithClass(
  className: string,
  { leaves = () => true, left = () => undefined, settling }: LeaveWithClass = {},
): (event: AnimationCallbackEvent) => void {
  return ({ target, animationComplete }) => {
    const element = target as HTMLElement;
    if (!leaves(element)) {
      animationComplete();
      return;
    }
    const settled = settling === undefined ? () => undefined : settleRowsBelow(element, settling);
    if (!element.hasAttribute('inert')) {
      element.setAttribute('inert', '');
    }
    element.classList.add(className);
    const motions = element.getAnimations?.() ?? [];
    const longest = Math.max(
      0,
      ...motions.map((motion) => Number(motion.effect?.getComputedTiming().endTime ?? 0)),
    );
    if (longest === 0) {
      left(element);
      animationComplete();
      settled();
      return;
    }
    let done = false;
    const complete = (): void => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(fallback);
      for (const type of LEAVE_ENDS) {
        element.removeEventListener(type, ended);
      }
      left(element);
      animationComplete();
      settled();
    };
    const ended = (event: Event): void => {
      const running = (element.getAnimations?.() ?? []).some(
        (motion) => motion.playState !== 'finished',
      );
      if (event.target === element && !running) {
        complete();
      }
    };
    for (const type of LEAVE_ENDS) {
      element.addEventListener(type, ended);
    }
    Promise.allSettled(motions.map((motion) => motion.finished)).then(complete);
    const fallback = setTimeout(complete, longest + LEAVE_GRACE_MS);
  };
}
