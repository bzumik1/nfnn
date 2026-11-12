export interface LargeTitleWatch {
  check(): void;
  release(): void;
}

export function followLargeTitle(
  document: Document,
  header: HTMLElement,
  show: (title: string | null) => void,
): LargeTitleWatch {
  const view = document.defaultView;
  if (view === null) {
    return { check: () => undefined, release: () => undefined };
  }
  let frame = 0;
  let current: string | null = null;
  const check = (): void => {
    frame = 0;
    const title = scrolledAwayTitle(document, view, header);
    if (title !== current) {
      current = title;
      show(title);
    }
  };
  const schedule = (): void => {
    if (frame === 0) {
      frame = view.requestAnimationFrame(check);
    }
  };
  view.addEventListener('scroll', schedule, { passive: true });
  view.addEventListener('resize', schedule, { passive: true });
  return {
    check,
    release: () => {
      view.removeEventListener('scroll', schedule);
      view.removeEventListener('resize', schedule);
      if (frame !== 0) {
        view.cancelAnimationFrame(frame);
      }
    },
  };
}

function scrolledAwayTitle(document: Document, view: Window, header: HTMLElement): string | null {
  const heading = document.querySelector<HTMLElement>('main#obsah h1');
  if (heading === null || view.scrollY <= 0) {
    return null;
  }
  if (heading.getBoundingClientRect().bottom > header.getBoundingClientRect().height) {
    return null;
  }
  const text = (heading.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}
