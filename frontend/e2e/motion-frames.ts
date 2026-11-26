import { Locator } from '@playwright/test';
import { expect } from './fixtures';

export async function untilAtRest(measured: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        measured.evaluate((element) => {
          const ancestors: Element[] = [];
          for (let node = element.parentElement; node; node = node.parentElement) {
            ancestors.push(node);
          }
          return [
            ...element.getAnimations({ subtree: true }),
            ...ancestors.flatMap((ancestor) => ancestor.getAnimations()),
          ].filter(
            (motion) =>
              motion.playState === 'running' &&
              motion.effect?.getComputedTiming().iterations !== Infinity,
          ).length;
        }),
      { message: 'nothing that moves the measured element is still running' },
    )
    .toBe(0);
}

export interface HeightFrame {
  readonly height: number;
  readonly moving: boolean;
}

export function heightsUntilAtRest(element: Locator): Promise<HeightFrame[]> {
  return element.evaluate(
    (watched) =>
      new Promise<HeightFrame[]>((resolve) => {
        const frames: HeightFrame[] = [];
        const started = performance.now();
        let moved = false;
        let stillFrames = 0;
        const sample = () => {
          const moving = watched
            .getAnimations({ subtree: true })
            .some((motion) => motion.playState === 'running');
          frames.push({ height: watched.getBoundingClientRect().height, moving });
          moved ||= moving;
          stillFrames = moving ? 0 : stillFrames + 1;
          if ((moved && stillFrames >= 3) || performance.now() - started > 3000) {
            resolve(frames);
            return;
          }
          requestAnimationFrame(sample);
        };
        sample();
      }),
  );
}

export function stepsAgainst(frames: HeightFrame[], direction: 'grows' | 'shrinks'): number[] {
  return frames
    .slice(1)
    .map((frame, index) => frame.height - frames[index].height)
    .filter((step) => (direction === 'grows' ? step < -0.5 : step > 0.5));
}

export function stepsAfterTheMotion(frames: HeightFrame[]): number[] {
  const lastMoving = frames.map((frame) => frame.moving).lastIndexOf(true);
  return frames
    .slice(lastMoving + 1)
    .map((frame) => frame.height - frames[lastMoving].height)
    .filter((step) => Math.abs(step) > 0.5);
}
