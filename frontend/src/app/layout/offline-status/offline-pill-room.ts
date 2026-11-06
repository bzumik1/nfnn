const ROOM_CLASS = 'is-offline';
const ROOM_HEIGHT = '--offline-pill-height';

export function keepRoomForOfflinePill(document: Document, pill: HTMLElement): () => void {
  const root = document.documentElement;
  const measure = () => root.style.setProperty(ROOM_HEIGHT, `${pill.offsetHeight}px`);
  const view = document.defaultView;
  const observer = view?.ResizeObserver ? new view.ResizeObserver(measure) : null;
  root.classList.add(ROOM_CLASS);
  measure();
  observer?.observe(pill);
  return () => {
    observer?.disconnect();
    root.classList.remove(ROOM_CLASS);
    root.style.removeProperty(ROOM_HEIGHT);
  };
}
