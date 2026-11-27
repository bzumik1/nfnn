import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export interface FoldTransitionSelectors {
  readonly fold: string;
  readonly trigger: string;
}

interface FoldTransitionSample {
  readonly transition: number;
  readonly at: number;
  readonly duration: number;
  readonly easing: string;
  readonly keyframes: readonly string[];
  readonly behavior: string;
  readonly connected: boolean;
  readonly display: string;
}

interface FoldTransitionTrace {
  readonly samples: readonly FoldTransitionSample[];
  readonly clickedAt: number | null;
  readonly endedAt: number | null;
  readonly endedTransition: number | null;
  readonly finished: readonly number[];
  readonly cancelled: number;
}

type TracedWindow = Window & { nfnnUnfoldTransition: FoldTransitionTrace };

export async function followUnfoldTransition(
  page: Page,
  selectors: FoldTransitionSelectors,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (fold) =>
            document
              .querySelector(fold)
              ?.getAnimations({ subtree: true })
              .some(
                (animation) =>
                  animation instanceof CSSTransition &&
                  animation.transitionProperty === 'grid-template-rows',
              ) ?? true,
          selectors.fold,
        ),
      { message: 'the closed fold runs no grid-template-rows transition before the click' },
    )
    .toBe(false);
  await page.evaluate(({ fold, trigger }) => {
    const trace: {
      samples: unknown[];
      clickedAt: number | null;
      endedAt: number | null;
      endedTransition: number | null;
      finished: number[];
      cancelled: number;
    } = {
      samples: [],
      clickedAt: null,
      endedAt: null,
      endedTransition: null,
      finished: [],
      cancelled: 0,
    };
    Object.assign(window, { nfnnUnfoldTransition: trace });
    const known = new Map<CSSTransition, number>();
    const foldTransition = () =>
      document
        .querySelector(fold)
        ?.getAnimations({ subtree: true })
        .find(
          (animation): animation is CSSTransition =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === 'grid-template-rows',
        );
    const idOf = (transition: CSSTransition) => {
      if (!known.has(transition)) {
        const id = known.size;
        known.set(transition, id);
        transition.finished.then(
          () => trace.finished.push(id),
          () => undefined,
        );
      }
      return known.get(transition)!;
    };
    document.addEventListener(
      'click',
      (event) => {
        if ((event.target as Element).closest(trigger) !== null) {
          trace.clickedAt ??= performance.now();
        }
      },
      true,
    );
    document.addEventListener(
      'transitionend',
      (event) => {
        const target = event.target as Element;
        if (
          trace.clickedAt !== null &&
          trace.endedAt === null &&
          event.propertyName === 'grid-template-rows' &&
          target.closest(fold) !== null
        ) {
          trace.endedAt = performance.now();
          const ended = [...known].find(
            ([transition]) => (transition.effect as KeyframeEffect).target === target,
          );
          trace.endedTransition = ended?.[1] ?? null;
        }
      },
      true,
    );
    document.addEventListener(
      'transitioncancel',
      (event) => {
        if (
          trace.clickedAt !== null &&
          event.propertyName === 'grid-template-rows' &&
          (event.target as Element).closest(fold) !== null
        ) {
          trace.cancelled += 1;
        }
      },
      true,
    );
    const sample = () => {
      if (trace.endedAt !== null) {
        return;
      }
      const transition = trace.clickedAt === null ? undefined : foldTransition();
      const effect = transition?.effect as KeyframeEffect | undefined;
      const target = effect?.target as HTMLElement | null | undefined;
      if (transition && effect && target) {
        const style = getComputedStyle(target);
        const properties = style.transitionProperty.split(',').map((name) => name.trim());
        const behaviors = style.transitionBehavior.split(',').map((name) => name.trim());
        trace.samples.push({
          transition: idOf(transition),
          at: performance.now(),
          duration: Number(effect.getComputedTiming().duration ?? 0),
          easing: effect.getTiming().easing ?? '',
          keyframes: effect
            .getKeyframes()
            .map((keyframe) => String(keyframe['gridTemplateRows'] ?? '')),
          behavior: behaviors[properties.indexOf('grid-template-rows') % behaviors.length] ?? '',
          connected: target.isConnected,
          display: style.display,
        });
      }
      setTimeout(sample, 4);
    };
    sample();
  }, selectors);
}

export async function expectUnfoldsByOneTransition(page: Page): Promise<void> {
  await expect
    .poll(
      () => page.evaluate(() => (window as TracedWindow).nfnnUnfoldTransition.endedAt !== null),
      {
        message: 'the transitionend of the fold on grid-template-rows comes',
      },
    )
    .toBe(true);
  const trace = await page.evaluate(() => (window as TracedWindow).nfnnUnfoldTransition);
  const duration = await durationOf(page, '--duration-base');
  expect(duration, 'the computed --duration-base').toBeGreaterThan(0);
  const easing = await easingOf(page, '--ease-standard');

  const samples = trace.samples;
  expect(
    samples.length,
    'a sample of the grid-template-rows transition, pending or running',
  ).toBeGreaterThanOrEqual(1);
  const ids = [...new Set(samples.map((sample) => sample.transition))];
  expect(ids, 'one and the same grid-template-rows transition').toHaveLength(1);
  await expect
    .poll(() => page.evaluate(() => (window as TracedWindow).nfnnUnfoldTransition.finished), {
      message: 'that same transition finishes',
    })
    .toContain(ids[0]);
  expect(
    [trace.endedTransition, trace.cancelled],
    'the transitionend the test waits for comes from that same transition, never cancelled',
  ).toEqual([ids[0], 0]);
  expect(
    samples.map((sample) => sample.behavior),
    'grid-template-rows does not move as a discrete step',
  ).toEqual(samples.map(() => 'normal'));
  expect(
    samples.map((sample) => sample.keyframes),
    'the transition interpolates from 0fr to 1fr',
  ).toEqual(samples.map(() => ['0fr', '1fr']));
  expect(
    samples.map((sample) => sample.duration),
    'the transition lasts the computed --duration-base',
  ).toEqual(samples.map(() => duration));
  expect(
    samples.map((sample) => sample.easing),
    'the transition eases as motion.expand',
  ).toEqual(samples.map(() => easing));
  expect(
    samples.filter((sample) => !sample.connected || sample.display === 'none'),
    'the fold stays connected and rendered until that transitionend',
  ).toEqual([]);
  expect(trace.clickedAt, 'the click that opens the fold is seen').not.toBeNull();
  expect(
    trace.endedAt! - trace.clickedAt!,
    'that transitionend comes at least 80 % of --duration-base after the click',
  ).toBeGreaterThanOrEqual(duration * 0.8);
}

async function durationOf(page: Page, token: string): Promise<number> {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;
  }, token);
}

async function easingOf(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const probe = document.createElement('div');
    document.body.append(probe);
    const easing = probe.animate([], { duration: 1, easing: value }).effect!.getTiming().easing!;
    probe.remove();
    return easing;
  }, token);
}
