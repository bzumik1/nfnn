export interface ZoomView {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export interface ZoomPoint {
  readonly x: number;
  readonly y: number;
}

export interface ZoomBounds {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly maxScale: number;
}

export const RESTING_VIEW: ZoomView = { scale: 1, x: 0, y: 0 };

const STEP_IN = 1.5;

export function clampView(view: ZoomView, bounds: ZoomBounds): ZoomView {
  const scale = Math.min(Math.max(view.scale, 1), bounds.maxScale);
  if (scale === 1) {
    return RESTING_VIEW;
  }
  const reachX = Math.max(0, (scale * bounds.contentWidth - bounds.stageWidth) / 2);
  const reachY = Math.max(0, (scale * bounds.contentHeight - bounds.stageHeight) / 2);
  return { scale, x: within(view.x, reachX), y: within(view.y, reachY) };
}

export function zoomAround(
  view: ZoomView,
  scale: number,
  focus: ZoomPoint,
  bounds: ZoomBounds,
): ZoomView {
  const next = Math.min(Math.max(scale, 1), bounds.maxScale);
  const ratio = next / view.scale;
  return clampView(
    {
      scale: next,
      x: focus.x - ratio * (focus.x - view.x),
      y: focus.y - ratio * (focus.y - view.y),
    },
    bounds,
  );
}

export function panBy(view: ZoomView, dx: number, dy: number, bounds: ZoomBounds): ZoomView {
  return clampView({ scale: view.scale, x: view.x + dx, y: view.y + dy }, bounds);
}

export function zoomStep(scale: number, direction: 'in' | 'out', maxScale: number): number {
  const next = direction === 'in' ? scale * STEP_IN : scale / STEP_IN;
  return Math.min(Math.max(Math.round(next * 100) / 100, 1), maxScale);
}

function within(value: number, reach: number): number {
  const clamped = Math.min(Math.max(value, -reach), reach);
  return clamped === 0 ? 0 : clamped;
}
