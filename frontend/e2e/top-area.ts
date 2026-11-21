import { Page } from '@playwright/test';

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
}

export interface TopArea {
  readonly frames: TopAreaFrame[];
  readonly screens: ScreenFrame[];
}

export interface TopAreaFrame {
  readonly at: number;
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

interface TopAreaWatch {
  topAreaRun: number;
  topAreaFrames: TopAreaFrame[];
  topAreaFailure: string | null;
  topAreaStop: TopAreaStop | null;
  nfnnLateFrames?: LateFrames;
}

export interface SampledRegions {
  readonly glass: string;
  readonly glassCopies: string;
  readonly veilCopies: string;
  readonly pagesOver: string;
}

export const TOP_AREA_REGIONS: SampledRegions = {
  glass: 'app-root .ui-glass',
  glassCopies: '.page-transition .ui-glass, .page-fade .ui-glass',
  veilCopies: '.page-transition__sheet-backdrop, .page-transition__sheet > dialog',
  pagesOver: '.page-transition__page--over',
};

export interface FrameSampling {
  stopWhenStill(): Promise<TopAreaFrame[]>;
}

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
const SHOWN_BACKDROP = 0.1;
const OPACITY_WORTH_JUDGING = 0.25;
const BLUR_SHARE_SHOWN = 0.5;
const BLUR_GAP_WORTH_JUDGING = 0.1;
const EDGES_LEFT_UNDER_BLUR = 0.5;
const CLOCK_BAND_TOLERANCE = 0.1;

export async function sampleFrames(
  page: Page,
  regions: SampledRegions = TOP_AREA_REGIONS,
): Promise<FrameSampling> {
  await page.evaluate(
    ({ regions, quietFrames }) =>
      new Promise<void>((started, failedToStart) => {
        const watch = window as unknown as TopAreaWatch;
        watch.topAreaRun = (watch.topAreaRun ?? 0) + 1;
        watch.topAreaFailure = null;
        watch.topAreaStop = null;
        const run = watch.topAreaRun;
        const frames: TopAreaFrame[] = [];
        watch.topAreaFrames = frames;
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context === null) {
          failedToStart(new Error('no 2D canvas to read the colours with'));
          return;
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
        const liveVeil = (): Veil | null => {
          const modals = document.querySelectorAll('dialog:modal');
          if (modals.length === 0) {
            return null;
          }
          const dialog = modals[modals.length - 1];
          const own = getComputedStyle(dialog);
          const behind = getComputedStyle(dialog, '::backdrop');
          const [red, green, blue, alpha] = painted(own.backgroundColor);
          return {
            strength: alpha * ownShare(own),
            blur:
              backdropFilterOf(own) !== 'none'
                ? ownShare(own)
                : backdropFilterOf(behind) !== 'none'
                  ? ownShare(own) * Number(behind.opacity)
                  : 0,
            tint: [red, green, blue],
          };
        };
        const point = { x: innerWidth / 2, y: 1 };
        const coversPoint = (element: Element): boolean => {
          const box = element.getBoundingClientRect();
          return (
            box.left <= point.x && point.x < box.right && box.top <= point.y && point.y < box.bottom
          );
        };
        const pageAbove = (copy: Element): boolean => {
          const stack = document.elementsFromPoint(point.x, point.y);
          return Array.from(document.querySelectorAll(regions.pagesOver)).some(
            (over) =>
              !over.contains(copy) &&
              (copy.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
              (stack.some((element) => over.contains(element)) ||
                (coversPoint(over) && shownShare(over) > 0)),
          );
        };
        const copyVeils = (): Veil[] =>
          Array.from(document.querySelectorAll(regions.veilCopies))
            .filter((copy) => coversPoint(copy) && !pageAbove(copy))
            .map((copy) => {
              const style = getComputedStyle(copy);
              const share = shownShare(copy);
              const [red, green, blue, alpha] = painted(style.backgroundColor);
              return {
                strength: alpha * share,
                blur: backdropFilterOf(style) !== 'none' ? share : 0,
                tint: [red, green, blue],
              };
            });
        const barsOf = (): BarLook[] => {
          const named = new Map<string, Element[]>();
          for (const bar of document.querySelectorAll(`${regions.glass}, ${regions.glassCopies}`)) {
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
          if (stop === null) {
            return;
          }
          const moving = running();
          stop.quiet = moving.length === 0 ? stop.quiet + 1 : 0;
          if (stop.quiet >= quietFrames) {
            end();
            stop.settled(frames);
          } else if (moving.length > 0 && performance.now() > stop.deadline) {
            fail(
              `the top of the page was still moving when the probe gave up: ${moving.map(describe).join(', ')}`,
            );
          }
        };
        const sample = (at: number): void => {
          if (ended()) {
            return;
          }
          try {
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
            frames.push({
              at,
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
            });
            if (frames.length === quietFrames + 1) {
              started();
            }
            stopIfStill();
          } catch (problem) {
            fail(problem instanceof Error ? problem.message : String(problem));
            return;
          }
          if (!ended()) {
            nextFrame();
          }
        };
        const nextFrame = (): void => {
          const late = watch.nfnnLateFrames;
          if (late === undefined) {
            requestAnimationFrame(afterPaint);
          } else {
            late.read(sample);
          }
        };
        channel.port1.onmessage = (message: MessageEvent<number>) => sample(message.data);
        const afterPaint = (at: number): void => {
          if (!ended()) {
            channel.port2.postMessage(at);
          }
        };
        nextFrame();
      }),
    { regions, quietFrames: QUIET_FRAMES },
  );
  return { stopWhenStill: () => stopWhenStill(page) };
}

async function stopWhenStill(page: Page): Promise<TopAreaFrame[]> {
  return page.evaluate(
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

function panelsOver(page: Page, band: Band): Promise<[number, number][]> {
  return page.evaluate(
    (under) =>
      Array.from(document.querySelectorAll('dialog[open] .dialog-panel'), (panel) =>
        panel.getBoundingClientRect(),
      )
        .filter((box) => box.top < under.bottom && box.bottom > under.top)
        .map((box): [number, number] => [box.left, box.right]),
    band,
  );
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
  screencast.on('Page.screencastFrame', (shot) => {
    shots.push(shot.data);
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
    const clear = widestClearSpan(band, [...coveredBefore, ...(await panelsOver(page, band))]);
    return {
      frames,
      screens: clear === null ? [] : await screensOf(page, [before, ...shots, after], clear),
    };
  } finally {
    await screencast.detach();
  }
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
        `the backdrop goes from ${percent(strengthOf(previous) / strongest)} to ${percent(strengthOf(frame) / strongest)} of its strength in frame ${index}, ${Math.round(frame.at - previous.at)} ms after the previous one`,
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
