import { AnimationCallbackEvent } from '@angular/core';

export function markRowsLeaving(rows: Iterable<Element | null>): void {
  for (const row of rows) {
    row?.setAttribute('inert', '');
  }
}

export function neighbourAfterRowLeaves(
  row: Element | null,
  controls: Iterable<HTMLElement>,
): () => HTMLElement | null {
  const below: HTMLElement[] = [];
  const above: HTMLElement[] = [];
  for (const control of controls) {
    if (row === null || followsRow(row, control)) {
      below.push(control);
    } else if (!row.contains(control)) {
      above.push(control);
    }
  }
  const nearestFirst = [...below, ...above.reverse()];
  return () => nearestFirst.find(canTakeFocus) ?? null;
}

function followsRow(row: Element, control: HTMLElement): boolean {
  return (
    !row.contains(control) &&
    (row.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  );
}

function canTakeFocus(control: HTMLElement): boolean {
  return (
    control.isConnected && !control.matches(':disabled') && control.closest('[inert]') === null
  );
}

export interface LeaveWithClass {
  readonly leaves?: (target: HTMLElement) => boolean;
  readonly left?: (target: HTMLElement) => void;
}

const LEAVE_GRACE_MS = 300;
const LEAVE_ENDS = ['animationend', 'animationcancel'] as const;

export function leaveWithClass(
  className: string,
  { leaves = () => true, left = () => undefined }: LeaveWithClass = {},
): (event: AnimationCallbackEvent) => void {
  return ({ target, animationComplete }) => {
    const element = target as HTMLElement;
    if (!leaves(element)) {
      animationComplete();
      return;
    }
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
