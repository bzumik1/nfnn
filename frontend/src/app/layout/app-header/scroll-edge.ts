export const SCROLLED_CLASS = 'app-header--scrolled';
export const SCROLL_EDGE_TONE = '--scroll-edge-tone';

const SEE_THROUGH =
  /^transparent$|^rgba\(.*,\s*0?\.\d+\)$|^rgba\(.*,\s*0\)$|\/\s*0?\.\d+\)$|\/\s*0\)$/;
const APPEARANCE = '(prefers-color-scheme: dark)';

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
      const tone = groundAt(document, view.innerWidth / 2, edgeBottom(view, header));
      if (tone !== null) {
        header.style.setProperty(SCROLL_EDGE_TONE, tone);
      }
    }
  };
  const schedule = (): void => {
    if (frame === 0) {
      frame = view.requestAnimationFrame(follow);
    }
  };
  const appearance = typeof view.matchMedia === 'function' ? view.matchMedia(APPEARANCE) : null;
  follow();
  view.addEventListener('scroll', schedule, { passive: true });
  view.addEventListener('resize', schedule, { passive: true });
  appearance?.addEventListener('change', schedule);
  return () => {
    view.removeEventListener('scroll', schedule);
    view.removeEventListener('resize', schedule);
    appearance?.removeEventListener('change', schedule);
    if (frame !== 0) {
      view.cancelAnimationFrame(frame);
    }
  };
}

function edgeBottom(view: Window, header: HTMLElement): number {
  const edge = view.getComputedStyle(header, '::before');
  const height = Number.parseFloat(edge.height);
  return Number.isFinite(height) ? height : header.getBoundingClientRect().height;
}

function groundAt(document: Document, x: number, y: number): string | null {
  const view = document.defaultView!;
  const [top] = document.elementsFromPoint(x, y);
  for (let node: Element | null = top ?? null; node !== null; node = node.parentElement) {
    const color = view.getComputedStyle(node).backgroundColor;
    if (color && !SEE_THROUGH.test(color) && spansTheWidth(view, node)) {
      return color;
    }
  }
  return null;
}

function spansTheWidth(view: Window, node: Element): boolean {
  const box = node.getBoundingClientRect();
  return box.left <= 0 && box.right >= view.innerWidth;
}
