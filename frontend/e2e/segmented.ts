import { Locator } from '@playwright/test';
import { expect } from './fixtures';

export interface SegmentLayout {
  leftShare: number;
  widthShare: number;
  labelOffCentre: number;
  labelTop: number;
  labelLines: number;
  weight: string;
}

export function segmentLayouts(segments: Locator): Promise<SegmentLayout[]> {
  return segments.evaluateAll((buttons) => {
    const boxes = buttons.map((button) => button.getBoundingClientRect());
    const start = Math.min(...boxes.map((box) => box.left));
    const span = Math.max(...boxes.map((box) => box.right)) - start;
    return buttons.map((button, index) => {
      const box = boxes[index];
      const range = document.createRange();
      range.selectNodeContents(button);
      const lines = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
      const left = Math.min(...lines.map((rect) => rect.left));
      const right = Math.max(...lines.map((rect) => rect.right));
      return {
        leftShare: ((box.left - start) / span) * 100,
        widthShare: (box.width / span) * 100,
        labelOffCentre: (left + right) / 2 - (box.left + box.width / 2),
        labelTop: Math.min(...lines.map((rect) => rect.top)) - box.top,
        labelLines: new Set(lines.map((rect) => Math.round(rect.top))).size,
        weight: getComputedStyle(button).fontWeight,
      };
    });
  });
}

export function themeWeights(segments: Locator): Promise<{ regular: string; semibold: string }> {
  return segments.first().evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      regular: root.getPropertyValue('--weight-regular').trim(),
      semibold: root.getPropertyValue('--weight-semibold').trim(),
    };
  });
}

export function withoutWeight(layouts: SegmentLayout[]): Omit<SegmentLayout, 'weight'>[] {
  return layouts.map(({ leftShare, widthShare, labelOffCentre, labelTop, labelLines }) => ({
    leftShare: Math.round(leftShare * 10) / 10,
    widthShare: Math.round(widthShare * 10) / 10,
    labelOffCentre: Math.round(labelOffCentre) || 0,
    labelTop: Math.round(labelTop) || 0,
    labelLines,
  }));
}

interface EdgeWatch {
  thumbEdges: [number, number][];
  thumbWatched: boolean;
}

const WATCHED_MS = 1500;

export async function thumbEdgesWhile(
  thumb: Locator,
  press: () => Promise<void>,
): Promise<{ start: [number, number]; frames: [number, number][] }> {
  const start = await thumb.evaluate((element): [number, number] => {
    const box = element.getBoundingClientRect();
    return [box.left, box.right];
  });
  await thumb.evaluate((element, watchedMs) => {
    const watch = window as unknown as EdgeWatch;
    watch.thumbEdges = [];
    watch.thumbWatched = false;
    const began = performance.now();
    const sample = (): void => {
      const box = element.getBoundingClientRect();
      watch.thumbEdges.push([box.left, box.right]);
      if (performance.now() - began < watchedMs) {
        requestAnimationFrame(sample);
      } else {
        watch.thumbWatched = true;
      }
    };
    requestAnimationFrame(sample);
  }, WATCHED_MS);
  await press();
  await expect
    .poll(() => thumb.evaluate(() => (window as unknown as EdgeWatch).thumbWatched))
    .toBe(true);
  const frames = await thumb.evaluate(() => (window as unknown as EdgeWatch).thumbEdges);
  return { start, frames };
}

export function jumpsOfTheEdges(start: [number, number], frames: [number, number][]): string[] {
  const jumps: string[] = [];
  for (const [edge, name] of [
    [0, 'left'],
    [1, 'right'],
  ] as const) {
    const target = frames[frames.length - 1][edge];
    const travel = target - start[edge];
    let previous = start[edge];
    for (const [index, frame] of frames.entries()) {
      const step = frame[edge] - previous;
      if (Math.sign(travel) * step < -1 || Math.abs(step) > Math.abs(travel) * 0.4 + 1) {
        jumps.push(
          `${name} edge ${Math.round(previous)} → ${Math.round(frame[edge])} in frame ${index}`,
        );
      }
      if (Math.abs(frame[edge] - target) < 1) {
        break;
      }
      previous = frame[edge];
    }
  }
  return jumps;
}

export function highlightColours(locator: Locator): Promise<{ background: string; text: string }> {
  return locator.evaluate((element) => {
    const probe = element.ownerDocument.createElement('span');
    probe.style.cssText = 'forced-color-adjust: none; background: Highlight; color: HighlightText';
    element.ownerDocument.body.append(probe);
    const style = getComputedStyle(probe);
    const colours = { background: style.backgroundColor, text: style.color };
    probe.remove();
    return colours;
  });
}

export interface PillBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SegmentContrasts {
  thumbRests: boolean;
  thumbOnTrack: number;
  textOnThumb: number;
  edgeOnTrack: number;
  pill: PillBox;
}

export function segmentContrasts(group: Locator): Promise<SegmentContrasts> {
  return group.evaluate((element) => {
    const chosenSelector =
      ":scope > button:is(.is-active, [aria-checked='true'], [aria-pressed='true'])";
    const canvas = element.ownerDocument.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('no 2D canvas to composite the colours on');
    }
    const painted = (layers: string[]): number[] => {
      context.clearRect(0, 0, 1, 1);
      for (const layer of layers) {
        context.fillStyle = layer;
        context.fillRect(0, 0, 1, 1);
      }
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const canvasColour = (): string => {
      const probe = element.ownerDocument.createElement('span');
      probe.style.background = 'Canvas';
      element.ownerDocument.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    };
    const backdrop = (from: Element): string[] => {
      const layers: string[] = [];
      for (let at: Element | null = from; at !== null; at = at.parentElement) {
        const colour = getComputedStyle(at).backgroundColor;
        layers.unshift(colour);
        if (painted([colour])[3] === 255) {
          return layers;
        }
      }
      return [canvasColour(), ...layers];
    };
    const luminance = (rgba: number[]): number => {
      const [r, g, b] = rgba.slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (one: number[], other: number[]): number => {
      const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a);
      return (light + 0.05) / (dark + 0.05);
    };
    const insetEdge = (shadow: string): string => {
      const layer = shadow.split(/,(?![^(]*\))/).find((each) => /\binset\b/.test(each));
      return layer?.trim().match(/^(rgba?\([^)]*\)|color\([^)]*\))/)?.[1] ?? 'transparent';
    };

    const thumbRests = element.classList.contains('ui-segmented--thumb');
    const chosen = element.querySelector(chosenSelector);
    const pill = thumbRests ? element.querySelector(':scope > .ui-segmented__thumb') : chosen;
    if (chosen === null || pill === null) {
      throw new Error('no chosen segment to measure');
    }
    const pillStyle = getComputedStyle(pill);
    const trackLayers = backdrop(element);
    const thumbLayers = [...trackLayers, pillStyle.backgroundColor];
    const track = painted(trackLayers);
    const thumb = painted(thumbLayers);
    const edge = painted([...thumbLayers, insetEdge(pillStyle.boxShadow)]);
    const text = painted([...thumbLayers, getComputedStyle(chosen).color]);
    const box = pill.getBoundingClientRect();
    return {
      thumbRests,
      thumbOnTrack: contrast(thumb, track),
      textOnThumb: contrast(text, thumb),
      edgeOnTrack: contrast(edge, track),
      pill: { left: box.left, top: box.top, width: box.width, height: box.height },
    };
  });
}

export async function wrapSegments(group: Locator): Promise<void> {
  await group.evaluate((element: HTMLElement) => (element.style.width = 'min-content'));
  await expect
    .poll(() =>
      group.evaluate(
        (element) =>
          !element.classList.contains('ui-segmented--thumb') &&
          element
            .getAnimations({ subtree: true })
            .every((animation) => animation.playState !== 'running'),
      ),
    )
    .toBe(true);
}
