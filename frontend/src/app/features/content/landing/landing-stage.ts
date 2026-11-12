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

  const restingScroll = (): number =>
    Number.parseFloat(view.getComputedStyle(root).getPropertyValue(RESTING_SCROLL)) || 0;

  const rest = (top: number): void => {
    if (Math.abs(view.scrollY - top) > 0.5) {
      view.scrollTo({ top, behavior: 'instant' });
    }
  };

  const settle = (): void => {
    frame = 0;
    root.classList.add(LANDING_STAGE_CLASS);
    if (hero.getBoundingClientRect().height > view.innerHeight + FITS_TOLERANCE_PX) {
      root.classList.remove(LANDING_STAGE_CLASS);
      rest(0);
      return;
    }
    rest(restingScroll());
  };

  const schedule = (): void => {
    if (frame === 0) {
      frame = view.requestAnimationFrame(settle);
    }
  };

  const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  settle();
  view.addEventListener('scroll', schedule, { passive: true });
  view.addEventListener('resize', schedule, { passive: true });
  resized?.observe(hero);

  return () => {
    view.removeEventListener('scroll', schedule);
    view.removeEventListener('resize', schedule);
    resized?.disconnect();
    if (frame !== 0) {
      view.cancelAnimationFrame(frame);
      frame = 0;
    }
    root.classList.remove(LANDING_STAGE_CLASS);
  };
}
