import { Locator } from '@playwright/test';

export interface FingerPoint {
  readonly x: number;
  readonly y: number;
}

const FRAME_MS = 16;

export type LegacyTouchDocument = Document & {
  createTouch(
    view: Window,
    target: EventTarget,
    identifier: number,
    pageX: number,
    pageY: number,
    screenX: number,
    screenY: number,
  ): Touch;
  createTouchList(...touches: Touch[]): TouchList;
};

export async function fingerAlong(
  target: Locator,
  path: readonly FingerPoint[],
  lifts = false,
): Promise<void> {
  await target.evaluate(
    (element, { path, lifts, FRAME_MS }) => {
      const document = element.ownerDocument as LegacyTouchDocument;
      const view = document.defaultView!;
      const legacy = typeof document.createTouch === 'function';
      const at = (point: FingerPoint): Touch[] | TouchList =>
        legacy
          ? document.createTouchList(
              document.createTouch(
                view,
                element,
                1,
                point.x + view.scrollX,
                point.y + view.scrollY,
                point.x,
                point.y,
              ),
            )
          : [new Touch({ identifier: 1, target: element, clientX: point.x, clientY: point.y })];
      const none = (): Touch[] | TouchList => (legacy ? document.createTouchList() : []);
      const pressedAt = performance.now();
      const finger = (type: string, point: FingerPoint, step: number, touching: boolean): void => {
        const changed = at(point) as Touch[];
        const touches = (touching ? changed : none()) as Touch[];
        const event = new TouchEvent(type, {
          touches,
          targetTouches: touches,
          changedTouches: changed,
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(event, 'timeStamp', { value: pressedAt + step * FRAME_MS });
        element.dispatchEvent(event);
      };
      finger('touchstart', path[0], 0, true);
      path.slice(1).forEach((point, step) => finger('touchmove', point, step + 1, true));
      if (lifts) {
        finger('touchend', path.at(-1)!, path.length - 1, false);
      }
    },
    { path, lifts, FRAME_MS },
  );
}

export async function fingerPulls(
  target: Locator,
  x: number,
  y: number,
  downs: readonly number[],
): Promise<void> {
  await fingerAlong(target, [{ x, y }, ...downs.map((down) => ({ x, y: y + down }))]);
}
