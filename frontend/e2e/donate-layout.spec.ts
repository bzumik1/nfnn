import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, rememberedDonorSession } from './donor-session';

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
  await page.evaluate(() => document.fonts.ready);
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
      const chosen = page.getByRole('button', { name: '500 Kč', pressed: true });
      const other = page.getByRole('button', { name: '1 000 Kč', pressed: false });
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
