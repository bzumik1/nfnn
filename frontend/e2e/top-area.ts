import { Page } from '@playwright/test';
import { LATE_FRAME_PAST_THE_STEADY_ONE } from '../src/app/core/navigation/frame-pace';

export type Rgb = readonly [number, number, number];

export interface BarLook {
  readonly name: string;
  readonly blur: string;
  readonly fill: string;
  readonly shown: boolean;
}

export interface ScreenFrame {
  readonly lightness: number;
  readonly edges: number;
  readonly at?: number;
}

export interface TopArea {
  readonly frames: TopAreaFrame[];
  readonly screens: ScreenFrame[];
}

export interface TopAreaFrame {
  readonly at: number;
  readonly readAt: number;
  readonly veil: number | null;
  readonly blur: number;
  readonly tint: Rgb | null;
  readonly ground: Rgb;
  readonly track: Rgb | null;
  readonly thumb: Rgb | null;
  readonly bars: readonly BarLook[];
}

interface TopAreaStop {
  quiet: number;
  readonly deadline: number;
  readonly settled: (frames: TopAreaFrame[]) => void;
  readonly failed: (problem: Error) => void;
}

interface LateFrames {
  read(reader: FrameRequestCallback): void;
}

export interface FrameReader {
  readonly read: (at: number) => boolean;
  readonly inFrame: boolean;
}

export interface SampleCost {
  readonly at: number;
  readonly from: number;
  readonly ms: number;
  readonly inFrame: boolean;
}

interface TopAreaWatch {
  topAreaRun: number;
  topAreaFrames: TopAreaFrame[];
  topAreaFailure: string | null;
  topAreaStop: TopAreaStop | null;
  nfnnLateFrames?: LateFrames;
  nfnnFrameReaders?: Record<string, FrameReader>;
  nfnnSampleCosts?: SampleCost[];
}

export interface TopAreaRegions {
  readonly glass: string;
  readonly glassCopies: string;
  readonly veilCopies: string;
  readonly pageCopies: string;
  readonly pagesOver: string;
}

export interface SampledRegions {
  readonly topArea?: TopAreaRegions;
  readonly readers?: readonly string[];
}

export const TOP_AREA_REGIONS: SampledRegions = {
  topArea: {
    glass: 'app-root .ui-glass',
    glassCopies: '.page-transition .ui-glass, .page-fade .ui-glass',
    veilCopies:
      '.page-transition__sheet-backdrop, .page-transition__sheet > dialog, .page-transition__dim',
    pagesOver: '.page-transition__page--over',
    pageCopies: '.page-transition__page',
  },
};

export interface FrameSampling {
  stopWhenStill(): Promise<TopAreaFrame[]>;
}

export const PROBE_SCRIPT = 'https://probe.invalid/nfnn-probe.js';

export type BandName = 'under the header' | 'under the clock';

const QUIET_FRAMES = 3;
const LONGEST_SETTLE_MS = 2000;
const FRAME_MS = 1000 / 60;
const LONGEST_STEP_SHARE_PER_FRAME = 0.4;
const STILL = 0.02;
const BLUR_BEHIND_VEIL = 0.25;
const STRIP_TOLERANCE = 16;
const MINIMAL_BAND_PX = 64;
const BAND_MARGIN_PX = 4;
const MINIMAL_BAND_HEIGHT_PX = 24;
const SHOWN_BACKDROP = 0.1;
const OPACITY_WORTH_JUDGING = 0.25;
const BLUR_SHARE_SHOWN = 0.5;
const BLUR_GAP_WORTH_JUDGING = 0.1;
const EDGES_LEFT_UNDER_BLUR = 0.5;
const CLOCK_BAND_TOLERANCE = 0.1;
const LONGEST_GROUND_SHARE_PER_FRAME = 0.5;
const LONGEST_GROUND_SHARE_FROM_REST = 0.75;
const GROUNDS_TOLD_APART = 16;

export function evaluateAsProbe<Argument, Result>(
  page: Page,
  probe: (argument: Argument) => Result | Promise<Result>,
  argument: Argument,
): Promise<Result> {
  return page.evaluate<Result>(
    `(${probe.toString()})(${JSON.stringify(argument)})\n//# sourceURL=${PROBE_SCRIPT}`,
  );
}

export async function addProbeInitScript(page: Page, probe: () => void): Promise<void> {
  await page.addInitScript({ content: `(${probe.toString()})()\n//# sourceURL=${PROBE_SCRIPT}` });
}

export async function sampleFrames(
  page: Page,
  regions: SampledRegions = TOP_AREA_REGIONS,
): Promise<FrameSampling> {
  await evaluateAsProbe(
    page,
    ({ regions, quietFrames }) =>
      new Promise<void>((started, failedToStart) => {
        const watch = window as unknown as TopAreaWatch;
        watch.topAreaRun = (watch.topAreaRun ?? 0) + 1;
        watch.topAreaFailure = null;
        watch.topAreaStop = null;
        const run = watch.topAreaRun;
        const frames: TopAreaFrame[] = [];
        watch.topAreaFrames = frames;
        const costs: SampleCost[] = [];
        watch.nfnnSampleCosts = costs;
        const readers = (watch.nfnnFrameReaders ??= {});
        const unknown = (regions.readers ?? []).filter(
          (name) => typeof readers[name]?.read !== 'function',
        );
        if (unknown.length > 0) {
          failedToStart(new Error(`no frame reader is registered as ${unknown.join(', ')}`));
          return;
        }
        interface TopAreaReader {
          read(at: number): TopAreaFrame;
          moving(): string[];
        }
        const topAreaReader = (top: TopAreaRegions): TopAreaReader => {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context === null) {
            throw new Error('no 2D canvas to read the colours with');
          }
          const painted = (colour: string): [number, number, number, number] => {
            const taken = ['#010203', '#040506'].map((sentinel) => {
              context.fillStyle = sentinel;
              context.fillStyle = colour;
              return context.fillStyle;
            });
            if (taken[0] !== taken[1]) {
              throw new Error(`the canvas cannot paint the colour „${colour}“`);
            }
            context.clearRect(0, 0, 1, 1);
            context.fillRect(0, 0, 1, 1);
            const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
            return [red, green, blue, alpha / 255];
          };
          const rgb = (colour: string): [number, number, number] => {
            const [red, green, blue] = painted(colour);
            return [red, green, blue];
          };
          const topLevelParts = (value: string): string[] => {
            const parts: string[] = [];
            let depth = 0;
            let part = '';
            for (const character of value.trim()) {
              depth += character === '(' ? 1 : character === ')' ? -1 : 0;
              if (depth === 0 && /\s/.test(character)) {
                if (part !== '') {
                  parts.push(part);
                }
                part = '';
              } else {
                part += character;
              }
            }
            return part === '' ? parts : [...parts, part];
          };
          const scrollbarOf = (
            scrollbar: string,
          ): { thumb: [number, number, number]; track: [number, number, number] } | null => {
            if (scrollbar === 'auto') {
              return null;
            }
            const colours = topLevelParts(scrollbar);
            if (colours.length !== 2) {
              throw new Error(`the scrollbar-color „${scrollbar}“ does not name two colours`);
            }
            return { thumb: rgb(colours[0]), track: rgb(colours[1]) };
          };
          const backdropFilterOf = (style: CSSStyleDeclaration): string =>
            style.getPropertyValue('backdrop-filter') ||
            style.getPropertyValue('-webkit-backdrop-filter') ||
            'none';
          const ownShare = (style: CSSStyleDeclaration): number =>
            style.visibility === 'hidden' || style.display === 'none' ? 0 : Number(style.opacity);
          const shownShare = (element: Element): number => {
            if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
              return 0;
            }
            let share = 1;
            for (let at: Element | null = element; at !== null; at = at.parentElement) {
              share *= Number(getComputedStyle(at).opacity);
            }
            return share;
          };
          const groundOf = (): [number, number, number] => {
            const root = painted(getComputedStyle(document.documentElement).backgroundColor);
            const [red, green, blue] =
              root[3] === 0 ? painted(getComputedStyle(document.body).backgroundColor) : root;
            return [red, green, blue];
          };
          interface Veil {
            readonly strength: number;
            readonly blur: number;
            readonly tint: [number, number, number];
          }
          const layerOf = (style: CSSStyleDeclaration, share: number): Veil => {
            const [red, green, blue, alpha] = painted(style.backgroundColor);
            return {
              strength: alpha * share,
              blur: backdropFilterOf(style) !== 'none' ? share : 0,
              tint: [red, green, blue],
            };
          };
          const layered = (layers: readonly Veil[]): Veil => {
            const stronger = layers.reduce((strongest, layer) =>
              layer.strength > strongest.strength ? layer : strongest,
            );
            return {
              strength: 1 - layers.reduce((through, layer) => through * (1 - layer.strength), 1),
              blur: Math.max(...layers.map((layer) => layer.blur)),
              tint: stronger.tint,
            };
          };
          const liveVeil = (): Veil | null => {
            const modals = document.querySelectorAll('dialog:modal');
            if (modals.length === 0) {
              return null;
            }
            const dialog = modals[modals.length - 1];
            const own = getComputedStyle(dialog);
            const behind = getComputedStyle(dialog, '::backdrop');
            return layered([layerOf(own, ownShare(own)), layerOf(behind, ownShare(behind))]);
          };
          const point = { x: innerWidth / 2, y: 1 };
          const coversPoint = (element: Element): boolean => {
            const box = element.getBoundingClientRect();
            return (
              box.left <= point.x &&
              point.x < box.right &&
              box.top <= point.y &&
              point.y < box.bottom
            );
          };
          const pageAbove = (copy: Element): boolean => {
            const stack = document.elementsFromPoint(point.x, point.y);
            return Array.from(document.querySelectorAll(top.pagesOver)).some(
              (over) =>
                !over.contains(copy) &&
                (copy.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
                (stack.some((element) => over.contains(element)) ||
                  (coversPoint(over) && shownShare(over) > 0)),
            );
          };
          const copyVeils = (): Veil[] => {
            const layersOfCopy = new Map<Element | null, Veil[]>();
            for (const layer of document.querySelectorAll(top.veilCopies)) {
              if (coversPoint(layer) && !pageAbove(layer)) {
                const copy = layer.closest(top.pageCopies) ?? layer.parentElement;
                layersOfCopy.set(copy, [
                  ...(layersOfCopy.get(copy) ?? []),
                  layerOf(getComputedStyle(layer), shownShare(layer)),
                ]);
              }
            }
            return Array.from(layersOfCopy.values(), layered);
          };
          const barsOf = (): BarLook[] => {
            const named = new Map<string, Element[]>();
            for (const bar of document.querySelectorAll(`${top.glass}, ${top.glassCopies}`)) {
              const name = bar.classList[0];
              named.set(name, [...(named.get(name) ?? []), bar]);
            }
            return Array.from(named, ([name, all]) => {
              const shown = all.filter((bar) =>
                bar.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
              );
              const seen = (shown.length > 0 ? shown : all).map((bar) => getComputedStyle(bar));
              const looks = (look: (style: CSSStyleDeclaration) => string): string =>
                [...new Set(seen.map(look))].sort().join(' | ');
              return {
                name,
                blur: looks(backdropFilterOf),
                fill: looks((style) => painted(style.backgroundColor).join(' ')),
                shown: shown.length > 0,
              };
            });
          };
          const describe = (animation: Animation): string => {
            const effect = animation.effect as KeyframeEffect | null;
            const target = effect?.target;
            const where =
              target === null || target === undefined
                ? 'nothing'
                : `${target.localName}${Array.from(target.classList, (name) => `.${name}`).join('')}${effect?.pseudoElement ?? ''}`;
            const what =
              animation instanceof CSSTransition
                ? `transition of ${animation.transitionProperty}`
                : animation instanceof CSSAnimation
                  ? `animation ${animation.animationName}`
                  : `animation ${animation.id || 'from a script'}`;
            return `${what} on ${where}`;
          };
          const running = (): Animation[] =>
            document
              .getAnimations()
              .filter(
                (animation) =>
                  animation.playState === 'running' &&
                  animation.effect?.getComputedTiming().iterations !== Infinity,
              );
          return {
            read: (at) => {
              const live = liveVeil();
              const copies = copyVeils();
              const strongest = [...(live === null ? [] : [live]), ...copies].reduce<Veil | null>(
                (stronger, veil) =>
                  stronger === null || veil.strength > stronger.strength ? veil : stronger,
                null,
              );
              const scrollbar = scrollbarOf(
                getComputedStyle(document.documentElement).scrollbarColor,
              );
              return {
                at,
                readAt: Number(document.timeline.currentTime ?? at),
                veil: strongest === null ? null : strongest.strength,
                blur: Math.max(
                  0,
                  ...[...(live === null ? [] : [live]), ...copies].map((veil) => veil.blur),
                ),
                tint: strongest === null ? null : strongest.tint,
                ground: groundOf(),
                track: scrollbar === null ? null : scrollbar.track,
                thumb: scrollbar === null ? null : scrollbar.thumb,
                bars: barsOf(),
              };
            },
            moving: () => running().map(describe),
          };
        };
        let topArea: TopAreaReader | null;
        try {
          topArea = regions.topArea === undefined ? null : topAreaReader(regions.topArea);
        } catch (problem) {
          failedToStart(problem instanceof Error ? problem : new Error(String(problem)));
          return;
        }
        let sampled = 0;
        const channel = new MessageChannel();
        const ended = (): boolean => watch.topAreaRun !== run;
        const end = (): void => {
          watch.topAreaRun += 1;
          channel.port1.close();
        };
        const fail = (problem: string): void => {
          watch.topAreaFailure = problem;
          const stop = watch.topAreaStop;
          end();
          stop?.failed(new Error(problem));
          failedToStart(new Error(problem));
        };
        const stopIfStill = (): void => {
          const stop = watch.topAreaStop;
          if (stop === null || topArea === null) {
            return;
          }
          const moving = topArea.moving();
          stop.quiet = moving.length === 0 ? stop.quiet + 1 : 0;
          if (stop.quiet >= quietFrames) {
            topArea = null;
            stop.settled(frames);
          } else if (moving.length > 0 && performance.now() > stop.deadline) {
            fail(
              `the top of the page was still moving when the probe gave up: ${moving.join(', ')}`,
            );
          }
        };
        const readAll = (at: number, inFrame: boolean): boolean => {
          let read = false;
          if (topArea !== null && !inFrame) {
            frames.push(topArea.read(at));
            read = true;
          }
          for (const [name, reader] of Object.entries(readers)) {
            if (reader.inFrame === inFrame) {
              read = true;
              if (!reader.read(at)) {
                delete readers[name];
              }
            }
          }
          return read;
        };
        const sample = (at: number): void => {
          if (ended()) {
            return;
          }
          const from = performance.now();
          let read: boolean;
          try {
            read = readAll(at, false);
            sampled += 1;
            if (sampled === quietFrames + 1) {
              started();
            }
            stopIfStill();
          } catch (problem) {
            fail(problem instanceof Error ? problem.message : String(problem));
            return;
          }
          if (read) {
            costs.push({ at, from, ms: performance.now() - from, inFrame: false });
          }
          if (ended()) {
            return;
          }
          if (topArea === null && Object.keys(readers).length === 0) {
            if (sampled < quietFrames + 1) {
              started();
            }
            end();
          }
        };
        const nextFrame = (): void => {
          const late = watch.nfnnLateFrames;
          if (late === undefined) {
            requestAnimationFrame(onFrame);
          } else {
            late.read(onFrame);
          }
        };
        channel.port1.onmessage = (message: MessageEvent<number>) => sample(message.data);
        const onFrame = (at: number): void => {
          if (ended()) {
            return;
          }
          const from = performance.now();
          try {
            if (readAll(at, true)) {
              costs.push({ at, from, ms: performance.now() - from, inFrame: true });
            }
          } catch (problem) {
            fail(problem instanceof Error ? problem.message : String(problem));
            return;
          }
          channel.port2.postMessage(at);
          nextFrame();
        };
        nextFrame();
      }),
    { regions, quietFrames: QUIET_FRAMES },
  );
  return { stopWhenStill: () => stopWhenStill(page) };
}

async function stopWhenStill(page: Page): Promise<TopAreaFrame[]> {
  return evaluateAsProbe(
    page,
    (longestMs) =>
      new Promise<TopAreaFrame[]>((settled, failed) => {
        const watch = window as unknown as TopAreaWatch;
        if (watch.topAreaFailure !== null) {
          failed(new Error(watch.topAreaFailure));
          return;
        }
        watch.topAreaStop = {
          quiet: 0,
          deadline: performance.now() + longestMs,
          settled,
          failed,
        };
      }),
    LONGEST_SETTLE_MS,
  );
}

export async function topAreaFramesWhile(
  page: Page,
  act: () => Promise<void>,
  arrived: () => Promise<void>,
): Promise<TopAreaFrame[]> {
  const sampling = await sampleFrames(page);
  await act();
  await arrived();
  return sampling.stopWhenStill();
}

interface Band {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function bandOf(page: Page, name: BandName): Promise<Band> {
  return page.evaluate((underClock) => {
    if (underClock) {
      const clock = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top'),
      );
      if (!(clock > 0)) {
        throw new Error('no --safe-area-top to read the band under the clock');
      }
      return { left: 0, right: document.documentElement.clientWidth, top: 0, bottom: clock };
    }
    const header = document.querySelector('[role="banner"], header');
    if (header === null) {
      throw new Error('no header to read the band under it');
    }
    const box = header.getBoundingClientRect();
    return { left: box.left, right: box.right, top: Math.max(0, box.top), bottom: box.bottom };
  }, name === 'under the clock');
}

interface PanelOver {
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

function panelsOver(page: Page, band: Band): Promise<PanelOver[]> {
  return page.evaluate(
    (under) =>
      Array.from(document.querySelectorAll('dialog[open] .dialog-panel'), (panel) =>
        panel.getBoundingClientRect(),
      )
        .filter((box) => box.top < under.bottom && box.bottom > under.top)
        .map((box) => ({ left: box.left, right: box.right, top: box.top })),
    band,
  );
}

function clearPartOf(band: Band, panels: readonly PanelOver[]): Band | null {
  const beside = widestClearSpan(
    band,
    panels.map((panel): [number, number] => [panel.left, panel.right]),
  );
  if (beside !== null) {
    return beside;
  }
  const above = Math.min(...panels.map((panel) => panel.top)) - BAND_MARGIN_PX;
  return above - band.top < MINIMAL_BAND_HEIGHT_PX ? null : { ...band, bottom: Math.floor(above) };
}

function widestClearSpan(band: Band, covered: readonly [number, number][]): Band | null {
  const edges = [band.left, ...covered.flat(), band.right].sort((one, other) => one - other);
  let widest: [number, number] | null = null;
  for (let index = 0; index + 1 < edges.length; index += 1) {
    const [left, right] = [edges[index], edges[index + 1]];
    const middle = (left + right) / 2;
    const clear = covered.every(([from, to]) => middle < from || middle > to);
    if (clear && right - left > (widest === null ? 0 : widest[1] - widest[0])) {
      widest = [left, right];
    }
  }
  return widest === null || widest[1] - widest[0] < MINIMAL_BAND_PX
    ? null
    : {
        ...band,
        left: Math.ceil(widest[0]) + BAND_MARGIN_PX,
        right: Math.floor(widest[1]) - BAND_MARGIN_PX,
      };
}

async function screensOf(page: Page, shots: readonly string[], band: Band): Promise<ScreenFrame[]> {
  const reader = await page.context().newPage();
  try {
    return await reader.evaluate(
      async ({ pictures, under, viewportWidth }) => {
        const screens: ScreenFrame[] = [];
        for (const picture of pictures) {
          const bytes = Uint8Array.from(atob(picture), (character) => character.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const scale = bitmap.width / viewportWidth;
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context === null) {
            throw new Error('no 2D canvas to read the screencast with');
          }
          context.drawImage(bitmap, 0, 0);
          const left = Math.round(under.left * scale);
          const top = Math.round(under.top * scale);
          const width = Math.round((under.right - under.left) * scale);
          const height = Math.round((under.bottom - under.top) * scale);
          const pixels = context.getImageData(left, top, width, height).data;
          const lightness = (at: number): number =>
            0.2126 * pixels[at] + 0.7152 * pixels[at + 1] + 0.0722 * pixels[at + 2];
          let sum = 0;
          let edges = 0;
          for (let y = 0; y + 1 < height; y += 1) {
            for (let x = 0; x + 1 < width; x += 1) {
              const at = (y * width + x) * 4;
              const here = lightness(at);
              sum += here;
              edges +=
                Math.abs(lightness(at + 4) - here) + Math.abs(lightness(at + width * 4) - here);
            }
          }
          const count = (width - 1) * (height - 1);
          screens.push({ lightness: sum / count, edges: edges / count });
        }
        return screens;
      },
      { pictures: shots, under: band, viewportWidth: page.viewportSize()?.width ?? 0 },
    );
  } finally {
    await reader.close();
  }
}

export async function topAreaWhile(
  page: Page,
  act: () => Promise<void>,
  arrived: () => Promise<void>,
  bandName: BandName = 'under the header',
): Promise<TopArea> {
  const band = await bandOf(page, bandName);
  const coveredBefore = await panelsOver(page, band);
  const screencast = await page.context().newCDPSession(page);
  const shots: string[] = [];
  const shotAt: number[] = [];
  screencast.on('Page.screencastFrame', (shot) => {
    shots.push(shot.data);
    shotAt.push((shot.metadata.timestamp ?? Number.NaN) * 1000);
    screencast
      .send('Page.screencastFrameAck', { sessionId: shot.sessionId })
      .catch(() => undefined);
  });
  const still = async (): Promise<string> =>
    (await screencast.send('Page.captureScreenshot', { format: 'png' })).data;
  try {
    const before = await still();
    await screencast.send('Page.startScreencast', { format: 'png' });
    const frames = await topAreaFramesWhile(page, act, arrived);
    await screencast.send('Page.stopScreencast');
    const after = await still();
    const clear = clearPartOf(band, [...coveredBefore, ...(await panelsOver(page, band))]);
    return {
      frames,
      screens:
        clear === null
          ? []
          : (await screensOf(page, [before, ...shots, after], clear)).map((screen, index) => {
              const at = index === 0 ? undefined : shotAt[index - 1];
              return at === undefined || Number.isNaN(at) ? screen : { ...screen, at };
            }),
    };
  } finally {
    await screencast.detach();
  }
}

function strengthOf(frame: TopAreaFrame): number {
  return frame.veil ?? 0;
}

function framesPassed(from: TopAreaFrame, to: TopAreaFrame): number {
  return Math.max(1, Math.round((to.readAt - from.readAt) / FRAME_MS));
}

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

function veilSteps(frames: readonly TopAreaFrame[], cutsAllowed: boolean): string[] {
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
    const back = Math.sign(travel) * step < -STILL;
    const tooLong = !cutsAllowed && Math.abs(step) > longestStep + STILL;
    if (back || tooLong) {
      jumps.push(
        `the backdrop goes from ${percent(strengthOf(previous) / strongest)} to ${percent(strengthOf(frame) / strongest)} of its strength in frame ${index}, ${Math.round(frame.readAt - previous.readAt)} ms after the previous one`,
      );
    }
  }
  return jumps;
}

export function veilJumps(frames: readonly TopAreaFrame[]): string[] {
  return veilSteps(frames, false);
}

export function veilStepsBack(frames: readonly TopAreaFrame[]): string[] {
  return veilSteps(frames, true);
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
          `the backdrop declares its blur at ${percent(frame.blur)} under a backdrop at ${percent(veil)} of its strength in frame ${index}`,
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

function restingFrame(frames: readonly TopAreaFrame[]): TopAreaFrame {
  const resting = [frames[0], frames[frames.length - 1]].find((frame) => frame.veil === null);
  if (resting === undefined) {
    throw new Error('no frame without a backdrop to read the resting ground from');
  }
  return resting;
}

function hex(colour: Rgb): string {
  return `#${colour.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function apart(one: Rgb, other: Rgb): number {
  return Math.max(...one.map((channel, index) => Math.abs(channel - other[index])));
}

function veiledBy(frame: TopAreaFrame, base: Rgb): Rgb {
  const veil = strengthOf(frame);
  const tint = frame.tint ?? base;
  const under = (channel: number): number =>
    Math.round(base[channel] * (1 - veil) + tint[channel] * veil);
  return [under(0), under(1), under(2)];
}

function stripsDiffer(name: string, strip: Rgb | null, under: Rgb, index: number): string[] {
  return strip !== null && apart(strip, under) > STRIP_TOLERANCE
    ? [
        `the ${name} beside the backdrop is ${hex(strip)} where the page under it is ${hex(under)} in frame ${index}`,
      ]
    : [];
}

export function groundApartLevels(frames: readonly TopAreaFrame[]): number {
  const rest = restingFrame(frames);
  return Math.max(
    0,
    ...frames.map((frame) =>
      frame.ground === null ? 0 : apart(frame.ground, veiledBy(frame, rest.ground)),
    ),
  );
}

export function groundOutOfStep(frames: readonly TopAreaFrame[]): string[] {
  const rest = restingFrame(frames);
  return frames.flatMap((frame, index) =>
    stripsDiffer('ground', frame.ground, veiledBy(frame, rest.ground), index),
  );
}

export function scrollbarOutOfStep(frames: readonly TopAreaFrame[]): string[] {
  const rest = restingFrame(frames);
  return frames.flatMap((frame, index) => {
    const page = veiledBy(frame, rest.ground);
    const previous = index === 0 ? null : frames[index - 1];
    const ownColours =
      frame.thumb === null && apart(page, rest.ground) > STRIP_TOLERANCE
        ? [
            `the scrollbar keeps the browser’s own colours beside a backdrop at ${percent(strengthOf(frame))} in frame ${index}`,
          ]
        : [];
    const switched =
      rest.thumb === null &&
      previous !== null &&
      (previous.thumb === null) !== (frame.thumb === null)
        ? [
            frame.thumb === null
              ? `the scrollbar thumb switches back to the browser’s own colour in frame ${index}`
              : `the scrollbar thumb switches from the browser’s own colour to ${hex(frame.thumb)} in frame ${index}`,
          ]
        : [];
    return [
      ...stripsDiffer(
        'scrollbar track',
        frame.track,
        veiledBy(frame, rest.track ?? rest.ground),
        index,
      ),
      ...(rest.thumb === null
        ? []
        : stripsDiffer('scrollbar thumb', frame.thumb, veiledBy(frame, rest.thumb), index)),
      ...switched,
      ...ownColours,
    ];
  });
}

function lightnessOf([red, green, blue]: Rgb): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function blurMissingUnderHeader({ frames, screens }: TopArea): string[] {
  const veiled = frames.filter((frame) => frame.tint !== null);
  if (veiled.length === 0) {
    return ['no frame has a backdrop to look for its blur under the header'];
  }
  const tint = veiled.reduce((stronger, frame) =>
    strengthOf(frame) > strengthOf(stronger) ? frame : stronger,
  ).tint as Rgb;
  if (screens.length === 0) {
    return ['no screencast frame shows the band under the header'];
  }
  const lightest = Math.max(...screens.map((screen) => screen.lightness));
  const tintLightness = lightnessOf(tint);
  const darkened = screens.map(
    (screen) => (lightest - screen.lightness) / (lightest - tintLightness),
  );
  const darkest = Math.max(...darkened);
  const open = darkened.findLastIndex((darkening) => darkening >= darkest - STILL);
  if (darkened[open] < SHOWN_BACKDROP) {
    return ['the backdrop never darkens the band under the header in the screencast'];
  }
  const resting = darkened
    .map((darkening, index) => ({ darkening, index }))
    .filter(({ darkening }) => darkening < STILL)
    .sort((one, other) => Math.abs(one.index - open) - Math.abs(other.index - open))[0];
  if (resting === undefined) {
    return ['no screencast frame shows the band under the header without the backdrop'];
  }
  const restEdges = screens[resting.index].edges;
  const sharpness = (index: number): number =>
    screens[index].edges / (restEdges * (1 - darkened[index]));
  const openEdges = screens[open].edges;
  const problems =
    sharpness(open) > EDGES_LEFT_UNDER_BLUR
      ? [
          `the header band keeps ${percent(sharpness(open))} of its edges under the whole backdrop in screencast frame ${open}, so its blur does not show`,
        ]
      : [];
  return [
    ...problems,
    ...screens.flatMap((screen, index) => {
      const opacity = darkened[index] / darkened[open];
      const unblurred = restEdges * (1 - darkened[index]);
      const blurred = (1 - opacity) * restEdges + opacity * openEdges;
      if (
        index === open ||
        opacity < OPACITY_WORTH_JUDGING ||
        unblurred - blurred < BLUR_GAP_WORTH_JUDGING * unblurred
      ) {
        return [];
      }
      const shown = (unblurred - screen.edges) / (unblurred - blurred);
      return shown < BLUR_SHARE_SHOWN
        ? [
            `the blur shows at ${percent(Math.max(0, shown))} of its share under a backdrop at ${percent(opacity)} of its strength in screencast frame ${index}`,
          ]
        : [];
    }),
  ];
}

export function bandUnderClockOutOfStep({ frames, screens }: TopArea): string[] {
  const veiled = frames.filter((frame) => frame.tint !== null);
  if (veiled.length === 0 || screens.length < 2) {
    return ['no backdrop or too few screencast frames to read the band under the clock against'];
  }
  const strongest = veiled.reduce((stronger, frame) =>
    strengthOf(frame) > strengthOf(stronger) ? frame : stronger,
  );
  const opening = frames[0].veil === null;
  const rest = (opening ? screens[0] : screens[screens.length - 1]).lightness;
  const tint = lightnessOf(strongest.tint as Rgb);
  const darkened = screens.map((screen) => (rest - screen.lightness) / (rest - tint));
  const darkest = Math.max(...darkened);
  const reached =
    Math.abs(darkest - strengthOf(strongest)) > CLOCK_BAND_TOLERANCE
      ? [
          `the band under the clock darkens to ${percent(darkest)} where the backdrop reaches ${percent(strengthOf(strongest))}`,
        ]
      : [];
  const direction = opening ? 1 : -1;
  return [
    ...reached,
    ...darkened.flatMap((darkening, index) =>
      index > 0 && direction * (darkening - darkened[index - 1]) < -CLOCK_BAND_TOLERANCE
        ? [
            `the band under the clock goes from ${percent(darkened[index - 1])} to ${percent(darkening)} of darkening in screencast frame ${index}, against the backdrop`,
          ]
        : [],
    ),
  ];
}

function groundWayUnderClock(
  screens: readonly ScreenFrame[],
): { share: (screen: ScreenFrame) => number } | string[] {
  if (screens.length < 2) {
    return ['too few screencast frames to follow the ground under the clock'];
  }
  const from = screens[0].lightness;
  const travel = screens[screens.length - 1].lightness - from;
  if (Math.abs(travel) < GROUNDS_TOLD_APART) {
    return [
      `the ground under the clock ends ${Math.round(Math.abs(travel))} of lightness from where it began, too little to follow its way`,
    ];
  }
  return { share: (screen) => (screen.lightness - from) / travel };
}

export const NOT_JUDGED_ANNOTATION = 'nfnn-not-judged';
const GROUND_AT_REST = 0.02;

export function groundNotJudgedOnThisRunner({ screens }: TopArea, fadeMs: number): string | null {
  const way = groundWayUnderClock(screens);
  if (Array.isArray(way)) {
    return null;
  }
  const firstEnd = screens.findIndex((screen) => way.share(screen) >= 1 - GROUND_AT_REST);
  if (firstEnd <= 0) {
    return null;
  }
  const lastRest = screens
    .slice(0, firstEnd)
    .map((screen, index) => ({ screen, index }))
    .filter(({ screen }) => way.share(screen) <= GROUND_AT_REST)
    .at(-1);
  const restAt = lastRest?.screen.at;
  const endAt = screens[firstEnd].at;
  if (
    lastRest === undefined ||
    lastRest.index !== firstEnd - 1 ||
    restAt === undefined ||
    endAt === undefined
  ) {
    return null;
  }
  const gap = endAt - restAt;
  return gap >= fadeMs - FRAME_MS
    ? `the screencast drew no frame for ${Math.round(gap)} ms of a ${fadeMs} ms fade, so the ground's way cannot be judged on this runner`
    : null;
}

export function groundStepsBackUnderClock({ screens }: TopArea): string[] {
  const way = groundWayUnderClock(screens);
  if (Array.isArray(way)) {
    return way;
  }
  return screens.flatMap((screen, index) => {
    const before = index === 0 ? null : way.share(screens[index - 1]);
    return before !== null && way.share(screen) < before - STILL
      ? [
          `the ground under the clock steps back from ${percent(before)} to ${percent(way.share(screen))} of its way in screencast frame ${index}`,
        ]
      : [];
  });
}

export interface GroundMotion {
  readonly curve: readonly number[];
  readonly durationMs: number;
  readonly lagFrames: number;
  readonly carryingMotions: number;
}

function wayAt(motion: GroundMotion, fraction: number): number {
  return 1 - (1 - curveShareAt(motion.curve, fraction)) ** motion.carryingMotions;
}

function curveShareAt(curve: readonly number[], fraction: number): number {
  const [x1, y1, x2, y2] = curve;
  const bezier = (one: number, two: number, t: number): number =>
    3 * (1 - t) * (1 - t) * t * one + 3 * (1 - t) * t * t * two + t * t * t;
  const clamped = Math.min(1, Math.max(0, fraction));
  let low = 0;
  let high = 1;
  for (let step = 0; step < 50; step++) {
    const middle = (low + high) / 2;
    if (bezier(x1, x2, middle) < clamped) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return bezier(y1, y2, (low + high) / 2);
}

export function groundJumpsUnderClock({ screens }: TopArea, motion?: GroundMotion): string[] {
  const way = groundWayUnderClock(screens);
  if (Array.isArray(way)) {
    return way;
  }
  const share = way.share;
  const moving = (index: number): boolean =>
    index > 0 && Math.abs(share(screens[index]) - share(screens[index - 1])) > STILL;
  const framesBetween = (earlier: ScreenFrame, later: ScreenFrame): number =>
    earlier.at === undefined || later.at === undefined
      ? 1
      : Math.max(1, Math.round((later.at - earlier.at) / FRAME_MS));
  const fromRestAllows = (earlier: ScreenFrame, later: ScreenFrame): number | null =>
    motion === undefined || earlier.at === undefined || later.at === undefined
      ? null
      : wayAt(
          motion,
          (later.at - earlier.at + (LATE_FRAME_PAST_THE_STEADY_ONE + motion.lagFrames) * FRAME_MS) /
            motion.durationMs,
        );
  return screens.flatMap((screen, index) => {
    if (index === 0) {
      return [];
    }
    const previous = screens[index - 1];
    const step = Math.abs(share(screen) - share(previous));
    const allowed = moving(index - 1) ? null : fromRestAllows(previous, screen);
    const jumps = moving(index - 1)
      ? step / framesBetween(previous, screen) > LONGEST_GROUND_SHARE_PER_FRAME
      : step > (allowed === null ? LONGEST_GROUND_SHARE_FROM_REST : allowed + STILL);
    if (!jumps) {
      return [];
    }
    const gap =
      previous.at === undefined || screen.at === undefined
        ? ''
        : `, ${Math.round(screen.at - previous.at)} ms after the frame before`;
    const curve =
      allowed === null || motion === undefined
        ? ''
        : `, more than the ${percent(allowed)} its curve reaches in that time${motion.carryingMotions > 1 ? ` with ${motion.carryingMotions} motions on it at once` : ''} and ${LATE_FRAME_PAST_THE_STEADY_ONE} steady frames plus the stamp lag of ${motion.lagFrames.toFixed(2)}`;
    return [
      `the ground under the clock goes from ${percent(share(previous))} to ${percent(share(screen))} of its way in screencast frame ${index}${gap}${curve}`,
    ];
  });
}
