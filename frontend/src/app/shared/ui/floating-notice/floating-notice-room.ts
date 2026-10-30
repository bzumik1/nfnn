const ROOM_CLASS = 'has-floating-notice';
const ROOM_HEIGHT = '--floating-notice-height';

export function keepRoomForFloatingNotice(document: Document, bar: HTMLElement): () => void {
  const root = document.documentElement;
  const measure = () => root.style.setProperty(ROOM_HEIGHT, `${bar.offsetHeight}px`);
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
  measure();
  observer?.observe(bar);
  root.classList.add(ROOM_CLASS);
  document.addEventListener('focusin', uncover);
  return () => {
    observer?.disconnect();
    document.removeEventListener('focusin', uncover);
    root.classList.remove(ROOM_CLASS);
    root.style.removeProperty(ROOM_HEIGHT);
  };
}
