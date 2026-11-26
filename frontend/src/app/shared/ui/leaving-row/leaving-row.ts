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
  private stopKeepingInView: () => void = () => undefined;

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
    this.stopKeepingInView();
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
    scrollIntoViewFitting(control, this.document);
  }

  private revealOnceSettled(focused: HTMLElement, from: HTMLElement, to: HTMLElement | null): void {
    const motions = [from, to].flatMap((element) => element?.getAnimations?.() ?? []);
    if (motions.length === 0) {
      this.revealSpan(from, to);
      this.keepInViewWhileSettling(focused, from, to);
      return;
    }
    this.afterMotions(motions, () => {
      if (this.document.activeElement === focused && from.isConnected) {
        this.revealSpan(from, to);
        this.keepInViewWhileSettling(focused, from, to);
      }
    });
  }

  private keepInViewWhileSettling(
    focused: HTMLElement,
    from: HTMLElement,
    to: HTMLElement | null,
  ): void {
    this.stopKeepingInView();
    const view = this.document.defaultView;
    if (view === null || view.ResizeObserver === undefined) {
      return;
    }
    const recheck = (): void => {
      if (this.document.activeElement === focused && from.isConnected) {
        this.revealSpan(from, to);
      } else {
        stop();
      }
    };
    const sizes = new view.ResizeObserver(recheck);
    const settled = view.setTimeout(() => stop(), KEPT_IN_VIEW_WHILE_SETTLING_MS);
    const stop = (): void => {
      sizes.disconnect();
      view.clearTimeout(settled);
      view.removeEventListener('scroll', recheck, KEEPING_IN_VIEW);
      for (const type of VISITOR_MOVES) {
        view.removeEventListener(type, stop, KEEPING_IN_VIEW);
      }
      if (this.stopKeepingInView === stop) {
        this.stopKeepingInView = () => undefined;
      }
    };
    sizes.observe(this.document.body);
    view.addEventListener('scroll', recheck, KEEPING_IN_VIEW);
    for (const type of VISITOR_MOVES) {
      view.addEventListener(type, stop, KEEPING_IN_VIEW);
    }
    this.stopKeepingInView = stop;
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
    return scrollBehaviorOf(this.document);
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

  private visibleBand(scroller: HTMLElement, view: Window): VisibleBand {
    return visibleBandOf(this.document, scroller, view);
  }

  private scrollerOf(control: HTMLElement, view: Window): HTMLElement {
    return scrollerOf(this.document, control, view);
  }
}

export function scrollIntoViewFitting(
  control: HTMLElement,
  document: Document = control.ownerDocument,
): void {
  control.scrollIntoView?.({
    block: fitsItsScroller(document, control) ? 'nearest' : 'start',
    behavior: scrollBehaviorOf(document),
  });
}

function scrollBehaviorOf(document: Document): ScrollBehavior {
  const reduced =
    document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  return reduced ? 'instant' : 'smooth';
}

function fitsItsScroller(document: Document, control: HTMLElement): boolean {
  const view = document.defaultView;
  if (view === null) {
    return true;
  }
  const band = visibleBandOf(document, scrollerOf(document, control, view), view);
  const margin = view.getComputedStyle(control);
  const needed =
    control.getBoundingClientRect().height +
    (parseFloat(margin.scrollMarginTop) || 0) +
    (parseFloat(margin.scrollMarginBottom) || 0);
  return needed <= band.bottom - band.top;
}

function visibleBandOf(document: Document, scroller: HTMLElement, view: Window): VisibleBand {
  const padding = view.getComputedStyle(scroller);
  const paddingTop = parseFloat(padding.scrollPaddingTop) || 0;
  const paddingBottom = parseFloat(padding.scrollPaddingBottom) || 0;
  if (scroller === document.documentElement) {
    return { top: paddingTop, bottom: view.innerHeight - paddingBottom };
  }
  const top = scroller.getBoundingClientRect().top + scroller.clientTop;
  return { top: top + paddingTop, bottom: top + scroller.clientHeight - paddingBottom };
}

function scrollerOf(document: Document, control: HTMLElement, view: Window): HTMLElement {
  for (
    let node = control.parentElement;
    node !== null && node !== document.body;
    node = node.parentElement
  ) {
    const overflow = view.getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') {
      return node;
    }
  }
  return document.documentElement;
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
const KEPT_IN_VIEW_WHILE_SETTLING_MS = 1000;
const VISITOR_MOVES = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
const KEEPING_IN_VIEW: AddEventListenerOptions = { capture: true, passive: true };
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
