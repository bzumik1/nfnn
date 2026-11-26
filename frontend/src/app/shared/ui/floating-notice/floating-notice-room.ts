import { HeldScroll, keepThePageEnd, SettlingPlacement } from '../../../core/layout/page-end';

const ROOM_CLASS = 'has-floating-notice';
const ROOM_HEIGHT = '--floating-notice-height';
const FOCUS_CATCHER = '[tabindex="-1"]:not(button, a[href], input, select, textarea, [role])';
const barsShown = new WeakMap<Document, HTMLElement[]>();

function shownBars(document: Document): HTMLElement[] {
  return (barsShown.get(document) ?? []).filter((shown) => shown.isConnected);
}

function keepRoomForLatest(document: Document, bars: HTMLElement[]): void {
  const root = document.documentElement;
  barsShown.set(document, bars);
  const latest = bars.at(-1);
  if (latest) {
    root.classList.add(ROOM_CLASS);
    root.style.setProperty(ROOM_HEIGHT, `${latest.offsetHeight}px`);
    return;
  }
  root.classList.remove(ROOM_CLASS);
  root.style.removeProperty(ROOM_HEIGHT);
}

export function keepRoomForFloatingNotice(
  document: Document,
  bar: HTMLElement,
  scrollHold: HeldScroll,
  placement: SettlingPlacement,
): () => void {
  const measure = () => {
    const bars = shownBars(document);
    if (bars.at(-1) === bar) {
      keepRoomForLatest(document, bars);
    }
  };
  const view = document.defaultView;
  const observer = view?.ResizeObserver ? new view.ResizeObserver(measure) : null;
  const visibleBandTop = (focused: Element) =>
    (parseFloat(view?.getComputedStyle(document.documentElement).scrollPaddingTop ?? '0') || 0) +
    (parseFloat(view?.getComputedStyle(focused).scrollMarginTop ?? '0') || 0);
  const scrollAboveBar = (focused: Element) => {
    const box = focused.getBoundingClientRect();
    const hidden = box.bottom - bar.getBoundingClientRect().top;
    if (hidden <= 0) {
      return;
    }
    const gap = parseFloat(view?.getComputedStyle(bar).bottom ?? '0') || 0;
    const by = Math.min(hidden + gap, box.top - visibleBandTop(focused));
    if (by > 0) {
      view?.scrollBy({ top: by, behavior: 'instant' });
    }
  };
  const mayHideUnderBar = (focused: unknown): focused is Element =>
    focused instanceof Element &&
    focused !== document.body &&
    !focused.matches(FOCUS_CATCHER) &&
    !bar.contains(focused) &&
    focused.closest('dialog[open]') === null;
  const uncover = (event: FocusEvent) => {
    if (!mayHideUnderBar(event.target)) {
      return;
    }
    view?.requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (mayHideUnderBar(focused)) {
        scrollAboveBar(focused);
      }
    });
  };
  keepThePageEnd(view, scrollHold, placement, () =>
    keepRoomForLatest(document, [...shownBars(document).filter((shown) => shown !== bar), bar]),
  );
  observer?.observe(bar);
  document.addEventListener('focusin', uncover);
  return () => {
    observer?.disconnect();
    document.removeEventListener('focusin', uncover);
    keepRoomForLatest(
      document,
      shownBars(document).filter((shown) => shown !== bar),
    );
  };
}
