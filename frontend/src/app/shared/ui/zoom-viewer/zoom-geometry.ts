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

export function clampView(view: ZoomView, _bounds: ZoomBounds): ZoomView {
  return view;
}

export function zoomAround(
  view: ZoomView,
  _scale: number,
  _focus: ZoomPoint,
  _bounds: ZoomBounds,
): ZoomView {
  return view;
}

export function panBy(view: ZoomView, _dx: number, _dy: number, _bounds: ZoomBounds): ZoomView {
  return view;
}

export function zoomStep(scale: number, _direction: 'in' | 'out', _maxScale: number): number {
  return scale;
}
