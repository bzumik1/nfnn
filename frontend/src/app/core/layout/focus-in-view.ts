export interface ViewBand {
  readonly top: number;
  readonly bottom: number;
}

export function focusInView(target: HTMLElement, options: FocusOptions = {}): boolean {
  if (!focusWithoutScroll(target, options)) {
    return false;
  }
  if (!liesWhollyInView(target)) {
    bringWhollyIntoView(target);
  }
  return true;
}

function bringWhollyIntoView(target: HTMLElement): void {
  const document = target.ownerDocument;
  const view = document.defaultView;
  if (view !== null && liesInPageBanner(target) && scrollerAround(view, target) === null) {
    (document.scrollingElement ?? document.documentElement).scrollBy({
      top: shortfallOf(target),
      behavior: 'instant',
    });
    return;
  }
  target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

function shortfallOf(target: Element): number {
  const band = viewBand(target);
  const box = target.getBoundingClientRect();
  const { top, bottom } = scrollMarginsOf(target);
  const above = box.top - top - band.top;
  const below = box.bottom + bottom - band.bottom;
  return above < 0 ? above : Math.max(0, below);
}

function scrollMarginsOf(target: Element): ViewBand {
  const margins = target.ownerDocument.defaultView?.getComputedStyle(target);
  const reach = (value: string | undefined): number => Number.parseFloat(value ?? '') || 0;
  return { top: reach(margins?.scrollMarginTop), bottom: reach(margins?.scrollMarginBottom) };
}

export function focusWithoutScroll(target: HTMLElement, options: FocusOptions = {}): boolean {
  target.focus({ ...options, preventScroll: true });
  return target.ownerDocument.activeElement === target;
}

export function bringIntoView(target: Element): boolean {
  if (liesInView(target)) {
    return false;
  }
  target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  return true;
}

export function motionsMoving(target: Element): Animation[] {
  const motions: Animation[] = [];
  for (let element: Element | null = target; element !== null; element = element.parentElement) {
    motions.push(
      ...(element.getAnimations?.() ?? []).filter(
        (motion) =>
          motion.playState === 'running' && motion.effect?.getComputedTiming().endTime !== Infinity,
      ),
    );
  }
  return motions;
}

export function liesInView(target: Element): boolean {
  const band = viewBand(target);
  const box = target.getBoundingClientRect();
  return box.bottom > band.top && box.top < band.bottom;
}

export function liesWhollyInView(target: Element): boolean {
  const band = viewBand(target);
  const box = target.getBoundingClientRect();
  const margins = scrollMarginsOf(target);
  return box.top - margins.top >= band.top && box.bottom + margins.bottom <= band.bottom;
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
  const scrollerOf = (element: Element): Element | null => {
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
  for (let scroller = scrollerOf(target); scroller; scroller = scrollerOf(scroller)) {
    const inner = paddedBy(scroller, scroller.getBoundingClientRect());
    band = { top: Math.max(band.top, inner.top), bottom: Math.min(band.bottom, inner.bottom) };
  }
  return band;
}

export function scrollerAround(view: Window, element: Element): Element | null {
  const { body, documentElement } = element.ownerDocument;
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
}

function liesInPageBanner(target: Element): boolean {
  const header = target.closest('header');
  return (
    header !== null &&
    header.parentElement?.closest('main, article, section, aside, nav, dialog') == null
  );
}
