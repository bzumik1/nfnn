import { Page } from '@playwright/test';
import { expect } from './fixtures';

export type Rgb = readonly [number, number, number];

export interface BarLook {
  readonly name: string;
  readonly blur: string;
  readonly fill: string;
  readonly shown: boolean;
}

export interface TopAreaFrame {
  readonly at: number;
  readonly veil: number | null;
  readonly blur: number;
  readonly tint: Rgb | null;
  readonly ground: Rgb;
  readonly track: Rgb | null;
  readonly bars: readonly BarLook[];
}

interface TopAreaWatch {
  topAreaFrames: TopAreaFrame[];
  topAreaWatched: boolean;
}

const BARS = 'app-root .ui-glass';
const FRAME_MS = 1000 / 60;
const QUIET_FRAMES = 3;
const LONGEST_STEP_SHARE_PER_FRAME = 0.4;
const STILL = 0.02;
const BLUR_BEHIND_VEIL = 0.25;
const STRIP_TOLERANCE = 16;

async function watchTopArea(page: Page): Promise<void> {
  await page.evaluate((bars) => {
    const watch = window as unknown as TopAreaWatch;
    watch.topAreaFrames = [];
    watch.topAreaWatched = true;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('no 2D canvas to read the colours with');
    }
    const painted = (colour: string): number[] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return [red, green, blue, alpha / 255];
    };
    const rgb = (colour: string): [number, number, number] => {
      const [red, green, blue] = painted(colour);
      return [red, green, blue];
    };
    const share = (style: CSSStyleDeclaration): number =>
      style.visibility === 'hidden' || style.display === 'none' ? 0 : Number(style.opacity);
    const trackOf = (scrollbar: string): [number, number, number] | null => {
      const colours = scrollbar.match(/[a-z-]+\([^)]*\)|#[0-9a-f]+|[a-z]+/gi) ?? [];
      return colours.length === 2 ? rgb(colours[1]) : null;
    };
    const sample = (at: number): void => {
      if (!watch.topAreaWatched) {
        return;
      }
      const root = getComputedStyle(document.documentElement);
      const modals = document.querySelectorAll('dialog:modal');
      const dialog = modals.length === 0 ? null : modals[modals.length - 1];
      const own = dialog === null ? null : getComputedStyle(dialog);
      const behind = dialog === null ? null : getComputedStyle(dialog, '::backdrop');
      const fill = own === null ? null : painted(own.backgroundColor);
      watch.topAreaFrames.push({
        at,
        veil: own === null || fill === null ? null : fill[3] * share(own),
        blur:
          own === null || behind === null
            ? 0
            : own.backdropFilter !== 'none'
              ? share(own)
              : behind.backdropFilter !== 'none'
                ? share(own) * Number(behind.opacity)
                : 0,
        tint: fill === null ? null : [fill[0], fill[1], fill[2]],
        ground: rgb(root.backgroundColor),
        track: trackOf(root.scrollbarColor),
        bars: Array.from(document.querySelectorAll(bars), (bar) => {
          const style = getComputedStyle(bar);
          return {
            name: bar.classList[0],
            blur: style.backdropFilter,
            fill: painted(style.backgroundColor).join(' '),
            shown: share(style) > 0,
          };
        }),
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, BARS);
}

async function stopWhenStill(page: Page): Promise<TopAreaFrame[]> {
  return page.evaluate(
    (quietFramesNeeded) =>
      new Promise<TopAreaFrame[]>((settled) => {
        const watch = window as unknown as TopAreaWatch;
        const moving = (): boolean =>
          document
            .getAnimations()
            .some(
              (animation) =>
                animation.playState === 'running' &&
                animation.effect?.getComputedTiming().iterations !== Infinity,
            );
        let quietFrames = 0;
        const check = (): void => {
          quietFrames = moving() ? 0 : quietFrames + 1;
          if (quietFrames < quietFramesNeeded) {
            requestAnimationFrame(check);
            return;
          }
          watch.topAreaWatched = false;
          settled(watch.topAreaFrames);
        };
        requestAnimationFrame(check);
      }),
    QUIET_FRAMES,
  );
}

export async function topAreaFramesWhile(
  page: Page,
  act: () => Promise<void>,
  arrived: () => Promise<void>,
): Promise<TopAreaFrame[]> {
  await watchTopArea(page);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as TopAreaWatch).topAreaFrames.length))
    .toBeGreaterThan(QUIET_FRAMES);
  await act();
  await arrived();
  return stopWhenStill(page);
}

function strengthOf(frame: TopAreaFrame): number {
  return frame.veil ?? 0;
}

function framesPassed(from: TopAreaFrame, to: TopAreaFrame): number {
  return Math.max(1, Math.round((to.at - from.at) / FRAME_MS));
}

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

export function veilJumps(frames: readonly TopAreaFrame[]): string[] {
  const jumps: string[] = [];
  const travel = strengthOf(frames[frames.length - 1]) - strengthOf(frames[0]);
  const strongest = Math.max(STILL, ...frames.map(strengthOf));
  for (const [index, frame] of frames.entries()) {
    if (index === 0) {
      continue;
    }
    const previous = frames[index - 1];
    const step = (strengthOf(frame) - strengthOf(previous)) / strongest;
    const longestStep =
      (Math.abs(travel) / strongest) * LONGEST_STEP_SHARE_PER_FRAME * framesPassed(previous, frame);
    if (Math.sign(travel) * step < -STILL || Math.abs(step) > longestStep + STILL) {
      jumps.push(
        `the backdrop goes from ${percent(strengthOf(previous) / strongest)} to ${percent(strengthOf(frame) / strongest)} of its strength in frame ${index}, ${Math.round(frame.at - previous.at)} ms after the previous one`,
      );
    }
  }
  return jumps;
}

export function blurOutOfStep(frames: readonly TopAreaFrame[]): string[] {
  const strongest = Math.max(...frames.map(strengthOf));
  if (strongest <= STILL) {
    return [];
  }
  return frames.flatMap((frame, index) => {
    const veil = strengthOf(frame) / strongest;
    return veil > STILL && Math.abs(frame.blur - veil) > BLUR_BEHIND_VEIL
      ? [
          `the blur shows at ${percent(frame.blur)} under a backdrop at ${percent(veil)} of its strength in frame ${index}`,
        ]
      : [];
  });
}

export function barsThatChanged(frames: readonly TopAreaFrame[]): string[] {
  const changes: string[] = [];
  const last = new Map<string, BarLook>();
  for (const [index, frame] of frames.entries()) {
    for (const bar of frame.bars) {
      const before = last.get(bar.name);
      if (before !== undefined) {
        for (const look of ['blur', 'fill', 'shown'] as const) {
          if (before[look] !== bar[look]) {
            changes.push(
              `${bar.name}: ${look} ${String(before[look])} → ${String(bar[look])} in frame ${index}`,
            );
          }
        }
      }
      last.set(bar.name, bar);
    }
    if (index > 0) {
      for (const before of frames[index - 1].bars) {
        if (!frame.bars.some((bar) => bar.name === before.name)) {
          changes.push(`${before.name}: gone in frame ${index}`);
          last.delete(before.name);
        }
      }
    }
  }
  return changes;
}

function restingGround(frames: readonly TopAreaFrame[]): Rgb {
  const resting = [frames[0], frames[frames.length - 1]].find((frame) => frame.veil === null);
  if (resting === undefined) {
    throw new Error('no frame without a dialog to read the resting ground from');
  }
  return resting.ground;
}

function hex(colour: Rgb): string {
  return `#${colour.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function apart(one: Rgb, other: Rgb): number {
  return Math.max(...one.map((channel, index) => Math.abs(channel - other[index])));
}

export function stripOutOfStep(frames: readonly TopAreaFrame[]): string[] {
  const rest = restingGround(frames);
  return frames.flatMap((frame, index) => {
    const veil = strengthOf(frame);
    const tint = frame.tint ?? rest;
    const under = (channel: number): number =>
      Math.round(rest[channel] * (1 - veil) + tint[channel] * veil);
    const veiled: Rgb = [under(0), under(1), under(2)];
    const strips: [string, Rgb | null][] = [
      ['ground', frame.ground],
      ['scrollbar track', frame.veil === null ? null : frame.track],
    ];
    return strips.flatMap(([name, strip]) =>
      strip !== null && apart(strip, veiled) > STRIP_TOLERANCE
        ? [
            `the ${name} beside the backdrop is ${hex(strip)} where the page under it is ${hex(veiled)} in frame ${index}`,
          ]
        : [],
    );
  });
}
