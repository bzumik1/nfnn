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

export interface MotionHeights {
  readonly path: number[];
  readonly finished: number;
  readonly rest: number;
}

export function heightsThroughTheMotion(element: Locator, steps = 20): Promise<MotionHeights> {
  return element.evaluate(
    (watched, stepCount) =>
      new Promise<MotionHeights>((resolve) => {
        const height = () => watched.getBoundingClientRect().height;
        const endOf = (motion: Animation) => Number(motion.effect!.getComputedTiming().endTime);
        const running = () =>
          watched
            .getAnimations({ subtree: true })
            .filter((motion) => motion.playState === 'running' && Number.isFinite(endOf(motion)));
        const path = [height()];
        const started = performance.now();
        let moved = false;
        let finished = path[0];
        let stillFrames = 0;
        const sample = () => {
          const motions = running();
          if (motions.length > 0) {
            moved = true;
            stillFrames = 0;
            motions.forEach((motion) => motion.pause());
            const end = Math.max(...motions.map(endOf));
            for (let step = 0; step <= stepCount; step++) {
              const time = (end * step) / stepCount;
              motions.forEach((motion) => {
                motion.currentTime = Math.min(time, endOf(motion));
              });
              path.push(height());
            }
            motions.forEach((motion) => motion.finish());
            finished = height();
            path.push(finished);
          } else if (moved) {
            stillFrames += 1;
          }
          if ((moved && stillFrames >= 3) || performance.now() - started > 3000) {
            resolve({ path, finished, rest: height() });
            return;
          }
          requestAnimationFrame(sample);
        };
        sample();
      }),
    steps,
  );
}

export function stepsAgainst(heights: number[], direction: 'grows' | 'shrinks'): number[] {
  return heights
    .slice(1)
    .map((height, index) => height - heights[index])
    .filter((step) => (direction === 'grows' ? step < -0.5 : step > 0.5));
}

export function stepAfterTheMotion(heights: MotionHeights): number[] {
  const step = heights.rest - heights.finished;
  return Math.abs(step) > 0.5 ? [step] : [];
}
