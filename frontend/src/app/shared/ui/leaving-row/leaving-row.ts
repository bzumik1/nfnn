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

export function afterRemoval(
  row: Element,
  released: () => void,
  within: Node | null = row.parentNode,
): void {
  if (within === null || !row.isConnected) {
    released();
    return;
  }
  const watch = new MutationObserver(() => {
    if (!row.isConnected) {
      watch.disconnect();
      released();
    }
  });
  watch.observe(within, { childList: true, subtree: true });
}

export class FocusAfterRowLeaves {
  private pending: { row: HTMLElement; focused: HTMLElement | null; gone: boolean } | null = null;

  constructor(
    private readonly document: Document,
    private readonly watched: () => Node | null,
  ) {}

  rowLeaving(row: HTMLElement | null): void {
    this.pending = row === null ? null : { row, focused: null, gone: false };
  }

  moveFocus(row: HTMLElement | null, control: HTMLElement): void {
    control.focus();
    const pending = this.pending;
    if (pending !== null && pending.row === row) {
      pending.focused = control;
      this.revealOnceRowGone(pending);
    }
  }

  focusInPlace(control: HTMLElement): void {
    this.pending = null;
    control.focus({ preventScroll: true });
  }

  rowLeaveEnded(row: HTMLElement): void {
    const pending = this.pending;
    if (pending === null || pending.row !== row) {
      return;
    }
    afterRemoval(
      row,
      () => {
        pending.gone = true;
        this.revealOnceRowGone(pending);
      },
      this.watched(),
    );
  }

  forget(): void {
    this.pending = null;
  }

  private revealOnceRowGone(pending: { focused: HTMLElement | null; gone: boolean }): void {
    if (this.pending !== pending || !pending.gone || pending.focused === null) {
      return;
    }
    this.pending = null;
    this.scrollIntoViewIfFocused(pending.focused);
  }

  private scrollIntoViewIfFocused(focused: HTMLElement): void {
    if (this.document.activeElement !== focused) {
      return;
    }
    const reduced =
      this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    focused.scrollIntoView?.({
      block: this.fitsItsScroller(focused) ? 'nearest' : 'start',
      behavior: reduced ? 'instant' : 'smooth',
    });
  }

  private fitsItsScroller(control: HTMLElement): boolean {
    const view = this.document.defaultView;
    if (view === null) {
      return true;
    }
    const scroller = this.scrollerOf(control, view);
    const page = scroller === this.document.documentElement;
    const padding = view.getComputedStyle(scroller);
    const margin = view.getComputedStyle(control);
    const room =
      (page ? view.innerHeight : scroller.clientHeight) -
      (parseFloat(padding.scrollPaddingTop) || 0) -
      (parseFloat(padding.scrollPaddingBottom) || 0);
    const needed =
      control.getBoundingClientRect().height +
      (parseFloat(margin.scrollMarginTop) || 0) +
      (parseFloat(margin.scrollMarginBottom) || 0);
    return needed <= room;
  }

  private scrollerOf(control: HTMLElement, view: Window): HTMLElement {
    for (
      let node = control.parentElement;
      node !== null && node !== this.document.body;
      node = node.parentElement
    ) {
      const overflow = view.getComputedStyle(node).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') {
        return node;
      }
    }
    return this.document.documentElement;
  }
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
  readonly settling?: string;
}

const LEAVE_GRACE_MS = 300;
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
