export const SCROLLED_CLASS = 'app-header--scrolled';
export const SCROLL_EDGE_TONE = '--scroll-edge-tone';
export const SCROLL_EDGE_DARK = 'app-header--edge-dark';

const TRANSPARENT = /^transparent$|^rgba\(.*,\s*0\)$|\/\s*0\)$/;

export function followScrollEdge(document: Document, header: HTMLElement): () => void {
  const view = document.defaultView;
  if (view === null) {
    return () => undefined;
  }
  let frame = 0;
  const follow = (): void => {
    frame = 0;
    const scrolled = view.scrollY > 0;
    header.classList.toggle(SCROLLED_CLASS, scrolled);
    if (scrolled) {
      const tone = backgroundAt(document, view.innerWidth / 2, edgeBottom(view, header));
      if (tone !== null) {
        header.style.setProperty(SCROLL_EDGE_TONE, tone);
        header.classList.toggle(SCROLL_EDGE_DARK, isDark(tone));
      }
    }
  };
  const schedule = (): void => {
    if (frame === 0) {
      frame = view.requestAnimationFrame(follow);
    }
  };
  follow();
  view.addEventListener('scroll', schedule, { passive: true });
  view.addEventListener('resize', schedule, { passive: true });
  return () => {
    view.removeEventListener('scroll', schedule);
    view.removeEventListener('resize', schedule);
    if (frame !== 0) {
      view.cancelAnimationFrame(frame);
    }
  };
}

function isDark(color: string): boolean {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (channels === undefined || channels.length < 3) {
    return false;
  }
  const scale = color.startsWith('color(') ? 1 : 255;
  const [red, green, blue] = channels.map((channel) => {
    const value = channel / scale;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.18;
}

function edgeBottom(view: Window, header: HTMLElement): number {
  const edge = view.getComputedStyle(header, '::before');
  const height = Number.parseFloat(edge.height);
  return Number.isFinite(height) ? height : header.getBoundingClientRect().height;
}

function backgroundAt(document: Document, x: number, y: number): string | null {
  const view = document.defaultView!;
  const [top] = document.elementsFromPoint(x, y);
  for (let node: Element | null = top ?? null; node !== null; node = node.parentElement) {
    const color = view.getComputedStyle(node).backgroundColor;
    if (color && !TRANSPARENT.test(color)) {
      return color;
    }
  }
  return null;
}
