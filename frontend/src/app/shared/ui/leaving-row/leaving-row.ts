import { AnimationCallbackEvent } from '@angular/core';
import { LONE_MODIFIERS } from '../../../core/input/input-modality';

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
  readonly neighbour: () => HTMLElement | null;
  focused: HTMLElement | null;
  reveal: (() => void) | null;
  gone: boolean;
  holds: boolean;
  view: Window | null;
  judged: HTMLElement | null;
  follower: HTMLElement | null;
  stoodAt: number;
  cancelled: boolean;
  scrolledWithoutTheDonor: boolean;
  stopWatching: () => void;
  stopNoticingScrolls: () => void;
  stopHolding: () => void;
  stopSettling: () => void;
}

const VISITOR_MOVES = ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'] as const;
const VISITOR_MOVE_LISTENING: AddEventListenerOptions = { capture: true, passive: true };
const SUBPIXEL_PX = 0.5;

interface VisibleBand {
  readonly top: number;
  readonly bottom: number;
}

export class FocusAfterRowLeaves {
  private pending: PendingReveal | null = null;
  private stopHolding: () => void = () => undefined;
  private stopKeepingInView: () => void = () => undefined;
  private cancelledRow: HTMLElement | null = null;

  constructor(
    private readonly document: Document,
    private readonly watched: () => Node | null,
  ) {}

  rowLeaving(row: HTMLElement | null, neighbour: () => HTMLElement | null = () => null): void {
    this.forget();
    this.cancelledRow = null;
    if (row !== null) {
      const pending: PendingReveal = {
        row,
        neighbour,
        focused: null,
        reveal: null,
        gone: false,
        holds: true,
        view: null,
        judged: null,
        follower: null,
        stoodAt: 0,
        cancelled: false,
        scrolledWithoutTheDonor: false,
        stopWatching: () => undefined,
        stopNoticingScrolls: () => undefined,
        stopHolding: () => undefined,
        stopSettling: () => undefined,
      };
      this.pending = pending;
      pending.stopNoticingScrolls = this.noticeScrollsWithoutTheDonor(pending);
      pending.stopHolding = this.holdBelowTheTop(pending);
      this.stopHolding = () => {
        pending.stopSettling();
        pending.stopHolding();
      };
      const nearest = neighbour();
      if (nearest !== null) {
        this.judge(pending, nearest);
      }
      this.watchUntilGone(pending);
    }
  }

  moveFocus(row: HTMLElement | null, control: HTMLElement): void {
    const pending = this.pending;
    if (pending === null || pending.row !== row) {
      if (row !== null && row === this.cancelledRow) {
        control.focus({ preventScroll: true });
      } else {
        control.focus();
      }
      return;
    }
    control.focus({ preventScroll: true });
    pending.focused = control;
    this.judge(pending, control);
    pending.reveal = () => {
      pending.stopNoticingScrolls();
      this.scrollIntoViewFitting(control);
    };
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
    pending.holds = false;
    pending.reveal = () => this.revealOnceSettled(pending, control, reveal.from, reveal.to);
    this.revealOnceRowGone(pending);
  }

  rowLeaveEnded(row: HTMLElement): void {
    const pending = this.pending;
    if (pending === null || pending.row !== row) {
      return;
    }
    this.watchUntilGone(pending);
  }

  keepInViewOnceSettled(
    control: HTMLElement,
    motions: readonly Animation[],
    pressedByPointer: boolean,
  ): void {
    let moved = false;
    const stopListening = this.untilVisitorMoves(() => (moved = true));
    this.afterMotions(motions, () => {
      stopListening();
      if (
        moved ||
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
    this.pending?.stopNoticingScrolls();
    this.stopHolding();
    this.stopHolding = () => undefined;
    this.pending = null;
    this.stopKeepingInView();
  }

  private watchUntilGone(pending: PendingReveal): void {
    if (pending.gone) {
      return;
    }
    pending.stopWatching();
    const watched = this.watched();
    pending.stopWatching = afterRemoval(
      pending.row,
      () => {
        pending.gone = true;
        pending.stopSettling = this.afterMotions(this.motionsWithin(watched), () =>
          this.afterTheNextFrameLaidOut(() => pending.stopHolding()),
        );
        this.revealOnceRowGone(pending);
      },
      watched,
    );
  }

  private holdBelowTheTop(pending: PendingReveal): () => void {
    const view = this.document.defaultView;
    const Observer = view?.ResizeObserver;
    if (view === null || view === undefined || Observer === undefined) {
      return () => undefined;
    }
    const observer = asksForLessMotion(this.document)
      ? this.watchTheClose(pending, view, Observer)
      : null;
    let stopped = false;
    const stop = (): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      observer?.disconnect();
      stopListening();
    };
    const stopListening = this.untilVisitorMoves(() => {
      pending.cancelled = true;
      this.cancelledRow = pending.row;
      stop();
      if (this.pending === pending) {
        this.forget();
      }
    });
    return stop;
  }

  private watchTheClose(
    pending: PendingReveal,
    view: Window,
    Observer: typeof ResizeObserver,
  ): ResizeObserver {
    pending.view = view;
    const scroller = this.scrollerOf(pending.row, view);
    const observer = new Observer(() => this.keepBelowTheTop(pending, view));
    observer.observe(pending.row);
    for (let node = pending.row.parentElement; node !== null; node = node.parentElement) {
      observer.observe(node);
      if (node === scroller || node === this.document.body) {
        break;
      }
    }
    return observer;
  }

  private untilVisitorMoves(moved: () => void): () => void {
    let listening = true;
    const heard = (event: Event): void => {
      if (event instanceof KeyboardEvent && LONE_MODIFIERS.has(event.key)) {
        return;
      }
      stop();
      moved();
    };
    const stop = (): void => {
      if (!listening) {
        return;
      }
      listening = false;
      for (const type of VISITOR_MOVES) {
        this.document.removeEventListener(type, heard, VISITOR_MOVE_LISTENING);
      }
    };
    for (const type of VISITOR_MOVES) {
      this.document.addEventListener(type, heard, VISITOR_MOVE_LISTENING);
    }
    return stop;
  }

  private keepBelowTheTop(pending: PendingReveal, view: Window): void {
    const held = pending.focused ?? pending.neighbour();
    if (
      !pending.holds ||
      held === null ||
      !held.isConnected ||
      (pending.focused !== null && this.document.activeElement !== pending.focused)
    ) {
      return;
    }
    this.judge(pending, held);
    if (pending.follower !== held) {
      return;
    }
    const scroller = this.scrollerOf(held, view);
    const holdAt = Math.min(this.floorOf(held, scroller, view), pending.stoodAt);
    const above = holdAt - held.getBoundingClientRect().top;
    if (above <= SUBPIXEL_PX) {
      return;
    }
    const back: ScrollToOptions = { top: -above, behavior: 'instant' };
    if (scroller === this.document.documentElement) {
      view.scrollBy(back);
    } else {
      scroller.scrollBy(back);
    }
  }

  private judge(pending: PendingReveal, control: HTMLElement): void {
    if (pending.judged === control) {
      return;
    }
    pending.judged = control;
    pending.follower = null;
    const view = pending.view;
    if (view === null || !pending.row.isConnected || !followsRow(pending.row, control)) {
      return;
    }
    const scroller = this.scrollerOf(control, view);
    const top = control.getBoundingClientRect().top;
    if (top < scrollerTopOf(this.document, scroller) - SUBPIXEL_PX) {
      return;
    }
    pending.follower = control;
    pending.stoodAt = top;
  }

  private floorOf(control: HTMLElement, scroller: HTMLElement, view: Window): number {
    return (
      this.visibleBand(scroller, view).top +
      (parseFloat(view.getComputedStyle(control).scrollMarginTop) || 0)
    );
  }

  private afterTheNextFrameLaidOut(then: () => void): void {
    const view = this.document.defaultView;
    if (typeof view?.requestAnimationFrame !== 'function') {
      then();
      return;
    }
    view.requestAnimationFrame(() => view.requestAnimationFrame(() => then()));
  }

  private motionsWithin(watched: Node | null): Animation[] {
    return watched instanceof Element ? (watched.getAnimations?.({ subtree: true }) ?? []) : [];
  }

  private revealOnceRowGone(pending: PendingReveal): void {
    if (this.pending !== pending || !pending.gone || pending.focused === null) {
      return;
    }
    this.pending = null;
    if (this.document.activeElement === pending.focused) {
      pending.reveal?.();
    } else {
      pending.stopNoticingScrolls();
    }
  }

  private scrollIntoViewFitting(control: HTMLElement): void {
    scrollIntoViewFitting(control, this.document);
  }

  private revealOnceSettled(
    pending: PendingReveal,
    focused: HTMLElement,
    from: HTMLElement,
    to: HTMLElement | null,
  ): void {
    const motions = [from, to].flatMap((element) => element?.getAnimations?.() ?? []);
    if (motions.length === 0) {
      pending.stopNoticingScrolls();
      this.revealSpan(from, to);
      this.keepInViewWhileSettling(pending, focused, from, to);
      return;
    }
    this.afterMotions(motions, () => {
      pending.stopNoticingScrolls();
      if (!pending.cancelled && this.document.activeElement === focused && from.isConnected) {
        this.revealSpan(from, to);
        this.keepInViewWhileSettling(pending, focused, from, to);
      }
    });
  }

  private noticeScrollsWithoutTheDonor(pending: PendingReveal): () => void {
    const view = this.document.defaultView;
    if (typeof view?.addEventListener !== 'function') {
      return () => undefined;
    }
    const noticed = (): void => {
      pending.scrolledWithoutTheDonor = true;
    };
    view.addEventListener('scroll', noticed, VISITOR_MOVE_LISTENING);
    return () => view.removeEventListener('scroll', noticed, VISITOR_MOVE_LISTENING);
  }

  private keepInViewWhileSettling(
    pending: PendingReveal,
    focused: HTMLElement,
    from: HTMLElement,
    to: HTMLElement | null,
  ): void {
    this.stopKeepingInView();
    const view = this.document.defaultView;
    const Observer = view?.ResizeObserver;
    if (
      view === null ||
      view === undefined ||
      Observer === undefined ||
      pending.scrolledWithoutTheDonor ||
      !asksForLessMotion(this.document)
    ) {
      return;
    }
    let keeping = true;
    const recheck = (): void => {
      if (keeping && this.document.activeElement === focused && from.isConnected) {
        this.revealSpan(from, to);
      } else {
        stop();
      }
    };
    const sizes = new Observer(recheck);
    const stopListening = this.untilVisitorMoves(() => stop());
    const cancelSettling = this.later(KEPT_IN_VIEW_WHILE_SETTLING_MS, () => stop());
    const stop = (): void => {
      if (!keeping) {
        return;
      }
      keeping = false;
      sizes.disconnect();
      stopListening();
      cancelSettling();
      view.removeEventListener('scroll', recheck, VISITOR_MOVE_LISTENING);
      if (this.stopKeepingInView === stop) {
        this.stopKeepingInView = () => undefined;
      }
    };
    sizes.observe(this.document.body);
    const scroller = this.scrollerOf(from, view);
    if (scroller !== this.document.documentElement) {
      sizes.observe(scroller);
      for (const content of Array.from(scroller.children)) {
        sizes.observe(content);
      }
    }
    view.addEventListener('scroll', recheck, VISITOR_MOVE_LISTENING);
    this.stopKeepingInView = stop;
  }

  private afterMotions(motions: readonly Animation[], settled: () => void): () => void {
    if (motions.length === 0) {
      settled();
      return () => undefined;
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
      cancelFallback();
      settled();
    };
    void Promise.allSettled(motions.map((motion) => motion.finished)).then(finish);
    const cancelFallback = this.later(
      (Number.isFinite(longest) ? longest : 0) + LEAVE_GRACE_MS,
      finish,
    );
    return () => {
      done = true;
      cancelFallback();
    };
  }

  private later(delay: number, then: () => void): () => void {
    const view = this.document.defaultView;
    if (typeof view?.setTimeout === 'function') {
      const timer = view.setTimeout(then, delay);
      return () => view.clearTimeout(timer);
    }
    const timer = setTimeout(then, delay);
    return () => clearTimeout(timer);
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
  return asksForLessMotion(document) ? 'instant' : 'smooth';
}

function asksForLessMotion(document: Document): boolean {
  return document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
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
  const top = scrollerTopOf(document, scroller);
  if (scroller === document.documentElement) {
    return { top: top + paddingTop, bottom: view.innerHeight - paddingBottom };
  }
  return { top: top + paddingTop, bottom: top + scroller.clientHeight - paddingBottom };
}

function scrollerTopOf(document: Document, scroller: HTMLElement): number {
  return scroller === document.documentElement
    ? 0
    : scroller.getBoundingClientRect().top + scroller.clientTop;
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
