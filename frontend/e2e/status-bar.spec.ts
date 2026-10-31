import type { Page } from '@playwright/test';
import { mockDonorApi, signIn } from './donor-session';
import { expect, test } from './fixtures';

const SAMPLE_INSET = 4;
const THIN_BORDER = 10;
const NEARLY_TRANSPARENT = 0.1;

async function topEdgeContainer(page: Page) {
  return page.evaluate(
    ({ inset, thin, transparent }) => {
      const ignorePointerEvents = document.createElement('style');
      ignorePointerEvents.textContent = '* { pointer-events: auto !important; }';
      document.head.append(ignorePointerEvents);
      const hit = document.elementFromPoint(window.innerWidth / 2, inset);
      ignorePointerEvents.remove();
      let element: Element | null = hit ?? null;
      while (element && getComputedStyle(element).position !== 'fixed') {
        element = element.parentElement;
      }
      if (!element) {
        return null;
      }
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        wide: box.width >= window.innerWidth * 0.9,
        thick: box.width > thin && box.height > thin,
        opaqueEnough: Number(style.opacity) >= transparent,
        background: style.backgroundColor,
      };
    },
    { inset: SAMPLE_INSET, thin: THIN_BORDER, transparent: NEARLY_TRANSPARENT },
  );
}

async function expectSafariTintsTheStatusBarBlue(page: Page): Promise<void> {
  await expect
    .poll(() => topEdgeContainer(page))
    .toEqual({ wide: true, thick: true, opaqueEnough: true, background: 'rgb(37, 99, 235)' });
}

test.describe('Given a visitor on an iPhone, whose Safari tints its status bar from the fixed box at the top edge', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ['/', '/projekty', '/zasady-ochrany-osobnich-udaju']) {
    test(`when ${path} opens, then the box Safari finds there carries the site's blue`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.goto(path);

      await expectSafariTintsTheStatusBarBlue(page);
    });
  }

  test('when a donor opens the overview, then the status bar is blue there too', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockDonorApi(page);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    await expectSafariTintsTheStatusBarBlue(page);
  });

  test('when the home page opens, then the box shows at most a faint line over the photo and takes no tap', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.status-bar-tint')).toHaveCount(1);

    const visible = await page.evaluate(() => {
      const tint = document.querySelector('.status-bar-tint') as HTMLElement;
      const box = tint.getBoundingClientRect();
      return {
        height: Math.max(0, box.bottom),
        opacity: Number(getComputedStyle(tint).opacity),
        taps: getComputedStyle(tint).pointerEvents,
      };
    });
    expect(visible.height).toBeLessThanOrEqual(5);
    expect(visible.opacity).toBeLessThanOrEqual(0.12);
    expect(visible.taps).toBe('none');
  });

  test('when a page opens in Chrome on Android or an older Safari, then the theme-color it reads is the same blue', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.goto('/projekty');

    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      'rgb(37, 99, 235)',
    );
  });
});
