const ROOM_HEIGHT = '--tab-bar-rendered-height';
const barsShown = new WeakMap<Document, HTMLElement[]>();
const lastRoom = new WeakMap<Document, string>();

function shownBars(document: Document): HTMLElement[] {
  return (barsShown.get(document) ?? []).filter((shown) => shown.isConnected);
}

function writeRoom(document: Document, room: string | null): void {
  const style = document.documentElement.style;
  if (room === null) {
    style.removeProperty(ROOM_HEIGHT);
  } else if (style.getPropertyValue(ROOM_HEIGHT) !== room) {
    style.setProperty(ROOM_HEIGHT, room);
  }
}

function keepRoomForLatest(document: Document, bars: HTMLElement[]): void {
  barsShown.set(document, bars);
  const latest = bars.at(-1);
  if (latest) {
    const room = `${latest.offsetHeight}px`;
    lastRoom.set(document, room);
    writeRoom(document, room);
  } else {
    writeRoom(document, null);
  }
}

export function reserveRoomForTabBar(document: Document): () => void {
  const room = lastRoom.get(document);
  if (room !== undefined && shownBars(document).length === 0) {
    writeRoom(document, room);
  }
  return () => keepRoomForLatest(document, shownBars(document));
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
