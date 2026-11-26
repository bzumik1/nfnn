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

export function heightsThroughTheMotion(
  element: Locator,
  movingParts: string,
  steps = 20,
): Promise<MotionHeights> {
  return element.evaluate(
    (watched, { selector, stepCount }) =>
      new Promise<MotionHeights>((resolve) => {
        const height = () => watched.getBoundingClientRect().height;
        const endOf = (motion: Animation) => Number(motion.effect!.getComputedTiming().endTime);
        const finite = () =>
          watched
            .getAnimations({ subtree: true })
            .filter((motion) => motion.playState !== 'finished' && Number.isFinite(endOf(motion)));
        const path = [height()];
        const settle = (finished: number) => {
          const started = performance.now();
          let stillFrames = 0;
          const sample = () => {
            stillFrames = finite().some((motion) => motion.playState === 'running')
              ? 0
              : stillFrames + 1;
            if (stillFrames >= 3 || performance.now() - started > 3000) {
              resolve({ path, finished, rest: height() });
              return;
            }
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        };
        const startsToMove = (record: MutationRecord) =>
          record.type === 'attributes'
            ? (record.target as Element).matches(selector)
            : Array.from(record.addedNodes).some(
                (node) => node instanceof Element && node.matches(selector),
              );
        const observer = new MutationObserver((records) => {
          if (!records.some(startsToMove)) {
            return;
          }
          observer.disconnect();
          clearTimeout(giveUp);
          const motions = finite();
          motions.forEach((motion) => motion.pause());
          const end = Math.max(0, ...motions.map(endOf));
          for (let step = 0; step <= stepCount; step++) {
            const time = (end * step) / stepCount;
            motions.forEach((motion) => {
              motion.currentTime = Math.min(time, endOf(motion));
            });
            path.push(height());
          }
          motions.forEach((motion) => motion.finish());
          const finished = height();
          path.push(finished);
          settle(finished);
        });
        const giveUp = setTimeout(() => {
          observer.disconnect();
          resolve({ path, finished: path[0], rest: height() });
        }, 3000);
        observer.observe(watched, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['class'],
        });
      }),
    { selector: movingParts, stepCount: steps },
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

export function scrollThroughTheMotion(
  element: Locator,
  movingParts: string,
  steps = 20,
): Promise<number[]> {
  return element.evaluate(
    (watched, { selector, stepCount }) =>
      new Promise<number[]>((resolve) => {
        let scroller: Element | null = watched.parentElement;
        while (scroller !== null && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
          scroller = scroller.parentElement;
        }
        const scrolling = scroller ?? document.scrollingElement!;
        const endOf = (motion: Animation) => Number(motion.effect!.getComputedTiming().endTime);
        const path: number[] = [];
        const settle = () => {
          const started = performance.now();
          let stillFrames = 0;
          const sample = () => {
            const top = scrolling.scrollTop;
            stillFrames = top === path[path.length - 1] ? stillFrames + 1 : 0;
            path.push(top);
            if (stillFrames >= 10 || performance.now() - started > 3000) {
              resolve(path);
              return;
            }
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        };
        const startsToMove = (record: MutationRecord) =>
          record.type === 'attributes'
            ? (record.target as Element).matches(selector)
            : Array.from(record.addedNodes).some(
                (node) => node instanceof Element && node.matches(selector),
              );
        const observer = new MutationObserver((records) => {
          if (!records.some(startsToMove)) {
            return;
          }
          observer.disconnect();
          clearTimeout(giveUp);
          path.push(scrolling.scrollTop);
          const motions = watched
            .getAnimations({ subtree: true })
            .filter((motion) => motion.playState !== 'finished' && Number.isFinite(endOf(motion)));
          motions.forEach((motion) => motion.pause());
          const end = Math.max(0, ...motions.map(endOf));
          for (let step = 0; step <= stepCount; step++) {
            const time = (end * step) / stepCount;
            motions.forEach((motion) => {
              motion.currentTime = Math.min(time, endOf(motion));
            });
            watched.getBoundingClientRect();
            path.push(scrolling.scrollTop);
          }
          motions.forEach((motion) => motion.finish());
          path.push(scrolling.scrollTop);
          settle();
        });
        const giveUp = setTimeout(() => {
          observer.disconnect();
          resolve(path);
        }, 3000);
        observer.observe(watched, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['class'],
        });
      }),
    { selector: movingParts, stepCount: steps },
  );
}

export function stepsBack(positions: number[]): number[] {
  const steps = positions.slice(1).map((position, index) => position - positions[index]);
  const direction = Math.sign(steps.find((step) => Math.abs(step) > 0.5) ?? 0);
  return steps.filter((step) => Math.abs(step) > 0.5 && Math.sign(step) !== direction);
}
