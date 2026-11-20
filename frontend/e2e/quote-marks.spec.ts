import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi } from './donor-session';

const SIZE_TOLERANCE = 0.5;

interface DrawnMark {
  element: string;
  width: number;
  height: number;
}

async function drawnMark(mark: Locator): Promise<DrawnMark> {
  await expect(mark).toBeVisible();
  return mark.evaluate((host) => {
    const drawn = host.matches('svg') ? host : (host.querySelector('svg') ?? host);
    const box = drawn.getBoundingClientRect();
    return { element: drawn.localName, width: box.width, height: box.height };
  });
}

async function serveFoundersNote(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/home',
    (route) =>
      route.fulfill({
        json: {
          news: [],
          projects: [],
          people: {
            featured: [],
            board: [],
            footnote: null,
            note: { text: 'Děkujeme všem, kdo pomáhají s námi.', signatures: [] },
          },
        },
      }),
  );
}

test.describe('Given a visitor on a computer who reads the quotes on Přispět and O nás', () => {
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await serveFoundersNote(page);
  });

  test('when they see both quotes, then both open with the same drawn quote mark of the same size', async ({
    page,
  }) => {
    await page.goto('/prispet');
    const donateMark = await drawnMark(page.locator('.donate-quote-mark'));

    await page.goto('/o-nas');
    const aboutMark = await drawnMark(page.locator('#o-nas .quote-mark'));

    expect(donateMark.element).toBe('svg');
    expect(aboutMark.element).toBe(donateMark.element);
    expect(Math.abs(aboutMark.width - donateMark.width)).toBeLessThanOrEqual(SIZE_TOLERANCE);
    expect(Math.abs(aboutMark.height - donateMark.height)).toBeLessThanOrEqual(SIZE_TOLERANCE);
  });
});
