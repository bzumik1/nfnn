import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const FACE_IN_HERO_PHOTO: Box = { left: 0.43, right: 0.59, top: 0.19, bottom: 0.45 };

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
];

const SHORT_SCREENS = SCREENS.filter((screen) => screen.height <= 500);

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
    const shown = [...document.querySelectorAll<HTMLElement>('#uvod p, #uvod h1, #uvod a')]
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
      scrolls: document.documentElement.scrollHeight > window.innerHeight,
    };
  }, face);
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

        const layout = await heroLayout(page, FACE_IN_HERO_PHOTO);

        expect(layout.scrolls, 'the landing page scrolls').toBe(false);
        expect(layout.shown.map(({ text }) => text)).toContain('Nová naděje');
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

  test.describe('when a phone wider than a tablet lies on its side', () => {
    test.use({ viewport: { width: 956, height: 440 } });

    test('then the hero leaves Přispět and Kde pomáháme to the tab bar, as on a phone upright', async ({
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
