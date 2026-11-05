const ROOM_HEIGHT = '--tab-bar-rendered-height';
const barsShown = new WeakMap<Document, HTMLElement[]>();

function shownBars(document: Document): HTMLElement[] {
  return (barsShown.get(document) ?? []).filter((shown) => shown.isConnected);
}

function keepRoomForLatest(document: Document, bars: HTMLElement[]): void {
  barsShown.set(document, bars);
  const root = document.documentElement;
  const latest = bars.at(-1);
  if (latest) {
    root.style.setProperty(ROOM_HEIGHT, `${latest.offsetHeight}px`);
  } else {
    root.style.removeProperty(ROOM_HEIGHT);
  }
}

export function keepRoomForTabBar(document: Document, bar: HTMLElement): () => void {
  const others = () => shownBars(document).filter((shown) => shown !== bar);
  const measure = () => {
    const bars = shownBars(document);
    if (bars.at(-1) === bar) {
      keepRoomForLatest(document, bars);
    }
  };
  const view = document.defaultView;
  const observer = view?.ResizeObserver ? new view.ResizeObserver(measure) : null;
  keepRoomForLatest(document, [...others(), bar]);
  observer?.observe(bar);
  return () => {
    observer?.disconnect();
    keepRoomForLatest(document, others());
  };
}
