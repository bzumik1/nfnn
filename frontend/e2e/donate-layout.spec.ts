import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, noDonations, rememberedDonorSession } from './donor-session';

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const FACE_IN_DONATE_PHOTO: Box = { left: 0.46, right: 0.66, top: 0.18, bottom: 0.6 };

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

async function ibanLines(page: Page): Promise<string[]> {
  const value = page.locator('.bank-row', { hasText: 'IBAN' }).locator('.bank-value');
  await expect(value).toBeVisible();
  return ibanLinesOf(value);
}

async function ibanLinesOf(value: Locator): Promise<string[]> {
  await value.page().evaluate(() => document.fonts.ready);
  return value.evaluate((element) => {
    const lines = new Map<number, string>();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      for (let index = 0; index < text.length; index++) {
        if (text[index].trim() === '') {
          continue;
        }
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const top = Math.round(range.getBoundingClientRect().top);
        lines.set(top, (lines.get(top) ?? '') + text[index]);
      }
    }
    return [...lines.entries()].sort(([a], [b]) => a - b).map(([, characters]) => characters);
  });
}

test.describe('Given the bank details on Přispět', () => {
  for (const [width, height] of [
    [320, 640],
    [375, 667],
    [390, 844],
    [820, 1180],
    [874, 402],
    [1024, 768],
    [1280, 900],
  ]) {
    test(`when they show at ${width} × ${height}, then the IBAN stands on one line or breaks only in its middle, three groups of four to a line`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/prispet');

      const lines = await ibanLines(page);

      expect(lines.join(' / ')).toMatch(
        /^(CZ2620100000005544332217|CZ2620100000 \/ 005544332217)$/,
      );
      await expect(
        page.locator('.bank-row', { hasText: 'IBAN' }).locator('.bank-value'),
      ).toHaveText('CZ26 2010 0000 0055 4433 2217');
    });
  }
});

test.describe("Given the bank details in the portal's Poslat dar", () => {
  for (const root of ['16px', '17px']) {
    test(`when a phone from 320 to 430 px wide shows them with a root of ${root}, then the IBAN stands on one line or breaks only in its middle, three groups of four to a line`, async ({
      page,
    }) => {
      await mockDonorApi(page, noDonations);
      await rememberedDonorSession(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('/darce/prehled');
      await expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeVisible();
      await page.addStyleTag({ content: `html { font-size: ${root}; }` });
      const value = page
        .locator('.send-gift .bank-row', { hasText: 'IBAN' })
        .locator('.bank-value');
      const found: string[] = [];

      for (let width = 320; width <= 430; width++) {
        await page.setViewportSize({ width, height: 800 });
        await expect(value).toBeVisible();
        const lines = await ibanLinesOf(value);
        if (!/^(CZ2620100000005544332217|CZ2620100000 \/ 005544332217)$/.test(lines.join(' / '))) {
          found.push(`${width} px: ${lines.join(' / ')}`);
        }
      }

      expect(found).toEqual([]);
    });
  }
});

test.describe('Given the photo beside the bank details on a tablet or a computer', () => {
  for (const [width, height] of [
    [820, 1180],
    [1024, 768],
    [1180, 820],
    [1280, 900],
    [1440, 800],
  ]) {
    test(`when Přispět opens at ${width} × ${height}, then the quote card keeps clear of the child's face`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/prispet');
      const photo = page.locator('#prispet img[src^="/images/donate-"]');
      await expect(photo).toBeVisible();
      await photo.evaluate((image: HTMLImageElement) => image.decode());

      const { face, card } = await photo.evaluate((image: HTMLImageElement, faceInPhoto) => {
        const frame = image.getBoundingClientRect();
        const [x, y] = getComputedStyle(image)
          .objectPosition.split(' ')
          .map((part) => parseFloat(part) / 100);
        const scale = Math.max(
          frame.width / image.naturalWidth,
          frame.height / image.naturalHeight,
        );
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        const left = frame.left + (frame.width - width) * x;
        const top = frame.top + (frame.height - height) * y;
        const quote = [...document.querySelectorAll('#prispet p')]
          .find((paragraph) => paragraph.textContent?.includes('Bez vaší pomoci'))!
          .parentElement!.getBoundingClientRect();
        return {
          face: {
            left: left + faceInPhoto.left * width,
            right: left + faceInPhoto.right * width,
            top: top + faceInPhoto.top * height,
            bottom: top + faceInPhoto.bottom * height,
          },
          card: { left: quote.left, right: quote.right, top: quote.top, bottom: quote.bottom },
        };
      }, FACE_IN_DONATE_PHOTO);

      expect(overlaps(card, face)).toBe(false);
    });
  }
});

async function openPrispet(page: Page): Promise<void> {
  await page.goto('/prispet');
}

async function openSendGift(page: Page): Promise<void> {
  await mockDonorApi(page);
  await rememberedDonorSession(page);
  await page.goto('/darce/prehled');
}

test.describe('Given forced colours', () => {
  test.use({ forcedColors: 'active' });

  for (const [place, open] of [
    ['Přispět', openPrispet],
    ['Poslat dar', openSendGift],
  ] as const) {
    test(`when ${place} shows the amounts, then the chosen one stands out in the highlight colours`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await open(page);
      const chosen = page.getByRole('radio', { name: '500 Kč', checked: true });
      const other = page.getByRole('radio', { name: '1 000 Kč', checked: false });
      await expect(chosen).toBeVisible();

      const coloursOf = (button: typeof chosen) =>
        button.evaluate((element) => {
          const style = getComputedStyle(element);
          return { background: style.backgroundColor, text: style.color };
        });
      const highlight = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.cssText =
          'forced-color-adjust: none; background: Highlight; color: HighlightText';
        document.body.append(probe);
        const style = getComputedStyle(probe);
        const colours = { background: style.backgroundColor, text: style.color };
        probe.remove();
        return colours;
      });

      expect(await coloursOf(chosen)).toEqual(highlight);
      expect((await coloursOf(other)).background).not.toBe(highlight.background);
    });
  }
});

const PIXEL_TOLERANCE = 1;

async function textStart(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        const index = text.search(/\S/);
        if (index >= 0) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          return range.getBoundingClientRect().left;
        }
      }
      return Number.NaN;
    });
}

async function capTop(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        const index = text.search(/\S/);
        if (index < 0) {
          continue;
        }
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const style = getComputedStyle(node.parentElement!);
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const metrics = context.measureText('H');
        return (
          range.getBoundingClientRect().top +
          metrics.fontBoundingBoxAscent -
          metrics.actualBoundingBoxAscent
        );
      }
      return Number.NaN;
    });
}

async function openPrispetAt(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/prispet');
  await expect(page.locator('.bank-row', { hasText: 'IBAN' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test.describe('Given the payment details on Přispět', () => {
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [1280, 900],
  ]) {
    test(`when they show at ${width} × ${height} to a visitor who is not signed in, then the bank details, the receipt note and the other device's box start their text on one left edge`, async ({
      page,
    }) => {
      await openPrispetAt(page, width, height);

      const bank = await textStart(page, '.bank .panel-label');
      const note = await textStart(page, '.bank-receipt-note');
      expect(Math.abs(note - bank)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      if (width < 900) {
        const otherDevice = await textStart(page, '.other-device-title');
        expect(Math.abs(otherDevice - bank)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      }
    });
  }

  for (const [width, height] of [
    [375, 667],
    [390, 844],
  ]) {
    test(`when Bankovní spojení stacks its rows at ${width} × ${height}, then Kopírovat makes no row taller than its label and value`, async ({
      page,
    }) => {
      await openPrispetAt(page, width, height);

      const rows = await page.locator('.bank-row').evaluateAll((elements) =>
        elements.map((row) => {
          const box = row.getBoundingClientRect();
          const key = row.querySelector('.bank-key')!.getBoundingClientRect();
          const value = row.querySelector('.bank-value')!.getBoundingClientRect();
          return { above: key.top - box.top, below: box.bottom - value.bottom };
        }),
      );

      expect(rows.length).toBeGreaterThan(1);
      for (const row of rows) {
        expect(Math.abs(row.above)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
        expect(Math.abs(row.below)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      }
    });
  }

  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [820, 1180],
    [900, 800],
    [1024, 768],
    [1100, 800],
  ]) {
    test(`when the amounts show at ${width} × ${height}, then they stand two by two`, async ({
      page,
    }) => {
      await openPrispetAt(page, width, height);

      const tops = await page
        .locator('.amount-options > *')
        .evaluateAll((options) => options.map((option) => option.getBoundingClientRect().top));
      const rows = new Map<number, number>();
      for (const top of tops) {
        const row = [...rows.keys()].find((known) => Math.abs(known - top) <= PIXEL_TOLERANCE);
        rows.set(row ?? top, (rows.get(row ?? top) ?? 0) + 1);
      }

      expect([...rows.values()]).toEqual([2, 2]);
    });
  }

  for (const [width, height] of [
    [900, 800],
    [1000, 800],
    [1100, 800],
  ]) {
    test(`when a computer shows Přispět at ${width} × ${height}, then the payment column takes three parts to the other column's two and the IBAN stands on one line`, async ({
      page,
    }) => {
      await openPrispetAt(page, width, height);

      const start = (await page.locator('.pay-start').boundingBox())!;
      const details = (await page.locator('.pay-details').boundingBox())!;

      expect(details.width / start.width).toBeCloseTo(1.5, 1);
      expect(await ibanLines(page)).toHaveLength(1);
    });
  }

  for (const [width, height] of [
    [1000, 800],
    [1100, 800],
  ]) {
    test(`when a computer shows Přispět at ${width} × ${height}, then each bank row keeps its label and its value on one line`, async ({
      page,
    }) => {
      await openPrispetAt(page, width, height);

      const offsets = await page.locator('.bank-row').evaluateAll((rows) =>
        rows.map((row) => {
          const key = row.querySelector('.bank-key')!.getBoundingClientRect();
          const value = row.querySelector('.bank-value')!.getBoundingClientRect();
          return Math.abs(key.top + key.height / 2 - (value.top + value.height / 2));
        }),
      );

      for (const offset of offsets) {
        expect(offset).toBeLessThanOrEqual(2);
      }
    });
  }

  for (const width of [1920, 2560]) {
    test(`when a window ${width} px wide shows Přispět, then the title starts on the logo's line and the bank details end on the header's right edge, the columns even`, async ({
      page,
    }) => {
      await openPrispetAt(page, width, 1000);

      const logo = (await page.locator('app-header .brand img').boundingBox())!;
      const headerRight = await page
        .locator('app-header .app-header-inner')
        .evaluate(
          (inner) =>
            inner.getBoundingClientRect().right - parseFloat(getComputedStyle(inner).paddingRight),
        );
      const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
      const bank = (await page.locator('.bank').boundingBox())!;
      const start = (await page.locator('.pay-start').boundingBox())!;
      const details = (await page.locator('.pay-details').boundingBox())!;

      expect(Math.abs(title.x - logo.x)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(Math.abs(bank.x + bank.width - headerRight)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(Math.abs(details.width - start.width)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    });
  }

  for (const [width, height] of [
    [1024, 768],
    [1280, 900],
    [1920, 1000],
  ]) {
    test(`when a computer shows Přispět at ${width} × ${height}, then the capitals of Zaplaťte start level with the capitals of the title`, async ({
      page,
    }) => {
      await openPrispetAt(page, width, height);

      const title = await capTop(page, 'h1');
      const step = await capTop(page, '.pay-details .step-title');

      expect(Math.abs(step - title)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    });
  }

  for (const root of ['34px', '53px']) {
    test(`when an iPad on its side shows Přispět with a root of ${root}, then the IBAN breaks only between its groups of four, never overflows its box and never reaches under Kopírovat`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1180, height: 820 });
      await page.goto('/prispet');
      await page.addStyleTag({ content: `html { font-size: ${root}; }` });
      const row = page.locator('.bank-row', { hasText: 'IBAN' });
      await expect(row).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      for (const line of await ibanLines(page)) {
        expect(line.length % 4, line).toBe(0);
      }
      const clashes = await row.evaluate((element) => {
        const bank = element.closest('.bank')!.getBoundingClientRect();
        const copy = element.querySelector('app-copy-button button')!.getBoundingClientRect();
        const value = element.querySelector('.bank-value')!;
        const found: string[] = [];
        const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? '';
          for (let index = 0; index < text.length; index++) {
            if (text[index].trim() === '') {
              continue;
            }
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + 1);
            const glyph = range.getBoundingClientRect();
            if (glyph.left < bank.left || glyph.right > bank.right) {
              found.push(`${text[index]} outside the box`);
            }
            if (
              glyph.left < copy.right &&
              copy.left < glyph.right &&
              glyph.top < copy.bottom &&
              copy.top < glyph.bottom
            ) {
              found.push(`${text[index]} under Kopírovat`);
            }
          }
        }
        return found;
      });

      expect(clashes).toEqual([]);
    });
  }
});

for (const screen of [
  { name: 'a window 900 px wide', width: 900, height: 700, root: null },
  { name: 'a phone with the tab bar', width: 390, height: 844, root: null },
  { name: 'an iPad Pro 11" upright with a keyboard', width: 834, height: 1194, root: null },
  { name: 'the home-screen app with a root of 34 px', width: 834, height: 1194, root: '34px' },
]) {
  test.describe(`Given a visitor on ${screen.name} who moves through Přispět with the keyboard`, () => {
    test.use({ viewport: { width: screen.width, height: screen.height } });

    test('when Tab reaches Uložit QR kód and every Kopírovat, then each stands wholly above the tab bar', async ({
      page,
    }) => {
      await page.goto('/prispet');
      if (screen.root !== null) {
        await page.addStyleTag({ content: `html { font-size: ${screen.root}; }` });
      }
      await expect(page.locator('.bank-row', { hasText: 'IBAN' })).toBeVisible();
      const covered: string[] = [];
      let copies = 0;

      for (let step = 0; step < 150; step++) {
        await page.keyboard.press('Tab');
        const focus = await page.evaluate(() => {
          const focused = document.activeElement;
          const bar = document.querySelector('app-tab-bar nav');
          if (focused === null || (bar !== null && bar.contains(focused))) {
            return { inBar: true, name: '', hidden: false };
          }
          const box = focused.getBoundingClientRect();
          const barBox = bar?.getBoundingClientRect();
          const barTop =
            barBox === undefined || barBox.height === 0 ? window.innerHeight : barBox.top;
          return {
            inBar: false,
            name: focused.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            hidden: box.top < 0 || box.bottom > Math.min(barTop, window.innerHeight),
          };
        });
        if (focus.inBar) {
          break;
        }
        const watched = focus.name.startsWith('Kopírovat') || focus.name === 'Uložit QR kód';
        if (focus.name.startsWith('Kopírovat')) {
          copies++;
        }
        if (watched && focus.hidden) {
          covered.push(focus.name);
        }
      }

      expect(copies).toBeGreaterThanOrEqual(3);
      expect(covered).toEqual([]);
    });
  });
}
