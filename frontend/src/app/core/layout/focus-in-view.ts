export interface ViewBand {
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

export function liesInView(target: Element): boolean {
  const band = viewBand(target);
  const box = target.getBoundingClientRect();
  return box.bottom > band.top && box.top < band.bottom;
}

export function viewBand(target: Element): ViewBand {
  const view = target.ownerDocument.defaultView;
  if (view === null) {
    return { top: Number.NEGATIVE_INFINITY, bottom: Number.POSITIVE_INFINITY };
  }
  const { body, documentElement } = target.ownerDocument;
  const pixels = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const paddedBy = (scroller: Element, edges: ViewBand): ViewBand => {
    const style = view.getComputedStyle(scroller);
    return {
      top: edges.top + pixels(style.scrollPaddingTop),
      bottom: edges.bottom - pixels(style.scrollPaddingBottom),
    };
  };
  const scrollerAround = (element: Element): Element | null => {
    for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
      if (parent === documentElement) {
        return null;
      }
      const overflow = view.getComputedStyle(parent).overflowY;
      if (parent !== body && (overflow === 'auto' || overflow === 'scroll')) {
        return parent;
      }
    }
    return null;
  };
  const inPageBanner = (): boolean => {
    const header = target.closest('header');
    return (
      header !== null &&
      header.parentElement?.closest('main, article, section, aside, nav, dialog') == null
    );
  };
  const inFixedLayer = (): boolean => {
    for (let element: Element | null = target; element; element = element.parentElement) {
      const position = view.getComputedStyle(element).position;
      if (position === 'fixed' || position === 'sticky') {
        return true;
      }
    }
    return false;
  };
  const whole: ViewBand = { top: 0, bottom: view.innerHeight };
  const underPageChrome = target.closest('dialog') === null && !inPageBanner() && !inFixedLayer();
  let band = underPageChrome ? paddedBy(documentElement, whole) : whole;
  for (let scroller = scrollerAround(target); scroller; scroller = scrollerAround(scroller)) {
    const inner = paddedBy(scroller, scroller.getBoundingClientRect());
    band = { top: Math.max(band.top, inner.top), bottom: Math.min(band.bottom, inner.bottom) };
  }
  return band;
}
