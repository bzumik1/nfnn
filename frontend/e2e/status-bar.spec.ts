import type { Page } from '@playwright/test';
import { mockDonorApi, session, signIn } from './donor-session';
import { expect, test } from './fixtures';

const SAMPLE_INSET = 4;
const THIN_BORDER = 10;
const NEARLY_TRANSPARENT = 0.1;

async function safariLeavesTheStatusBarUntinted(page: Page): Promise<boolean> {
  return page.evaluate(
    ({ inset, thin, transparent }) => {
      const ignorePointerEvents = document.createElement('style');
      ignorePointerEvents.textContent = '* { pointer-events: auto !important; }';
      document.head.append(ignorePointerEvents);
      const hit = document.elementFromPoint(window.innerWidth / 2, inset);
      ignorePointerEvents.remove();
      let backdropFilter = false;
      let element: Element | null = hit ?? null;
      while (element) {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const shown = style.visibility !== 'hidden' && Number(style.opacity) >= transparent;
        const wide = box.width >= window.innerWidth * 0.9 && box.width > thin && box.height > thin;
        if (shown) {
          backdropFilter ||= style.backdropFilter !== 'none' && style.backdropFilter !== '';
        }
        if ((style.position === 'fixed' || style.position === 'sticky') && shown && wide) {
          return backdropFilter;
        }
        element = element.parentElement;
      }
      return true;
    },
    { inset: SAMPLE_INSET, thin: THIN_BORDER, transparent: NEARLY_TRANSPARENT },
  );
}

test.describe('Given a visitor on an iPhone, whose Safari tints its status bar from a fixed box at the top edge without a backdrop filter and otherwise lets the page show under it', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ['/', '/projekty', '/zasady-ochrany-osobnich-udaju']) {
    test(`when ${path} opens, then Safari finds no box to tint the status bar from`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await expect.poll(() => safariLeavesTheStatusBarUntinted(page)).toBe(true);
    });

    test(`when ${path} is scrolled, then Safari still finds no box to tint the status bar from`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));

      await expect.poll(() => safariLeavesTheStatusBarUntinted(page)).toBe(true);
    });
  }

  test('when a donor opens the overview, then Safari finds no box to tint the status bar from', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockDonorApi(page);
    await signIn(page);
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect.poll(() => safariLeavesTheStatusBarUntinted(page)).toBe(true);
  });

  test('when a page opens, then it paints no tint strip and names no theme colour', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.goto('/projekty');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect(page.locator('.status-bar-tint')).toHaveCount(0);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(0);
  });
});

test.describe('Given the app opened from an iPhone home screen, whose web view starts under the status bar only when the page asks for it', () => {
  test('when a page opens, then it asks iOS to lay the page under the status bar', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect(
      page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
    ).toHaveAttribute('content', 'black-translucent');
  });
});
