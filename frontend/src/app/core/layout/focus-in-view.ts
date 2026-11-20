const SCROLLING = new Set(['auto', 'scroll']);
const SECTIONING = 'main, article, section, aside, nav, dialog';

interface Band {
  readonly top: number;
  readonly bottom: number;
}

export function focusInView(target: HTMLElement, options: FocusOptions = {}): boolean {
  target.focus({ ...options, preventScroll: true });
  if (target.ownerDocument.activeElement !== target) {
    return false;
  }
  if (!liesInView(target)) {
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  return true;
}

export function liesInView(target: HTMLElement): boolean {
  const view = target.ownerDocument.defaultView;
  if (view === null) {
    return true;
  }
  let band: Band = underPageChrome(target, view)
    ? paddedBy(view, target.ownerDocument.documentElement, { top: 0, bottom: view.innerHeight })
    : { top: 0, bottom: view.innerHeight };
  let scroller = scrollerAround(target, view);
  while (scroller !== null) {
    band = narrowed(band, paddedBy(view, scroller, scroller.getBoundingClientRect()));
    scroller = scrollerAround(scroller, view);
  }
  const box = target.getBoundingClientRect();
  return box.bottom > band.top && box.top < band.bottom;
}

function underPageChrome(target: HTMLElement, view: Window): boolean {
  return target.closest('dialog') === null && !inPageBanner(target) && !inFixedLayer(target, view);
}

function inPageBanner(target: HTMLElement): boolean {
  const header = target.closest('header');
  return header !== null && header.parentElement?.closest(SECTIONING) == null;
}

function inFixedLayer(target: HTMLElement, view: Window): boolean {
  for (let element: HTMLElement | null = target; element; element = element.parentElement) {
    const position = view.getComputedStyle(element).position;
    if (position === 'fixed' || position === 'sticky') {
      return true;
    }
  }
  return false;
}

function scrollerAround(element: HTMLElement, view: Window): HTMLElement | null {
  const { body, documentElement } = element.ownerDocument;
  let parent = element.parentElement;
  while (parent !== null && parent !== documentElement) {
    if (parent !== body && SCROLLING.has(view.getComputedStyle(parent).overflowY)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function paddedBy(view: Window, scroller: HTMLElement, edges: Band): Band {
  const style = view.getComputedStyle(scroller);
  return {
    top: edges.top + pixels(style.scrollPaddingTop),
    bottom: edges.bottom - pixels(style.scrollPaddingBottom),
  };
}

function narrowed(outer: Band, inner: Band): Band {
  return { top: Math.max(outer.top, inner.top), bottom: Math.min(outer.bottom, inner.bottom) };
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
