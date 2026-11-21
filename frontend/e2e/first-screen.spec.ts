import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { waitWhileNothingMayHappen } from './fixed-waits';

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const FACE_IN_HERO_PHOTO: Box = { left: 0.43, right: 0.59, top: 0.19, bottom: 0.52 };
const FACE_DOWN_TO_THE_MOUTH: Box = { ...FACE_IN_HERO_PHOTO, bottom: 0.45 };
const COMPUTER_FROM_WIDTH = 900;

function faceOn(screen: { width: number }): Box {
  return screen.width >= COMPUTER_FROM_WIDTH ? FACE_IN_HERO_PHOTO : FACE_DOWN_TO_THE_MOUTH;
}

const DESKTOP_SCREENS = [
  { name: 'a MacBook', width: 1440, height: 900 },
  { name: 'a full HD monitor', width: 1920, height: 1080 },
  { name: 'an ultrawide monitor', width: 2560, height: 1080 },
  { name: 'a 1440p monitor', width: 2560, height: 1440 },
];

const NORMAL_TEXT_CONTRAST = 4.5;

const SCREENS = [
  { name: 'an iPhone upright', width: 390, height: 844 },
  { name: 'an iPhone Pro upright in Safari', width: 402, height: 714 },
  { name: 'an iPhone SE as an installed app', width: 375, height: 647 },
  { name: 'an iPhone SE in Safari', width: 375, height: 549 },
  { name: 'an iPhone Pro on its side in Safari', width: 874, height: 292 },
  { name: 'an iPhone Pro on its side as an installed app', width: 874, height: 402 },
  { name: 'an iPhone Pro Max on its side in Safari', width: 956, height: 330 },
  { name: 'an iPhone Pro Max on its side as an installed app', width: 956, height: 440 },
  { name: 'an iPhone SE on its side in Safari', width: 667, height: 311 },
  { name: 'an iPhone SE on its side as an installed app', width: 667, height: 375 },
  { name: 'an iPad upright', width: 820, height: 1180 },
  { name: 'an iPad on its side', width: 1180, height: 820 },
  { name: 'a laptop', width: 1280, height: 900 },
  { name: 'a wide laptop', width: 1440, height: 800 },
  ...DESKTOP_SCREENS,
];

const SHORT_SCREENS = SCREENS.filter((screen) => screen.height <= 500);

const SAFARI_STATUS_BAR = 62;
const SAFARI_TOOLBAR = 98;

async function photoBox(page: Page): Promise<Box> {
  return page.locator('#uvod img').evaluate((image) => {
    const box = image.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
  });
}

async function expectNotToMove(
  page: Page,
  screen: { width: number; height: number },
): Promise<void> {
  const resting = await page.evaluate(() => window.scrollY);
  await page.mouse.move(screen.width / 2, screen.height / 2);
  await page.mouse.wheel(0, screen.height);
  await page.mouse.wheel(0, -screen.height * 2);
  await page.locator('#uvod h1').click({ position: { x: 1, y: 1 } });
  for (const key of ['PageDown', 'Space', 'ArrowDown', 'End']) {
    await page.keyboard.press(key);
  }
  await waitWhileNothingMayHappen(page, 400);
  expect(await page.evaluate(() => window.scrollY), 'the page moved').toBe(resting);
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

async function heroLayout(page: Page, face: Box) {
  await page.waitForFunction(() => {
    const photo = document.querySelector<HTMLImageElement>('#uvod img');
    return photo !== null && photo.complete && photo.naturalWidth > 0;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  return page.evaluate((faceInPhoto) => {
    const plain = (rect: DOMRect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    });
    const photo = document.querySelector<HTMLImageElement>('#uvod img')!;
    const frame = photo.getBoundingClientRect();
    const [x, y] = getComputedStyle(photo)
      .objectPosition.split(' ')
      .map((part) => parseFloat(part) / 100);
    const scale = Math.max(frame.width / photo.naturalWidth, frame.height / photo.naturalHeight);
    const width = photo.naturalWidth * scale;
    const height = photo.naturalHeight * scale;
    const left = frame.left + (frame.width - width) * x;
    const top = frame.top + (frame.height - height) * y;
    const face = {
      left: left + faceInPhoto.left * width,
      right: left + faceInPhoto.right * width,
      top: top + faceInPhoto.top * height,
      bottom: top + faceInPhoto.bottom * height,
    };
    const shown = [
      ...document.querySelectorAll<HTMLElement>(
        '#uvod p, #uvod h1, #uvod a, #uvod .stat-value, #uvod .stat-label',
      ),
    ]
      .filter((element) => {
        const own = element.getBoundingClientRect();
        return own.width > 1 && own.height > 1;
      })
      .map((element) => {
        const lines = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const words = element.matches('a') ? lines : range.getBoundingClientRect();
        return {
          text: element.textContent?.trim() ?? '',
          box: { ...plain(lines), left: words.left, right: words.right },
        };
      });
    const header = [...document.querySelectorAll<HTMLElement>('app-header a, app-header button')]
      .map((element) => element.getBoundingClientRect().bottom)
      .filter((bottom) => bottom > 0);
    return {
      face,
      shown,
      headerBottom: Math.max(0, ...header),
      tabBarTop: document.querySelector('app-tab-bar nav')?.getBoundingClientRect().top ?? null,
      scrolls:
        document.documentElement.scrollHeight > window.innerHeight &&
        getComputedStyle(document.documentElement).overflowY !== 'hidden',
    };
  }, face);
}

async function leadShows(page: Page): Promise<boolean> {
  return page.locator('#uvod .hero-lead').evaluate((lead) => {
    const box = lead.getBoundingClientRect();
    return box.width > 1 && box.height > 1;
  });
}

async function expectHeroToSettleAt(
  page: Page,
  viewport: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(viewport);
  await heroLayout(page, FACE_IN_HERO_PHOTO);
  await page.evaluate(
    () =>
      new Promise<void>((settled) =>
        requestAnimationFrame(() => requestAnimationFrame(() => settled())),
      ),
  );
  await page.evaluate(() => {
    const changes = { count: 0 };
    Object.assign(window, { heroChanges: changes });
    new MutationObserver((records) => (changes.count += records.length)).observe(
      document.querySelector('#uvod')!,
      { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] },
    );
  });
  await waitWhileNothingMayHappen(page, 400);

  const changes = await page.evaluate(
    () => (window as unknown as { heroChanges: { count: number } }).heroChanges.count,
  );
  expect(changes, `the hero kept switching at ${viewport.width} × ${viewport.height}`).toBe(0);
}

async function heroControlsInTabBarBand(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const tabBarTop = document.querySelector('app-tab-bar nav')!.getBoundingClientRect().top;
    return [...document.querySelectorAll<HTMLElement>('#uvod a')]
      .filter((control) => {
        const box = control.getBoundingClientRect();
        return box.bottom > tabBarTop && box.top < window.innerHeight;
      })
      .map((control) => control.textContent?.trim() ?? '');
  });
}

const EDGE_ROUNDING_PX = 1;
const LEAD_NARROWEST_EM = 18;
const SAME_PIXEL_TOLERANCE = 2;

async function shadeChangeOverFace(page: Page, face: Box): Promise<number> {
  await page.addStyleTag({ content: '#uvod .hero-content { visibility: hidden; }' });
  const shaded = await page.screenshot({ animations: 'disabled' });
  const unshade = await page.addStyleTag({
    content: '#uvod .hero-overlay::before { display: none; }',
  });
  const unshaded = await page.screenshot({ animations: 'disabled' });
  await unshade.evaluate((style) => style.remove());
  await page.addStyleTag({ content: '#uvod .hero-content { visibility: visible; }' });
  return page.evaluate(
    async ({ withShade, withoutShade, box }) => {
      const pixels = async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0);
        const scale = bitmap.width / window.innerWidth;
        const x = Math.max(0, Math.floor(box.left * scale));
        const y = Math.max(0, Math.floor(box.top * scale));
        const width = Math.max(0, Math.min(bitmap.width, Math.ceil(box.right * scale)) - x);
        const height = Math.max(0, Math.min(bitmap.height, Math.ceil(box.bottom * scale)) - y);
        return width > 0 && height > 0 ? context.getImageData(x, y, width, height).data : [];
      };
      const [shadedPixels, unshadedPixels] = [await pixels(withShade), await pixels(withoutShade)];
      let largest = 0;
      for (let index = 0; index < shadedPixels.length; index++) {
        largest = Math.max(largest, Math.abs(shadedPixels[index] - unshadedPixels[index]));
      }
      return largest;
    },
    { withShade: shaded.toString('base64'), withoutShade: unshaded.toString('base64'), box: face },
  );
}

interface Strip {
  left: number;
  right: number;
}

async function shadeStrengthIn(page: Page, strips: Strip[]): Promise<number[]> {
  const hide = await page.addStyleTag({
    content: '#uvod .hero-content, app-header, app-tab-bar { visibility: hidden; }',
  });
  const shaded = await page.screenshot({ animations: 'disabled' });
  const unshade = await page.addStyleTag({
    content: '#uvod .hero-overlay::before { display: none; }',
  });
  const unshaded = await page.screenshot({ animations: 'disabled' });
  await unshade.evaluate((style) => style.remove());
  await hide.evaluate((style) => style.remove());
  return page.evaluate(
    async ({ withShade, withoutShade, across }) => {
      const canvas = new OffscreenCanvas(1, 1);
      const probe = canvas.getContext('2d', { willReadFrequently: true })!;
      probe.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-image-shade')
        .trim();
      probe.fillRect(0, 0, 1, 1);
      const shade = [...probe.getImageData(0, 0, 1, 1).data];
      const decode = async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const image = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = image.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0);
        return { context, width: bitmap.width, height: bitmap.height };
      };
      const [withVeil, withoutVeil] = [await decode(withShade), await decode(withoutShade)];
      const scale = withVeil.width / window.innerWidth;
      return across.map((strip) => {
        const x = Math.floor(strip.left * scale);
        const width = Math.max(1, Math.floor(strip.right * scale) - x);
        const veiled = withVeil.context.getImageData(x, 0, width, withVeil.height).data;
        const clear = withoutVeil.context.getImageData(x, 0, width, withVeil.height).data;
        let darkened = 0;
        let darkest = 0;
        for (let index = 0; index < veiled.length; index += 4) {
          for (let channel = 0; channel < 3; channel++) {
            darkened += clear[index + channel] - veiled[index + channel];
            darkest += clear[index + channel] - shade[channel];
          }
        }
        return darkest > 0 ? darkened / darkest : 0;
      });
    },
    {
      withShade: shaded.toString('base64'),
      withoutShade: unshaded.toString('base64'),
      across: strips,
    },
  );
}

async function heroControlsPartlyBehindTabBar(page: Page): Promise<string[]> {
  return page.evaluate((rounding) => {
    const tabBarTop = document.querySelector('app-tab-bar nav')!.getBoundingClientRect().top;
    return [...document.querySelectorAll<HTMLElement>('#uvod a')]
      .filter((control) => {
        const box = control.getBoundingClientRect();
        return box.bottom > tabBarTop && box.top < window.innerHeight - rounding;
      })
      .map((control) => control.textContent?.trim() ?? '');
  }, EDGE_ROUNDING_PX);
}

interface TextBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

async function lowestContrastInShot(
  page: Page,
  shot: Buffer,
  color: string,
  lines: TextBox[],
): Promise<number> {
  return page.evaluate(
    async ({ base64, textColor, textLines }) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.fillStyle = textColor;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      const text = { red, green, blue, opacity: alpha / 255 };
      context.clearRect(0, 0, 1, 1);
      context.drawImage(bitmap, 0, 0);
      const scale = bitmap.width / window.innerWidth;
      const channel = (value: number) => {
        const linear = value / 255;
        return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      let lowest = Infinity;
      for (const line of textLines) {
        const x = Math.max(0, Math.floor(line.left * scale));
        const y = Math.max(0, Math.floor(line.top * scale));
        const width = Math.min(bitmap.width - x, Math.ceil(line.width * scale));
        const height = Math.min(bitmap.height - y, Math.ceil(line.height * scale));
        const pixels = context.getImageData(x, y, width, height).data;
        for (let index = 0; index < pixels.length; index += 4) {
          const [r, g, b] = [pixels[index], pixels[index + 1], pixels[index + 2]];
          const shown = (own: number, behind: number) =>
            own * text.opacity + behind * (1 - text.opacity);
          const behind = luminance(r, g, b);
          const front = luminance(shown(text.red, r), shown(text.green, g), shown(text.blue, b));
          const contrast = (Math.max(front, behind) + 0.05) / (Math.min(front, behind) + 0.05);
          lowest = Math.min(lowest, contrast);
        }
      }
      return lowest;
    },
    { base64: shot.toString('base64'), textColor: color, textLines: lines },
  );
}

async function lowestContrastOverPhoto(
  page: Page,
  selector: string,
  area: 'lines' | 'box' = 'lines',
): Promise<number> {
  const { color, lines } = await page.locator(selector).evaluate((element, over) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = over === 'box' ? [element.getBoundingClientRect()] : [...range.getClientRects()];
    return {
      color: getComputedStyle(element).color,
      lines: rects.map((rect) => ({
        left: rect.left,
        top: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      })),
    };
  }, area);
  const hidden =
    area === 'box'
      ? '#uvod .hero-content, app-header, app-tab-bar { visibility: hidden; }'
      : '#uvod .hero-content { visibility: hidden; }';
  const hide = await page.addStyleTag({ content: hidden });
  const resting = await page.evaluate(() => window.scrollY);
  const windowHeight = page.viewportSize()!.height;
  const textTop = Math.min(...lines.map((line) => line.top));
  const textBottom = Math.max(...lines.map((line) => line.top + line.height));
  let lowest = Infinity;
  let windowTop = area === 'box' ? textTop : resting;
  for (;;) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), windowTop);
    const scrolled = await page.evaluate(() => window.scrollY);
    const shot = await page.screenshot({ animations: 'disabled' });
    const shown = lines
      .map((line) => {
        const top = Math.max(line.top, scrolled);
        const bottom = Math.min(line.top + line.height, scrolled + windowHeight);
        return { ...line, top: top - scrolled, height: bottom - top };
      })
      .filter((line) => line.height > 0);
    lowest = Math.min(lowest, await lowestContrastInShot(page, shot, color, shown));
    if (area !== 'box' || scrolled + windowHeight >= textBottom || scrolled < windowTop - 1) {
      break;
    }
    windowTop = scrolled + windowHeight;
  }
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), resting);
  await hide.evaluate((style) => style.remove());
  return lowest;
}

test.describe('Given the landing page, whose photo shows a child looking at the visitor', () => {
  for (const screen of SCREENS) {
    test.describe(`when it opens on ${screen.name} (${screen.width} × ${screen.height})`, () => {
      test.use({ viewport: { width: screen.width, height: screen.height } });

      test('then the first screen holds the whole page, its text keeps clear of the face, the header and the tab bar', async ({
        page,
      }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();

        const layout = await heroLayout(page, faceOn(screen));

        expect(layout.scrolls, 'the landing page scrolls').toBe(false);
        expect(layout.shown.map(({ text }) => text)).toContain('Nová naděje');
        if (screen.width >= 900 && screen.height > 500) {
          expect(layout.shown.map(({ text }) => text)).toEqual(
            expect.arrayContaining(['let pomáháme', 'podpořených dětí', 'rok vzniku']),
          );
        }
        for (const { text, box } of layout.shown) {
          expect(overlaps(box, layout.face), `"${text}" lies over the child's face`).toBe(false);
          expect(box.top, `"${text}" runs under the header`).toBeGreaterThanOrEqual(
            layout.headerBottom,
          );
          if (layout.tabBarTop !== null) {
            expect(box.bottom, `"${text}" runs under the tab bar`).toBeLessThanOrEqual(
              layout.tabBarTop,
            );
          }
        }
      });
    });
  }

  for (const screen of DESKTOP_SCREENS) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test.describe(`when it opens on ${screen.name} (${screen.width} × ${screen.height}) in the ${colorScheme} appearance`, () => {
        test.use({ viewport: { width: screen.width, height: screen.height }, colorScheme });

        test('then the eyebrow and the lead read against the brightest part of the photo behind them', async ({
          page,
        }) => {
          await page.goto('/');
          await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
          await heroLayout(page, FACE_IN_HERO_PHOTO);

          for (const [name, selector] of [
            ['the eyebrow', '#uvod .hero-eyebrow'],
            ['the lead', '#uvod .hero-lead'],
          ]) {
            expect(
              await lowestContrastOverPhoto(page, selector),
              `${name} falls below WCAG AA contrast over the photo`,
            ).toBeGreaterThanOrEqual(NORMAL_TEXT_CONTRAST);
          }
        });
      });
    }
  }

  for (const screen of SCREENS.filter((each) => each.width < 768 && each.height > 500)) {
    test.describe(`when it opens offline on ${screen.name} (${screen.width} × ${screen.height})`, () => {
      test.use({ viewport: { width: screen.width, height: screen.height } });

      test('then the page still fills one screen and does not scroll, and the Offline pill stacks between the text and the tab bar', async ({
        page,
      }) => {
        await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
        const pill = page.getByRole('button', { name: /^Offline/ });
        await expect(pill).toBeVisible({ timeout: 10_000 });

        const layout = await heroLayout(page, FACE_IN_HERO_PHOTO);
        const pillBox = (await pill.boundingBox())!;
        const hero = (await page.locator('#uvod').boundingBox())!;

        expect(layout.scrolls, 'the landing page scrolls').toBe(false);
        expect(
          hero.y + hero.height,
          'the photo ends above the bottom of the screen',
        ).toBeGreaterThanOrEqual(screen.height);
        for (const { text, box } of layout.shown) {
          expect(box.bottom, `"${text}" runs under the Offline pill`).toBeLessThanOrEqual(
            pillBox.y,
          );
        }
        if (layout.tabBarTop !== null) {
          expect(
            pillBox.y + pillBox.height,
            'the Offline pill runs under the tab bar',
          ).toBeLessThanOrEqual(layout.tabBarTop);
        }
      });
    });
  }

  for (const screen of SCREENS) {
    test.describe(`when it opens on ${screen.name} (${screen.width} × ${screen.height}) and the visitor tries to move it`, () => {
      test.use({ viewport: { width: screen.width, height: screen.height } });

      test('then the photo covers the whole screen and the page does not move', async ({
        page,
      }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
        await heroLayout(page, FACE_IN_HERO_PHOTO);

        const photo = await photoBox(page);
        expect(photo.top).toBeLessThanOrEqual(0);
        expect(photo.bottom).toBeGreaterThanOrEqual(screen.height);
        expect(photo.left).toBeLessThanOrEqual(0);
        expect(photo.right).toBeGreaterThanOrEqual(screen.width);
        await expectNotToMove(page, screen);
      });
    });
  }

  test.describe('when it opens in Safari on an iPhone 18 Pro Max, whose status bar and floating toolbar the iOS 27.2 simulator measured', () => {
    test.use({ viewport: { width: 440, height: 796 } });

    test('then the photo reaches under the status bar and under the toolbar, and the page still does not move', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
      const bleed = await page.evaluate(() => {
        const tabRule = [...document.styleSheets]
          .flatMap((sheet) => [...sheet.cssRules])
          .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule)
          .filter((rule) => rule.conditionText.includes('not (display-mode: standalone)'))
          .flatMap((rule) => [...rule.cssRules])
          .filter((rule): rule is CSSSupportsRule => rule instanceof CSSSupportsRule)
          .filter((rule) => rule.conditionText.includes('-webkit-touch-callout'))
          .flatMap((rule) => [...rule.cssRules])
          .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
          .find((rule) => rule.selectorText === 'html.landing-stage')!;
        return {
          top: tabRule.style.getPropertyValue('--page-resting-scroll').trim(),
          bottom: tabRule.style.getPropertyValue('--page-bleed-bottom').trim(),
        };
      });
      await page.addStyleTag({
        content: `html.landing-stage { --page-resting-scroll: ${bleed.top}; --page-bleed-bottom: ${bleed.bottom}; }`,
      });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await heroLayout(page, FACE_IN_HERO_PHOTO);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

      const photo = await photoBox(page);
      expect(photo.top, 'the photo stops below the status bar').toBeLessThanOrEqual(
        -SAFARI_STATUS_BAR,
      );
      expect(photo.bottom, 'the photo stops above the toolbar').toBeGreaterThanOrEqual(
        796 + SAFARI_TOOLBAR,
      );
      await expectNotToMove(page, { width: 440, height: 796 });
    });
  });

  test.describe('when it opens on a laptop of 1024 × 700 with text twice as large, where the hero no longer fits one screen', () => {
    test.use({ viewport: { width: 1024, height: 700 } });

    test('then the page scrolls as any page, and Přispět can be reached and stays in view', async ({
      page,
    }) => {
      await page.goto('/');
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight))
        .toBe(true);

      await page.mouse.move(512, 350);
      await page.mouse.wheel(0, 400);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      const scrolled = await page.evaluate(() => window.scrollY);
      await waitWhileNothingMayHappen(page, 400);
      expect(await page.evaluate(() => window.scrollY), 'the page sprang back').toBe(scrolled);

      const donate = page.locator('#uvod').getByRole('link', { name: 'Přispět' });
      await donate.focus();
      await waitWhileNothingMayHappen(page, 400);
      await expect(donate).toBeInViewport();
    });
  });

  for (const screen of [
    { name: 'a computer', width: 1280, height: 748, root: '150%' },
    { name: 'a computer', width: 1280, height: 748, root: '200%' },
    { name: 'an iPad on its side', width: 1180, height: 820, root: '34px' },
    { name: 'an iPad mini on its side', width: 1133, height: 744, root: '34px' },
    { name: 'an iPad mini on its side', width: 1133, height: 744, root: '53px' },
    { name: 'an iPhone SE', width: 375, height: 647, root: '53px' },
  ]) {
    test.describe(`when it opens on ${screen.name} of ${screen.width} × ${screen.height} with a root of ${screen.root}, where the hero no longer fits one screen and its buttons may rest partly behind the tab bar`, () => {
      test.use({ viewport: { width: screen.width, height: screen.height } });

      test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.addStyleTag({ content: `html { font-size: ${screen.root}; }` });
        await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
        await heroLayout(page, FACE_IN_HERO_PHOTO);
      });

      if (screen.height > 680) {
        test('then its lead still shows', async ({ page }) => {
          expect(await leadShows(page), 'the lead is hidden').toBe(true);
        });
      }

      test('then, scrolled to the end of the page, no control of the hero reaches into the band of the tab bar', async ({
        page,
      }) => {
        await page.evaluate(() =>
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
        );

        await expect.poll(() => heroControlsInTabBarBand(page)).toEqual([]);
      });

      test('then every control of the hero reached with Tab stands wholly above the tab bar', async ({
        page,
      }) => {
        const names = await page
          .locator('#uvod a')
          .evaluateAll((controls) => controls.map((control) => control.textContent?.trim() ?? ''));
        const reached = new Set<string>();

        for (let press = 0; press < 40 && reached.size < names.length; press++) {
          await page.keyboard.press('Tab');
          const focused = await page.evaluate(() => {
            const control = document.activeElement;
            if (!(control instanceof HTMLAnchorElement) || !control.closest('#uvod')) {
              return null;
            }
            return control.textContent?.trim() ?? '';
          });
          if (focused === null) {
            continue;
          }
          reached.add(focused);
          await expect
            .poll(
              () =>
                page.evaluate(() => {
                  const box = document.activeElement!.getBoundingClientRect();
                  const tabBarTop = document
                    .querySelector('app-tab-bar nav')!
                    .getBoundingClientRect().top;
                  return box.top >= 0 && box.bottom <= tabBarTop;
                }),
              { message: `"${focused}" is focused behind the tab bar` },
            )
            .toBe(true);
        }

        expect([...reached].sort()).toEqual([...names].sort());
      });

      test('then a tap on the part of a hero button above the tab bar presses the button, and a tap where both meet belongs to the tab bar', async ({
        page,
      }) => {
        const points = await page.evaluate(() => {
          const bar = document.querySelector('app-tab-bar nav')!.getBoundingClientRect();
          return [...document.querySelectorAll<HTMLAnchorElement>('#uvod a')]
            .map((control) => ({ control, box: control.getBoundingClientRect() }))
            .filter(({ box }) => box.top < bar.top && box.bottom > bar.top)
            .map(({ control, box }) => {
              const above = { x: box.left + box.width / 2, y: (box.top + bar.top) / 2 };
              const left = Math.max(box.left, bar.left);
              const right = Math.min(box.right, bar.right);
              const within =
                left < right
                  ? { x: (left + right) / 2, y: (bar.top + Math.min(box.bottom, bar.bottom)) / 2 }
                  : null;
              const at = (point: { x: number; y: number }) =>
                document.elementFromPoint(point.x, point.y);
              return {
                path: new URL(control.href).pathname,
                above,
                aboveHitsButton: control.contains(at(above)),
                withinHitsTabBar: within === null || !!at(within)?.closest('app-tab-bar'),
              };
            });
        });

        for (const point of points) {
          expect(point.aboveHitsButton, `a tap above the bar misses ${point.path}`).toBe(true);
          expect(point.withinHitsTabBar, `a tap on the bar reaches ${point.path}`).toBe(true);
        }
        const first = points.at(0);
        if (first) {
          await page.mouse.click(first.above.x, first.above.y);
          await expect(page).toHaveURL(new RegExp(`${first.path}$`));
        }
      });
    });
  }

  for (const screen of [
    { name: 'an iPad mini on its side', width: 1133, height: 744, root: '34px' },
    { name: 'an iPad mini on its side', width: 1133, height: 744, root: '53px' },
    { name: 'an iPad on its side', width: 1180, height: 820, root: '34px' },
    { name: 'a computer', width: 1280, height: 748, root: '200%' },
    { name: 'a computer', width: 1280, height: 900, root: '200%' },
    { name: 'a computer', width: 900, height: 900, root: '200%' },
    { name: 'an iPhone SE', width: 375, height: 647, root: '53px' },
  ]) {
    test.describe(`when it opens on ${screen.name} of ${screen.width} × ${screen.height} with a root of ${screen.root} and rests at the top`, () => {
      test.use({ viewport: { width: screen.width, height: screen.height } });

      test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.addStyleTag({ content: `html { font-size: ${screen.root}; }` });
        await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
        await heroLayout(page, FACE_IN_HERO_PHOTO);
      });

      test("then each hero button stands wholly above the tab bar or wholly below the window's edge, never partly behind the bar", async ({
        page,
      }) => {
        await expect.poll(() => heroControlsPartlyBehindTabBar(page)).toEqual([]);
        await expect(page.locator('#uvod .hero-lead')).toHaveText(
          /Pomáháme zdravotně postiženým dětem/,
        );
      });

      test("then the buttons either follow the lead at its own margin or, moved below the window's edge, start right at it, so the space under the lead is no larger than the buttons took", async ({
        page,
      }) => {
        const layout = await page.evaluate(() => {
          const lead = document.querySelector<HTMLElement>('#uvod .hero-lead')!;
          return {
            buttonsTop: document.querySelector('#uvod .hero-btns')!.getBoundingClientRect().top,
            leadBottom: lead.getBoundingClientRect().bottom,
            leadMargin: parseFloat(getComputedStyle(lead).marginBottom),
            edge: window.innerHeight,
          };
        });
        const gapUnderLead = layout.buttonsTop - layout.leadBottom;
        const followLead = Math.abs(gapUnderLead - layout.leadMargin) <= EDGE_ROUNDING_PX;
        const startAtEdge = Math.abs(layout.buttonsTop - layout.edge) <= EDGE_ROUNDING_PX;

        expect(
          followLead || startAtEdge,
          `the buttons start ${gapUnderLead} px under the lead and ${layout.buttonsTop - layout.edge} px under the edge`,
        ).toBe(true);
      });
    });
  }

  test.describe('when it opens on an iPad mini on its side (1133 × 744) at the default text size', () => {
    test.use({ viewport: { width: 1133, height: 744 } });

    test('then its buttons stay on the first screen above the tab bar instead of moving below its edge', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
      await heroLayout(page, FACE_IN_HERO_PHOTO);

      const layout = await page.evaluate(() => ({
        buttons: document
          .querySelector('#uvod .hero-btns')!
          .getBoundingClientRect()
          .toJSON() as DOMRect,
        tabBarTop: document.querySelector('app-tab-bar nav')!.getBoundingClientRect().top,
      }));
      expect(layout.buttons.top).toBeGreaterThan(0);
      expect(layout.buttons.bottom).toBeLessThanOrEqual(layout.tabBarTop);
    });
  });

  test.describe('when it opens on a touch screen of an iPad mini on its side (1133 × 744) with a root of 53 px and the visitor scrolls', () => {
    test.use({ viewport: { width: 1133, height: 744 }, hasTouch: true, isMobile: true });

    test('then the hero keeps its buttons where they first stood while the page scrolls', async ({
      page,
    }) => {
      await page.goto('/');
      await page.addStyleTag({ content: 'html { font-size: 53px; }' });
      await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
      await heroLayout(page, FACE_IN_HERO_PHOTO);
      await expect.poll(() => heroControlsPartlyBehindTabBar(page)).toEqual([]);
      const before = await page.locator('#uvod .hero-btns').evaluate((row) => row.offsetTop);
      await page.evaluate(() => {
        const changes = { count: 0 };
        Object.assign(window, { heroChanges: changes });
        new MutationObserver((records) => (changes.count += records.length)).observe(
          document.querySelector('#uvod')!,
          {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'style'],
          },
        );
      });

      for (const top of [120, 360, 40, 600, 0]) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);
        await page.evaluate(
          () =>
            new Promise<void>((settled) =>
              requestAnimationFrame(() => requestAnimationFrame(() => settled())),
            ),
        );
      }
      await waitWhileNothingMayHappen(page, 400);

      const changes = await page.evaluate(
        () => (window as unknown as { heroChanges: { count: number } }).heroChanges.count,
      );
      expect(changes, 'the hero changed while the page scrolled').toBe(0);
      expect(await page.locator('#uvod .hero-btns').evaluate((row) => row.offsetTop)).toBe(before);
    });
  });

  for (const screen of [
    { name: 'an iPad mini on its side', width: 1133, height: 744 },
    { name: 'an iPad on its side', width: 1180, height: 820 },
    { name: 'a computer', width: 1280, height: 748 },
    { name: 'a computer', width: 1280, height: 900 },
  ]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test.describe(`when it opens on ${screen.name} (${screen.width} × ${screen.height}) with text at 200 % in the ${colorScheme} appearance, where the hero no longer fits one screen`, () => {
        test.use({ viewport: { width: screen.width, height: screen.height }, colorScheme });

        test("then the lead keeps clear of the child's face, the shade behind it leaves the face as it is, and the lead reads at AA contrast anywhere in its box", async ({
          page,
        }) => {
          await page.goto('/');
          await page.addStyleTag({ content: 'html { font-size: 200%; }' });
          await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
          const layout = await heroLayout(page, FACE_IN_HERO_PHOTO);

          for (const { text, box } of layout.shown) {
            expect(overlaps(box, layout.face), `"${text}" lies over the child's face`).toBe(false);
          }
          expect(
            await shadeChangeOverFace(page, layout.face),
            "the shade behind the lead darkens the child's face",
          ).toBeLessThanOrEqual(SAME_PIXEL_TOLERANCE);
          expect(
            await lowestContrastOverPhoto(page, '#uvod .hero-lead', 'box'),
            'the lead falls below WCAG AA contrast somewhere in its box',
          ).toBeGreaterThanOrEqual(NORMAL_TEXT_CONTRAST);
        });
      });
    }
  }

  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`when it opens on an iPad mini on its side (1133 × 744) with the largest system text (a root of 53 px, above 200 %) in the ${colorScheme} appearance`, () => {
      test.use({ viewport: { width: 1133, height: 744 }, colorScheme });

      test(`then the lead shows whole, lies over the face only where the column beside it would be narrower than ${LEAD_NARROWEST_EM} em, and reads at AA contrast anywhere in its box`, async ({
        page,
      }) => {
        await page.goto('/');
        await page.addStyleTag({ content: 'html { font-size: 53px; }' });
        await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
        const layout = await heroLayout(page, FACE_IN_HERO_PHOTO);
        const lead = page.locator('#uvod .hero-lead');

        await expect(lead).toHaveText(
          'Pomáháme zdravotně postiženým dětem k\u00a0lepšímu životu. Každý příspěvek mění příběh.',
        );
        expect(await leadShows(page), 'the lead is hidden').toBe(true);
        const leadBox = layout.shown.find(({ text }) => text.startsWith('Pomáháme'))!.box;
        if (overlaps(leadBox, layout.face)) {
          const column = await lead.evaluate((element) => {
            const content = element.parentElement!;
            const padding = getComputedStyle(content);
            return {
              width: element.getBoundingClientRect().width,
              em: parseFloat(getComputedStyle(element).fontSize),
              whole:
                content.clientWidth -
                parseFloat(padding.paddingLeft) -
                parseFloat(padding.paddingRight),
            };
          });
          expect(
            column.width,
            `the lead lies over the face in a column narrower than ${LEAD_NARROWEST_EM} em`,
          ).toBeGreaterThanOrEqual(
            Math.min(column.em * LEAD_NARROWEST_EM, column.whole) - EDGE_ROUNDING_PX,
          );
        }
        expect(
          await lowestContrastOverPhoto(page, '#uvod .hero-lead', 'box'),
          'the lead falls below WCAG AA contrast somewhere in its box',
        ).toBeGreaterThanOrEqual(NORMAL_TEXT_CONTRAST);
      });
    });
  }

  test.describe('when it opens on an iPad on its side (1180 × 820) with the largest system text (a root of 53 px), where the lead runs over the whole photo', () => {
    test.use({ viewport: { width: 1180, height: 820 } });

    test('then the shade behind the lead darkens the photo to its right edge as much as in the middle, so no pale strip of the photo shows beside it', async ({
      page,
    }) => {
      await page.goto('/');
      await page.addStyleTag({ content: 'html { font-size: 53px; }' });
      await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
      await expect(page.locator('#uvod')).toHaveClass(/hero--shaded/);

      const [middle, edge] = await shadeStrengthIn(page, [
        { left: 584, right: 596 },
        { left: 1168, right: 1180 },
      ]);

      expect(middle, 'the shade does not cover the middle of the photo').toBeGreaterThan(0.5);
      expect(edge, 'the shade fades out before the right edge of the photo').toBeGreaterThanOrEqual(
        middle * 0.9,
      );
    });
  });

  test.describe('when it opens on an iPhone SE with the largest system text (a root of 53 px), turns on its side and back, and Safari shows and hides its toolbar', () => {
    test.use({ viewport: { width: 375, height: 647 } });

    test('then the hero settles after every change instead of switching back and forth, and keeps its lead', async ({
      page,
    }) => {
      await page.goto('/');
      await page.addStyleTag({ content: 'html { font-size: 53px; }' });
      await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
      await heroLayout(page, FACE_IN_HERO_PHOTO);

      for (const viewport of [
        { width: 647, height: 375 },
        { width: 375, height: 647 },
        { width: 375, height: 549 },
        { width: 375, height: 647 },
      ]) {
        await expectHeroToSettleAt(page, viewport);
        await expect(page.locator('#uvod .hero-lead')).toHaveText(
          /Pomáháme zdravotně postiženým dětem/,
        );
      }
    });
  });

  for (const screen of [
    { name: 'an iPad Pro on its side', width: 1180, height: 820 },
    { name: 'an iPad mini on its side', width: 1133, height: 744 },
  ]) {
    for (const textSize of ['150%', '200%']) {
      test.describe(`when it opens on ${screen.name} (${screen.width} × ${screen.height}) with text at ${textSize}, and Safari shows and hides its toolbar`, () => {
        test.use({ viewport: { width: screen.width, height: screen.height } });

        test('then the figures beside the buttons settle after every change instead of coming and going', async ({
          page,
        }) => {
          await page.goto('/');
          await page.addStyleTag({ content: `html { font-size: ${textSize}; }` });
          await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
          await heroLayout(page, FACE_IN_HERO_PHOTO);
          const figures = page.locator('#uvod app-stats-bar');
          if (textSize === '200%') {
            await expect(figures, 'the figures still crowd the buttons').toHaveCount(0);
          }

          for (const toolbar of [50, 0, 80, 0, 65, 0]) {
            await expectHeroToSettleAt(page, {
              width: screen.width,
              height: screen.height - toolbar,
            });
            if (textSize === '200%') {
              await expect(figures).toHaveCount(0);
            }
            await expect(page.locator('#uvod .hero-lead')).toHaveText(
              /Pomáháme zdravotně postiženým dětem/,
            );
          }
        });
      });
    }
  }

  for (const screen of SCREENS.filter((each) => each.width < 480 && each.height > 500)) {
    test.describe(`when it opens on ${screen.name} (${screen.width} × ${screen.height})`, () => {
      test.use({ viewport: { width: screen.width, height: screen.height } });

      test('then Přispět alone stands on the photo across the width of its text, and leads to the donate page', async ({
        page,
      }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
        const hero = page.locator('#uvod');
        await expect(hero.getByRole('link')).toHaveCount(1);
        const donate = hero.getByRole('link', { name: 'Přispět' });
        await heroLayout(page, FACE_IN_HERO_PHOTO);

        const column = await hero.locator('.hero-content').evaluate((content) => {
          const box = content.getBoundingClientRect();
          const style = getComputedStyle(content);
          return {
            left: box.left + parseFloat(style.paddingLeft),
            right: box.right - parseFloat(style.paddingRight),
          };
        });
        const button = (await donate.boundingBox())!;
        expect(button.x).toBeCloseTo(column.left, 0);
        expect(button.x + button.width).toBeCloseTo(column.right, 0);

        await donate.click();
        await expect(page).toHaveURL(/\/prispet$/);
      });
    });
  }

  test.describe('when it opens on an iPad upright', () => {
    test.use({ viewport: { width: 820, height: 1180 } });

    test('then Přispět alone stands on the photo as the compact button of the computer', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
      const hero = page.locator('#uvod');
      await expect(hero.getByRole('link')).toHaveCount(1);
      await heroLayout(page, FACE_IN_HERO_PHOTO);

      const button = (await hero.getByRole('link', { name: 'Přispět' }).boundingBox())!;
      expect(button.width).toBeLessThan(820 / 3);
    });
  });

  test.describe('when a phone wider than a tablet lies on its side', () => {
    test.use({ viewport: { width: 956, height: 440 } });

    test('then the hero leaves Přispět and Kde pomáháme to the tab bar, because a window that short has no room for them', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();

      await expect(page.locator('#uvod').getByRole('link')).toHaveCount(0);
      await expect(
        page.getByRole('navigation').getByRole('link', { name: 'Přispět' }),
      ).toBeVisible();
    });
  });
});

test.describe('Given a page that opens with a band under the header', () => {
  for (const { path, band } of [
    { path: '/aktuality', band: '.ui-intro' },
    { path: '/projekty', band: '.stories-intro' },
  ]) {
    for (const screen of SHORT_SCREENS) {
      test.describe(`when ${path} opens on ${screen.name} (${screen.width} × ${screen.height})`, () => {
        test.use({ viewport: { width: screen.width, height: screen.height } });

        test('then the band ends well above the tab bar, so what follows it shows on the first screen', async ({
          page,
        }) => {
          await page.goto(path);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const { bandBottom, tabBarTop } = await page.evaluate(
            (selector) => ({
              bandBottom: document.querySelector(selector)!.getBoundingClientRect().bottom,
              tabBarTop: document.querySelector('app-tab-bar nav')!.getBoundingClientRect().top,
            }),
            band,
          );

          expect(bandBottom).toBeLessThanOrEqual(tabBarTop - 24);
        });
      });
    }
  }
});

test.describe('Given the page of a missing address', () => {
  for (const screen of SCREENS.filter(({ width, height }) => width < 768 && height > 500)) {
    test.describe(`when it opens on ${screen.name} (${screen.width} × ${screen.height})`, () => {
      test.use({ viewport: { width: screen.width, height: screen.height } });

      test('then both of its buttons show above the tab bar', async ({ page }) => {
        await page.goto('/neexistuje');
        await expect(page.getByRole('link', { name: 'Napište nám' })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        const { lowestButton, tabBarTop } = await page.evaluate(() => ({
          lowestButton: Math.max(
            ...[...document.querySelectorAll('main .ui-cta')].map(
              (button) => button.getBoundingClientRect().bottom,
            ),
          ),
          tabBarTop: document.querySelector('app-tab-bar nav')!.getBoundingClientRect().top,
        }));

        expect(lowestButton).toBeLessThanOrEqual(tabBarTop - 8);
      });
    });
  }
});

test.describe('Given Přispět on a phone on its side', () => {
  for (const screen of SHORT_SCREENS.filter(({ width }) => width > 768)) {
    test.describe(`when it opens on ${screen.name} (${screen.width} × ${screen.height})`, () => {
      test.use({ viewport: { width: screen.width, height: screen.height } });

      test('then it keeps the one column of a phone, without the photo that would not fit beside the bank details', async ({
        page,
      }) => {
        await page.goto('/prispet');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        await expect(page.locator('#prispet img[src^="/images/donate-"]')).toBeHidden();
      });
    });
  }
});

interface HomeScreenViewport {
  name: string;
  visible: number;
  smallViewport: number;
  largeViewport: number;
  dynamicViewport: number;
  topInset: number;
}

const HOME_SCREEN_VIEWPORTS: HomeScreenViewport[] = [
  {
    name: 'added after the page asked for a black-translucent status bar',
    visible: 956,
    smallViewport: 894,
    largeViewport: 956,
    dynamicViewport: 956,
    topInset: 62,
  },
  {
    name: 'added before that, so iOS keeps its solid status bar',
    visible: 894,
    smallViewport: 894,
    largeViewport: 956,
    dynamicViewport: 894,
    topInset: 0,
  },
];

test.describe('Given the app opened from the home screen of an iPhone 18 Pro Max, whose viewport units the iOS 27.2 simulator measured in both status bar modes', () => {
  for (const viewport of HOME_SCREEN_VIEWPORTS) {
    test(`when it was ${viewport.name}, then a full-screen block is exactly as tall as what the app shows, so the landing page cannot scroll`, async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();

      const height = await page.evaluate((measured) => {
        const homeScreenRoot = [...document.styleSheets]
          .flatMap((sheet) => [...sheet.cssRules])
          .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule)
          .filter((rule) => rule.conditionText.includes('display-mode: standalone'))
          .flatMap((rule) => [...rule.cssRules])
          .filter((rule): rule is CSSSupportsRule => rule instanceof CSSSupportsRule)
          .flatMap((rule) => [...rule.cssRules])
          .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
          .find((rule) => rule.selectorText === ':root');
        const expression = homeScreenRoot!.style.getPropertyValue('--full-screen-height').trim();
        const resolved = expression
          .replaceAll('env(safe-area-inset-top)', `${measured.topInset}px`)
          .replace(
            /(\d+(?:\.\d+)?)svh/g,
            (_, n) => `${(Number(n) * measured.smallViewport) / 100}px`,
          )
          .replace(
            /(\d+(?:\.\d+)?)lvh/g,
            (_, n) => `${(Number(n) * measured.largeViewport) / 100}px`,
          )
          .replace(
            /(\d+(?:\.\d+)?)dvh/g,
            (_, n) => `${(Number(n) * measured.dynamicViewport) / 100}px`,
          )
          .replace(
            /(\d+(?:\.\d+)?)vh/g,
            (_, n) => `${(Number(n) * measured.largeViewport) / 100}px`,
          );
        const probe = document.createElement('div');
        probe.style.cssText = `position: absolute; height: calc(${resolved});`;
        document.body.append(probe);
        const value = probe.getBoundingClientRect().height;
        probe.remove();
        return value;
      }, viewport);

      expect(height).toBeCloseTo(viewport.visible, 0);
    });
  }
});

const SAME_LINE_PX = 0.5;

test.describe('Given the landing page on a computer', () => {
  for (const screen of [
    { width: 1280, height: 900 },
    { width: 1920, height: 900 },
    { width: 2560, height: 1080 },
  ]) {
    test.describe(`when it opens at ${screen.width} × ${screen.height}`, () => {
      test.use({ viewport: screen });

      test("then the hero's text and buttons start on the edge of the header's logo", async ({
        page,
      }) => {
        await page.goto('/');
        await heroLayout(page, FACE_IN_HERO_PHOTO);

        const edges = await page.evaluate(() => ({
          logo: document.querySelector('app-header .brand img')!.getBoundingClientRect().left,
          hero: ['.hero-eyebrow', '.hero-title', '.hero-lead', '.hero-btns'].map((selector) => ({
            selector,
            left: document.querySelector(`#uvod ${selector}`)!.getBoundingClientRect().left,
          })),
        }));

        for (const { selector, left } of edges.hero) {
          expect(
            Math.abs(left - edges.logo),
            `${selector} starts at ${left}, the logo at ${edges.logo}`,
          ).toBeLessThanOrEqual(SAME_LINE_PX);
        }
      });
    });
  }

  for (const screen of [
    { width: 900, height: 900 },
    { width: 1000, height: 900 },
    { width: 1280, height: 900 },
    { width: 1920, height: 900 },
  ]) {
    test.describe(`when it opens at ${screen.width} × ${screen.height}`, () => {
      test.use({ viewport: screen });

      test('then its four figures stand in one row or two by two, never three and one', async ({
        page,
      }) => {
        await page.goto('/');
        await heroLayout(page, FACE_IN_HERO_PHOTO);

        const rows = await page.locator('#uvod .stat').evaluateAll((figures) => {
          const tops = new Map<number, number>();
          for (const figure of figures) {
            const top = Math.round(figure.getBoundingClientRect().top);
            tops.set(top, (tops.get(top) ?? 0) + 1);
          }
          return [...tops.values()];
        });

        expect([[4], [2, 2]]).toContainEqual(rows);
      });
    });
  }

  test.describe('when it opens at 1280 × 900', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('then the labels of Přispět and Kde pomáháme share their baseline and their weight', async ({
      page,
    }) => {
      await page.goto('/');
      await heroLayout(page, FACE_IN_HERO_PHOTO);

      const labels = await page.locator('#uvod .hero-btns a').evaluateAll((links) =>
        links.map((link) => {
          const range = document.createRange();
          range.selectNodeContents(link);
          const style = getComputedStyle(link);
          return {
            text: link.textContent?.trim() ?? '',
            top: range.getBoundingClientRect().top,
            size: style.fontSize,
            family: style.fontFamily,
            weight: style.fontWeight,
          };
        }),
      );

      expect(labels.map(({ text }) => text)).toEqual(['Přispět', 'Kde pomáháme']);
      const [donate, whereWeHelp] = labels;
      expect({ size: whereWeHelp.size, family: whereWeHelp.family }).toEqual({
        size: donate.size,
        family: donate.family,
      });
      expect(whereWeHelp.weight).toBe(donate.weight);
      expect(
        Math.abs(whereWeHelp.top - donate.top),
        `the labels stand ${whereWeHelp.top - donate.top} px apart`,
      ).toBeLessThanOrEqual(SAME_LINE_PX);
    });
  });
});
