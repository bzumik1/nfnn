import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const STATUS_BAR = 62;
const WIDTH = 390;
const MEASURED_ROWS = 220;
const SHARP_FROM_ROW = 180;

const HOME_SCREEN_TOP = `:root { --safe-area-top: ${STATUS_BAR}px !important; }`;
const FINE_STRIPES = `
  body::after {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 50;
    pointer-events: none;
    background: repeating-linear-gradient(90deg, #000 0 2px, #fff 2px 4px);
  }
  main { min-height: 300vh; }
`;

async function sharpnessByRow(context: BrowserContext, png: Buffer): Promise<number[]> {
  const reader = await context.newPage();
  try {
    return await reader.evaluate(
      async ({ data, rows }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const drawing = canvas.getContext('2d')!;
        drawing.drawImage(image, 0, 0);
        const pixels = drawing.getImageData(0, 0, image.width, rows).data;
        const light = (x: number, y: number) => {
          const at = (y * image.width + x) * 4;
          return (pixels[at]! + pixels[at + 1]! + pixels[at + 2]!) / 3;
        };
        return Array.from({ length: rows }, (_, y) => {
          let change = 0;
          for (let x = 1; x < image.width; x++) {
            change += Math.abs(light(x, y) - light(x - 1, y));
          }
          return change / (image.width - 1) / 255;
        });
      },
      { data: png.toString('base64'), rows: MEASURED_ROWS },
    );
  } finally {
    await reader.close();
  }
}

function softness(sharpness: number[]): { full: number; rows: number } {
  const below = sharpness.slice(SHARP_FROM_ROW).sort((a, b) => a - b);
  const full = below[Math.floor(below.length / 2)]!;
  const firstRow = (share: number) => sharpness.findIndex((value) => value >= full * share);
  return { full, rows: firstRow(0.9) - firstRow(0.1) };
}

async function scrolledUnderTheEdge(page: Page, path: string): Promise<number> {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.addStyleTag({ content: HOME_SCREEN_TOP + FINE_STRIPES });
  await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
  await expect
    .poll(() =>
      page
        .getByRole('banner')
        .evaluate((header) => Number(getComputedStyle(header, '::after').opacity)),
    )
    .toBe(1);
  return page.evaluate(() =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--scroll-edge-fade'),
    ),
  );
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const { name, path } of [
    { name: 'O nás', path: '/o-nas' },
    { name: 'Aktuality', path: '/aktuality' },
  ]) {
    test.describe(`Given ${name} in the app opened from an iPhone's home screen, in the ${colorScheme} appearance`, () => {
      test.use({ colorScheme, viewport: { width: WIDTH, height: 844 } });

      test('when the page scrolls up under the status bar, then what passes under the edge sharpens gradually, with no hard edge where the blur ends', async ({
        page,
        context,
      }) => {
        const fade = await scrolledUnderTheEdge(page, path);

        const shot = await page.screenshot({
          clip: { x: 0, y: 0, width: WIDTH, height: MEASURED_ROWS },
          animations: 'disabled',
        });
        const { full, rows } = softness(await sharpnessByRow(context, shot));

        expect(full, 'the stripes under the edge are not measurable').toBeGreaterThan(0.25);
        expect(rows, 'the blur ends in a hard edge').toBeGreaterThanOrEqual(fade / 2);
      });
    });
  }
}
