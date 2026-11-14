export const LANDING_STAGE_CLASS = 'landing-stage';

const RESTING_SCROLL = '--page-resting-scroll';
const FITS_TOLERANCE_PX = 1;

export function holdLandingStage(document: Document, hero: HTMLElement): () => void {
  const view = document.defaultView;
  if (view === null) {
    return () => undefined;
  }
  const root = document.documentElement;
  let frame = 0;
  let staged = false;

  const restingScroll = (): number =>
    Number.parseFloat(view.getComputedStyle(root).getPropertyValue(RESTING_SCROLL)) || 0;

  const dialogOpen = (): boolean => document.querySelector('dialog[open]') !== null;

  const rest = (top: number): void => {
    if (Math.abs(view.scrollY - top) > 0.5) {
      view.scrollTo({ top, behavior: 'instant' });
    }
  };

  const settle = (): void => {
    frame = 0;
    const fits = hero.getBoundingClientRect().height <= view.innerHeight + FITS_TOLERANCE_PX;
    if (!fits) {
      if (staged) {
        staged = false;
        root.classList.remove(LANDING_STAGE_CLASS);
        rest(0);
      }
      return;
    }
    staged = true;
    root.classList.add(LANDING_STAGE_CLASS);
    if (!dialogOpen()) {
      rest(restingScroll());
    }
  };

  const schedule = (): void => {
    if (frame === 0) {
      frame = view.requestAnimationFrame(settle);
    }
  };

  const scrolled = (): void => {
    if (staged) {
      schedule();
    }
  };

  const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  settle();
  view.addEventListener('scroll', scrolled, { passive: true });
  view.addEventListener('resize', schedule, { passive: true });
  view.addEventListener('pageshow', schedule);
  document.addEventListener('close', schedule, true);
  resized?.observe(hero);

  return () => {
    view.removeEventListener('scroll', scrolled);
    view.removeEventListener('resize', schedule);
    view.removeEventListener('pageshow', schedule);
    document.removeEventListener('close', schedule, true);
    resized?.disconnect();
    if (frame !== 0) {
      view.cancelAnimationFrame(frame);
      frame = 0;
    }
    root.classList.remove(LANDING_STAGE_CLASS);
  };
}
