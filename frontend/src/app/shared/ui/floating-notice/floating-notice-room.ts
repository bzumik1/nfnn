const ROOM_CLASS = 'has-floating-notice';
const ROOM_HEIGHT = '--floating-notice-height';
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

export function keepRoomForFloatingNotice(document: Document, bar: HTMLElement): () => void {
  const measure = () => {
    const bars = shownBars(document);
    if (bars.at(-1) === bar) {
      keepRoomForLatest(document, bars);
    }
  };
  const view = document.defaultView;
  const observer = view?.ResizeObserver ? new view.ResizeObserver(measure) : null;
  const scrollAboveBar = (focused: Element) => {
    const hidden = focused.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
    if (hidden > 0) {
      const gap = parseFloat(view?.getComputedStyle(bar).bottom ?? '0') || 0;
      view?.scrollBy({ top: hidden + gap, behavior: 'instant' });
    }
  };
  const uncover = (event: FocusEvent) => {
    const focused = event.target;
    if (!(focused instanceof Element) || bar.contains(focused) || focused.closest('dialog[open]')) {
      return;
    }
    view?.requestAnimationFrame(() => scrollAboveBar(focused));
  };
  keepRoomForLatest(document, [...shownBars(document).filter((shown) => shown !== bar), bar]);
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
