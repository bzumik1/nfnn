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
): () => void {
  if (within === null || !row.isConnected) {
    released();
    return () => undefined;
  }
  const watch = new MutationObserver(() => {
    if (!row.isConnected) {
      watch.disconnect();
      released();
    }
  });
  watch.observe(within, { childList: true, subtree: true });
  return () => watch.disconnect();
}

export interface RevealInPlace {
  readonly row: HTMLElement | null;
  readonly from: HTMLElement;
  readonly to: HTMLElement | null;
}

interface PendingReveal {
  readonly row: HTMLElement;
  focused: HTMLElement | null;
  reveal: (() => void) | null;
  gone: boolean;
  stopWatching: () => void;
}

interface VisibleBand {
  readonly top: number;
  readonly bottom: number;
}

export class FocusAfterRowLeaves {
  private pending: PendingReveal | null = null;

  constructor(
    private readonly document: Document,
    private readonly watched: () => Node | null,
  ) {}

  rowLeaving(row: HTMLElement | null): void {
    this.forget();
    if (row !== null) {
      this.pending = {
        row,
        focused: null,
        reveal: null,
        gone: false,
        stopWatching: () => undefined,
      };
    }
  }

  moveFocus(row: HTMLElement | null, control: HTMLElement): void {
    const pending = this.pending;
    if (pending === null || pending.row !== row) {
      control.focus();
      return;
    }
    control.focus({ preventScroll: true });
    pending.focused = control;
    pending.reveal = () => this.scrollIntoViewFitting(control);
    this.revealOnceRowGone(pending);
  }

  focusInPlace(control: HTMLElement, reveal: RevealInPlace | null = null): void {
    control.focus({ preventScroll: true });
    const pending = this.pending;
    if (reveal === null || pending === null || pending.row !== reveal.row) {
      this.forget();
      return;
    }
    pending.focused = control;
    pending.reveal = () => this.revealOnceSettled(control, reveal.from, reveal.to);
    this.revealOnceRowGone(pending);
  }

  rowLeaveEnded(row: HTMLElement): void {
    const pending = this.pending;
    if (pending === null || pending.row !== row) {
      return;
    }
    pending.stopWatching();
    pending.stopWatching = afterRemoval(
      row,
      () => {
        pending.gone = true;
        this.revealOnceRowGone(pending);
      },
      this.watched(),
    );
  }

  keepInViewOnceSettled(
    control: HTMLElement,
    motions: readonly Animation[],
    pressedByPointer: boolean,
  ): void {
    this.afterMotions(motions, () => {
      if (
        this.document.activeElement !== control ||
        !control.isConnected ||
        (pressedByPointer && this.partlyInView(control))
      ) {
        return;
      }
      this.scrollIntoViewFitting(control);
    });
  }

  forget(): void {
    this.pending?.stopWatching();
    this.pending = null;
  }

  private revealOnceRowGone(pending: PendingReveal): void {
    if (this.pending !== pending || !pending.gone || pending.focused === null) {
      return;
    }
    this.pending = null;
    if (this.document.activeElement === pending.focused) {
      pending.reveal?.();
    }
  }

  private scrollIntoViewFitting(control: HTMLElement): void {
    control.scrollIntoView?.({
      block: this.fitsItsScroller(control) ? 'nearest' : 'start',
      behavior: this.behavior(),
    });
  }

  private revealOnceSettled(focused: HTMLElement, from: HTMLElement, to: HTMLElement | null): void {
    const motions = [from, to].flatMap((element) => element?.getAnimations?.() ?? []);
    if (motions.length === 0) {
      this.revealSpan(from, to);
      return;
    }
    this.afterMotions(motions, () => {
      if (this.document.activeElement === focused && from.isConnected) {
        this.revealSpan(from, to);
      }
    });
  }

  private afterMotions(motions: readonly Animation[], settled: () => void): void {
    if (motions.length === 0) {
      settled();
      return;
    }
    const longest = Math.max(
      0,
      ...motions.map((motion) => Number(motion.effect?.getComputedTiming().endTime ?? 0)),
    );
    let done = false;
    const finish = (): void => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(fallback);
      settled();
    };
    void Promise.allSettled(motions.map((motion) => motion.finished)).then(finish);
    const fallback = setTimeout(finish, (Number.isFinite(longest) ? longest : 0) + LEAVE_GRACE_MS);
  }

  private revealSpan(from: HTMLElement, to: HTMLElement | null): void {
    const view = this.document.defaultView;
    const last = to ?? from;
    if (view === null) {
      from.scrollIntoView?.({ block: 'nearest', behavior: this.behavior() });
      return;
    }
    const band = this.visibleBand(this.scrollerOf(from, view), view);
    const top =
      from.getBoundingClientRect().top -
      (parseFloat(view.getComputedStyle(from).scrollMarginTop) || 0);
    const bottom =
      last.getBoundingClientRect().bottom +
      (parseFloat(view.getComputedStyle(last).scrollMarginBottom) || 0);
    if (bottom - top > band.bottom - band.top) {
      from.scrollIntoView?.({ block: 'nearest', behavior: this.behavior() });
    } else if (top < band.top) {
      from.scrollIntoView?.({ block: 'start', behavior: this.behavior() });
    } else if (bottom > band.bottom) {
      last.scrollIntoView?.({ block: 'end', behavior: this.behavior() });
    }
  }

  private behavior(): ScrollBehavior {
    const reduced =
      this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    return reduced ? 'instant' : 'smooth';
  }

  private partlyInView(control: HTMLElement): boolean {
    const view = this.document.defaultView;
    if (view === null) {
      return true;
    }
    const band = this.visibleBand(this.scrollerOf(control, view), view);
    const box = control.getBoundingClientRect();
    return box.bottom > band.top && box.top < band.bottom;
  }

  private fitsItsScroller(control: HTMLElement): boolean {
    const view = this.document.defaultView;
    if (view === null) {
      return true;
    }
    const band = this.visibleBand(this.scrollerOf(control, view), view);
    const margin = view.getComputedStyle(control);
    const needed =
      control.getBoundingClientRect().height +
      (parseFloat(margin.scrollMarginTop) || 0) +
      (parseFloat(margin.scrollMarginBottom) || 0);
    return needed <= band.bottom - band.top;
  }

  private visibleBand(scroller: HTMLElement, view: Window): VisibleBand {
    const padding = view.getComputedStyle(scroller);
    const paddingTop = parseFloat(padding.scrollPaddingTop) || 0;
    const paddingBottom = parseFloat(padding.scrollPaddingBottom) || 0;
    if (scroller === this.document.documentElement) {
      return { top: paddingTop, bottom: view.innerHeight - paddingBottom };
    }
    const top = scroller.getBoundingClientRect().top + scroller.clientTop;
    return { top: top + paddingTop, bottom: top + scroller.clientHeight - paddingBottom };
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
