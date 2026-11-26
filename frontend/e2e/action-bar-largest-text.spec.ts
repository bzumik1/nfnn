import { Locator, Page } from '@playwright/test';
import {
  article,
  donorWithDonations,
  mockAdministration,
  rememberedSession,
  serveEmptyAdministrationCopy,
} from './baseline/screen-mocks';
import { mockDonorApi, whenAdministrationCopied } from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

const LARGEST_SYSTEM_TEXT_PX = 53;
const NARROW_PHONE = { width: 375, height: 667 };
const LARGEST_SHARE_OF_THE_SCREEN = 0.5;

async function showLargestSystemText(page: Page): Promise<void> {
  await page.addInitScript((px) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `html { font-size: ${px}px; }`;
      document.head.append(style);
    });
  }, LARGEST_SYSTEM_TEXT_PX);
}

async function openUnlockedAdministration(page: Page, path: string): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await serveEmptyAdministrationCopy(page);
  await rememberedSession(page);
  const copied = whenAdministrationCopied(page);
  await page.goto(path);
  await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
  await copied();
}

function labelsOutsideTheirButton(bar: Locator): Promise<string[]> {
  return bar.evaluate((element) =>
    [...element.querySelectorAll<HTMLElement>('.ui-button')].flatMap((button) => {
      const box = button.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(button);
      const outside = [...range.getClientRects()].some(
        (line) =>
          line.width > 0 &&
          (line.left < box.left - 0.5 ||
            line.right > box.right + 0.5 ||
            line.top < box.top - 0.5 ||
            line.bottom > box.bottom + 0.5),
      );
      return outside ? [button.textContent!.trim()] : [];
    }),
  );
}

interface ButtonSizes {
  readonly lineBoxes: string[];
  readonly fontSizes: string[];
  readonly smallText: string;
}

function sizesOfTheButtons(bar: Locator): Promise<ButtonSizes> {
  return bar.evaluate((element) => {
    const buttons = [...element.querySelectorAll<HTMLElement>('.ui-button')];
    const probe = document.createElement('span');
    probe.style.fontSize = 'var(--text-sm)';
    element.append(probe);
    const smallText = getComputedStyle(probe).fontSize;
    probe.remove();
    return {
      lineBoxes: buttons.map((button) => {
        const style = getComputedStyle(button);
        return [style.lineHeight, style.paddingTop, style.paddingBottom].join(' ');
      }),
      fontSizes: buttons.map((button) => getComputedStyle(button).fontSize),
      smallText,
    };
  });
}

test.describe(`Given an administrator on an iPhone ${NARROW_PHONE.width} pt wide whose installed app shows the largest accessibility text`, () => {
  test.use({ viewport: NARROW_PHONE });

  test.beforeEach(async ({ page }) => {
    await showLargestSystemText(page);
  });

  test('when they start a new article, then the sticky action bar takes at most half of the screen and every button keeps its label inside it', async ({
    page,
  }) => {
    await openUnlockedAdministration(page, '/sprava/aktuality/nova');
    const bar = page.locator('.ui-action-bar');
    await expect(bar.getByRole('button', { name: 'Uložit koncept' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Uložit a zveřejnit' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(NARROW_PHONE.height * LARGEST_SHARE_OF_THE_SCREEN);
    expect(await labelsOutsideTheirButton(bar)).toEqual([]);
  });

  test('when they start a new article, then both buttons of the action bar keep the small text size and one line height and padding, so a line of either is one height', async ({
    page,
  }) => {
    await openUnlockedAdministration(page, '/sprava/aktuality/nova');
    const bar = page.locator('.ui-action-bar');
    await expect(bar.getByRole('button', { name: 'Uložit koncept' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Uložit a zveřejnit' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const { lineBoxes, fontSizes, smallText } = await sizesOfTheButtons(bar);

    expect(lineBoxes).toHaveLength(2);
    expect(lineBoxes[0]).toBe(lineBoxes[1]);
    expect(fontSizes).toEqual([smallText, smallText]);
  });
});

const SAVED_ARTICLE_PATH = `/sprava/aktuality/${article.id}`;
const LARGEST_SHARE_OF_THE_SCREEN_COVERED = 1 / 3;

function coveredShareOfTheScreen(bar: Locator): Promise<number> {
  return bar.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const covered = Math.max(0, Math.min(box.bottom, innerHeight) - Math.max(box.top, 0));
    return covered / innerHeight;
  });
}

test.describe(`Given an administrator on an iPhone ${NARROW_PHONE.width} pt wide whose installed app shows the largest accessibility text, editing a saved article`, () => {
  test.use({ viewport: NARROW_PHONE });

  test.beforeEach(async ({ page }) => {
    await showLargestSystemText(page);
  });

  test('when they read the form from its top, then the action bar covers at most a third of the screen and nothing on the page is wider than the screen', async ({
    page,
  }) => {
    await openUnlockedAdministration(page, SAVED_ARTICLE_PATH);
    const bar = page.locator('.ui-action-bar');
    await expect(bar.getByRole('button').first()).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));

    await expect
      .poll(() => coveredShareOfTheScreen(bar))
      .toBeLessThanOrEqual(LARGEST_SHARE_OF_THE_SCREEN_COVERED);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});

const PHONES_AT_DEFAULT_TEXT = [
  { width: 420, height: 746 },
  { width: 390, height: 700 },
  { width: 375, height: 667 },
];

interface BarLook {
  width: number;
  surfaceLeftGap: number;
  surfaceRightGap: number;
  sameRadius: boolean;
  sameShadow: boolean;
}

function barBesideTheCards(bar: Locator): Promise<BarLook> {
  return bar.evaluate((element) => {
    const card = document.querySelector<HTMLElement>('main .ui-card')!;
    const own = element.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const barStyle = getComputedStyle(element);
    const surface = getComputedStyle(element, '::before');
    const drawn = surface.content !== 'none' && surface.content !== 'normal';
    const look = drawn ? surface : barStyle;
    const left = drawn
      ? own.left + Number.parseFloat(barStyle.borderLeftWidth) + Number.parseFloat(surface.left)
      : own.left;
    const right = drawn
      ? own.right - Number.parseFloat(barStyle.borderRightWidth) - Number.parseFloat(surface.right)
      : own.right;
    const cardStyle = getComputedStyle(card);
    return {
      width: Math.round(own.width),
      surfaceLeftGap: Math.round(Math.abs(left - cardBox.left)),
      surfaceRightGap: Math.round(Math.abs(right - cardBox.right)),
      sameRadius: look.borderTopLeftRadius === cardStyle.borderTopLeftRadius,
      sameShadow: look.boxShadow === cardStyle.boxShadow,
    };
  });
}

for (const phone of PHONES_AT_DEFAULT_TEXT) {
  test.describe(`Given an administrator on an iPhone ${phone.width} pt wide editing a saved article`, () => {
    test.use({ viewport: phone });

    test('when they scroll from the top of the form to its end, then the floating action bar keeps its width and rests on a surface with the edges, radius and shadow of the cards', async ({
      page,
    }) => {
      await openUnlockedAdministration(page, SAVED_ARTICLE_PATH);
      const bar = page.locator('.ui-action-bar');
      await expect(bar.getByRole('button').first()).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(bar).toBeInViewport({ ratio: 1 });
      await expect(bar).not.toHaveClass(/ui-action-bar--resting/);
      const floating = await barBesideTheCards(bar);

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(bar).toHaveClass(/ui-action-bar--resting/);

      expect(floating.sameShadow).toBe(false);
      await expect
        .poll(() => barBesideTheCards(bar))
        .toEqual({
          width: floating.width,
          surfaceLeftGap: 0,
          surfaceRightGap: 0,
          sameRadius: true,
          sameShadow: true,
        });
    });
  });
}

const FLOATING_ENLARGED_TEXT_PX = [24, 26];
const SE = { width: 375, height: 667 };
const SCROLL_STEP_PX = 16;
const SETTLE_FRAMES = 3;
const STILL_FRAMES = 3;

for (const rootPx of FLOATING_ENLARGED_TEXT_PX) {
  test.describe(`Given an administrator on an iPhone ${SE.width} pt wide with a ${rootPx} px root text, editing a saved article whose bar still floats`, () => {
    test.use({ viewport: SE });

    test('when they scroll slowly through the whole form, then the action bar never changes how it stands while the page stands still', async ({
      page,
    }) => {
      await page.addInitScript((px) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = `html { font-size: ${px}px; }`;
          document.head.append(style);
        });
      }, rootPx);
      await openUnlockedAdministration(page, SAVED_ARTICLE_PATH);
      const bar = page.locator('.ui-action-bar');
      await expect(bar.getByRole('button').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      const result = await bar.evaluate(
        async (element, { step, settleFrames, stillFrames }) => {
          const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
          const state = () => element.className;
          let changesWhileStill = 0;
          let changes = 0;
          window.scrollTo({ top: 0, behavior: 'instant' });
          await frame();
          let seen = state();
          const end = () => document.documentElement.scrollHeight - innerHeight;
          for (let top = 0; top <= end() + step; top += step) {
            window.scrollTo({ top, behavior: 'instant' });
            for (let render = 0; render < settleFrames; render++) {
              await frame();
            }
            if (state() !== seen) {
              changes++;
              seen = state();
            }
            for (let still = 0; still < stillFrames; still++) {
              await frame();
              if (state() !== seen) {
                changesWhileStill++;
                seen = state();
              }
            }
          }
          return { changes, changesWhileStill };
        },
        { step: SCROLL_STEP_PX, settleFrames: SETTLE_FRAMES, stillFrames: STILL_FRAMES },
      );

      expect(result.changes).toBeGreaterThan(0);
      expect(result.changesWhileStill).toBe(0);
    });
  });
}
