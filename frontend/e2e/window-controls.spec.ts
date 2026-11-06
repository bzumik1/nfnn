import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, noDonations, signIn } from './donor-session';

const IPAD_SCREEN = { width: 820, height: 1180 };
const IPAD_SCREEN_ON_ITS_SIDE = { width: 1180, height: 820 };
const WINDOW_BOTTOM_CORNER_INSET = 10;
const STATUS_BAR_HEIGHT = 32;
const WINDOW_CONTROLS_AREA = { right: 62, bottom: 41 };

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c401',
  slug: 'okno-na-ipadu',
  title: 'Ohlédnutí za rokem',
  tag: 'Výroční ohlédnutí',
  perex: 'Co všechno se letos podařilo.',
  body: 'První odstavec.\n\nDruhý odstavec.',
  coverImage: null,
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

type Window = 'smaller-than-screen' | 'maximized';

async function openedFromIpadHomeScreen(
  page: Page,
  window: Window,
  screen = IPAD_SCREEN,
): Promise<void> {
  await page.addInitScript(
    ({ window, screen, bottomInset }) => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
      Object.defineProperty(Screen.prototype, 'width', { get: () => screen.width });
      Object.defineProperty(Screen.prototype, 'height', { get: () => screen.height });
      Object.defineProperty(globalThis, 'outerWidth', {
        get: () => (window === 'maximized' ? screen.width : innerWidth),
      });
      Object.defineProperty(globalThis, 'outerHeight', {
        get: () => (window === 'maximized' ? screen.height : innerHeight + bottomInset),
      });
    },
    { window, screen, bottomInset: WINDOW_BOTTOM_CORNER_INSET },
  );
}

async function articleServed(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
}

async function liesUnderWindowControls(locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  if (!box) {
    return false;
  }
  return box.x < WINDOW_CONTROLS_AREA.right && box.y < WINDOW_CONTROLS_AREA.bottom;
}

function logo(page: Page): Locator {
  return page.getByRole('banner').getByRole('link', { name: 'Nová naděje – nadační fond' });
}

test.describe('Given the app opened from the home screen of an iPad, in a window smaller than the screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 700 });
    await openedFromIpadHomeScreen(page, 'smaller-than-screen');
  });

  test('when a tab opens, then its logo and sign-in stand clear of the window controls', async ({
    page,
  }) => {
    await page.goto('/aktuality');

    await expect(logo(page)).toBeVisible();
    expect(await liesUnderWindowControls(logo(page))).toBe(false);
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }),
    ).toBeInViewport({
      ratio: 1,
    });
  });

  test('when a page deeper in a tab opens, then its back button and logo stand clear of the window controls', async ({
    page,
  }) => {
    await articleServed(page);
    await page.goto(`/aktuality/${article.slug}`);

    const back = page.getByRole('button', { name: 'Zpět' });
    await expect(back).toBeVisible();
    expect(await liesUnderWindowControls(back)).toBe(false);
    expect(await liesUnderWindowControls(logo(page))).toBe(false);
  });

  test('when the keyboard reaches the skip link, then it shows clear of the window controls', async ({
    page,
  }) => {
    await page.goto('/aktuality');
    await expect(logo(page)).toBeVisible();

    const skipLink = page.getByRole('link', { name: 'Přeskočit na obsah' });
    for (
      let step = 0;
      step < 10 && !(await skipLink.evaluate((link) => link === document.activeElement));
      step++
    ) {
      await page.keyboard.press('Tab');
    }

    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport({ ratio: 1 });
    expect(await liesUnderWindowControls(skipLink)).toBe(false);
  });

  test('when the window is maximized, then the logo returns to the edge of the content column', async ({
    page,
  }) => {
    await page.goto('/aktuality');
    await expect(logo(page)).toBeVisible();
    const windowed = (await logo(page).boundingBox())?.x ?? 0;

    await page.evaluate(() => {
      Object.defineProperty(globalThis, 'outerWidth', { get: () => screen.width });
      Object.defineProperty(globalThis, 'outerHeight', { get: () => screen.height });
    });
    await page.setViewportSize({
      width: IPAD_SCREEN.width,
      height: IPAD_SCREEN.height - STATUS_BAR_HEIGHT,
    });

    await expect.poll(async () => (await logo(page).boundingBox())?.x).toBeLessThan(windowed);
  });
});

test.describe('Given the app opened from the home screen of an iPad, in a maximized window', () => {
  test('when a tab opens, then the header keeps the same place as in a browser tab', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 820, height: IPAD_SCREEN.height - STATUS_BAR_HEIGHT });
    await openedFromIpadHomeScreen(page, 'maximized');
    await page.goto('/aktuality');
    await expect(logo(page)).toBeVisible();

    const tab = await browser.newPage({ viewport: page.viewportSize() ?? undefined });
    await tab.goto(page.url());
    await expect(logo(tab)).toBeVisible();

    expect(await logo(page).boundingBox()).toEqual(await logo(tab).boundingBox());
    await tab.close();
  });
});

test.describe('Given a signed-in donor in the iPad app, in a wide window on an iPad on its side', () => {
  test('when the page scrolls under the side panel, then no part of the panel stands under the window controls', async ({
    page,
  }) => {
    await openedFromIpadHomeScreen(page, 'smaller-than-screen', IPAD_SCREEN_ON_ITS_SIDE);
    await mockDonorApi(page, noDonations);
    await signIn(page);
    await page.setViewportSize({ width: 1000, height: 420 });

    const panel = page.locator('.side-nav-panel');
    await expect(panel).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    const underControls = await panel.evaluate(
      (nav, area) =>
        [...nav.querySelectorAll('p, a')].some((element) => {
          const box = element.getBoundingClientRect();
          return box.bottom > 0 && box.left < area.right && box.top < area.bottom;
        }),
      WINDOW_CONTROLS_AREA,
    );
    expect(underControls).toBe(false);
  });
});
