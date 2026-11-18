import { Locator } from '@playwright/test';

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
