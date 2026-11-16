import { Locator, Page } from '@playwright/test';
import { mockDonorApi, samplePngBase64 } from './donor-session';
import { expect, test } from './fixtures';

const PNG = Buffer.from(samplePngBase64, 'base64');
const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a001';

function story(index: number, year: number): Record<string, unknown> {
  return {
    id: `0199f3e0-0000-7000-8000-${String(year)}${String(index).padStart(8, '0')}`,
    slug: `pribeh-${year}-${index}`,
    title: `Příběh ${index} z roku ${year}`,
    year,
    category: 'CHILDREN',
    tag: 'Pomůcky',
    perex: `Krátce o příběhu ${index}.`,
    body: 'Text příběhu.',
    coverImage: {
      id: IMAGE_ID,
      url: `/api/content/media/${IMAGE_ID}`,
      alt: null,
      focalPoint: null,
    },
    publishedOn: `${year}-10-01`,
    createdAt: `${year}-09-19T09:00:00Z`,
    updatedAt: `${year}-10-01T07:30:00Z`,
    live: true,
  };
}

const STORIES = [
  ...Array.from({ length: 13 }, (_, index) => story(index + 1, 2025)),
  story(1, 2024),
  story(2, 2024),
];

async function publishedStories(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({
        json: { items: STORIES, page: 0, size: 50, total: STORIES.length, hasMore: false },
      }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) => route.fulfill({ json: { items: [], page: 0, size: 50, total: 0, hasMore: false } }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: PNG }),
  );
}

function revealingInFirstWindow(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.motion-reveal')]
      .filter((element) => element.getBoundingClientRect().top < window.innerHeight)
      .map((element) => element.className),
  );
}

function waiting(locator: Locator): Promise<boolean> {
  return locator.evaluate(
    (element) =>
      element.classList.contains('motion-reveal') &&
      !element.classList.contains('motion-reveal--shown'),
  );
}

async function liftAfterMotion(tile: Locator): Promise<string> {
  await expect.poll(() => tile.evaluate((element) => element.getAnimations().length)).toBe(0);
  return tile.evaluate((element) => getComputedStyle(element).translate);
}

async function settled(page: Page): Promise<void> {
  await expect(page.locator('.motion-reveal')).toHaveCount(0);
}

async function scrollToEnd(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, 600);
      return page.evaluate(
        () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
      );
    })
    .toBe(true);
}

const REVEALING_STORIES = ['.year-head', '.grid-item', '.year-all', 'app-donate-band'];

const REVEALING_ABOUT = ['.board-title', '.signer', 'app-donate-band'];

test.describe('Given a visitor on a computer', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedStories(page);
  });

  test('when Pomáháme opens, then nothing in the first window waits, the blocks below wait, and each moves in when scrolled to and then stands still', async ({
    page,
  }) => {
    await page.goto('/projekty');
    await expect(page.locator('.grid-item').first()).toBeVisible();

    expect(await revealingInFirstWindow(page)).toEqual([]);
    expect(await waiting(page.locator('app-donate-band'))).toBe(true);
    expect(await waiting(page.locator('.grid-item').last())).toBe(true);
    for (const selector of ['h1', '.summary', '.chips', '.grid-item--large']) {
      await expect(page.locator(selector).first()).not.toHaveClass(/motion-reveal/);
    }

    await scrollToEnd(page);

    await settled(page);
  });

  test('when Pomáháme opens, then every block that may move in is one of its year sections or the Přispět band', async ({
    page,
  }) => {
    await page.goto('/projekty');
    await expect(page.locator('.grid-item').first()).toBeVisible();

    const hosts = await page.evaluate(
      (selectors) =>
        [...document.querySelectorAll('.motion-reveal')].filter(
          (element) => !selectors.some((selector) => element.matches(selector)),
        ).length,
      REVEALING_STORIES,
    );
    expect(hosts).toBe(0);
    await expect(page.locator('.grid-item.motion-reveal').first()).toBeAttached();
  });

  test('when the visitor leaves Pomáháme for another tab and comes back, then nothing moves in again', async ({
    page,
  }) => {
    await page.goto('/projekty');
    await expect(page.locator('.grid-item').first()).toBeVisible();
    await scrollToEnd(page);
    await settled(page);

    await page
      .getByRole('navigation', { name: 'Hlavní sekce' })
      .getByRole('link', { name: 'O nás' })
      .click();
    await expect(page).toHaveURL('/o-nas');
    await page
      .getByRole('navigation', { name: 'Hlavní sekce' })
      .getByRole('link', { name: 'Pomáháme' })
      .click();
    await expect(page).toHaveURL(/\/projekty/);

    await expect(page.locator('.grid-item').first()).toBeVisible();
    await expect(page.locator('.motion-reveal')).toHaveCount(0);
  });

  test('when O nás opens, then the people and the Přispět band wait below the first window and move in when scrolled to', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.signer').first()).toBeAttached();

    expect(await revealingInFirstWindow(page)).toEqual([]);
    expect(await waiting(page.locator('app-donate-band'))).toBe(true);
    const others = await page.evaluate(
      (selectors) =>
        [...document.querySelectorAll('.motion-reveal')].filter(
          (element) => !selectors.some((selector) => element.matches(selector)),
        ).length,
      REVEALING_ABOUT,
    );
    expect(others).toBe(0);

    await scrollToEnd(page);

    await settled(page);
  });

  test('when the pointer rests on a story tile and when the keyboard focuses its link, then the tile is lifted the same way', async ({
    page,
  }) => {
    await page.goto('/projekty?rok=2024');
    const tile = page.locator('app-story-tile').first();
    await expect(tile).toBeVisible();
    const resting = await liftAfterMotion(tile);

    await tile.hover();
    const hovered = await liftAfterMotion(tile);
    expect(hovered).not.toBe(resting);
    await page.mouse.move(0, 0);
    expect(await liftAfterMotion(tile)).toBe(resting);

    await page.keyboard.press('Tab');
    await tile.getByRole('link').focus();

    expect(await liftAfterMotion(tile)).toBe(hovered);
  });
});

async function watchContactIntro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen = window as unknown as { contactIntroHidden: boolean };
    seen.contactIntroHidden = false;
    new MutationObserver(() => {
      if (document.querySelector('.contact-left.motion-reveal')) {
        seen.contactIntroHidden = true;
      }
    }).observe(document, { subtree: true, attributes: true, childList: true });
  });
}

function contactIntroWasHidden(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { contactIntroHidden: boolean }).contactIntroHidden,
  );
}

test.describe('Given a visitor on a computer who follows a link to the contact', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await watchContactIntro(page);
  });

  test('when O nás opens at #kontakt, then the contact intro is never hidden or waiting', async ({
    page,
  }) => {
    await page.goto('/o-nas#kontakt');
    await expect(page.locator('.contact-left')).toBeInViewport();
    await page.waitForLoadState('networkidle');

    expect(await contactIntroWasHidden(page)).toBe(false);
  });

  test('when the 404 page leads to Napište nám, then the contact intro is never hidden or waiting', async ({
    page,
  }) => {
    await page.goto('/neexistujici-stranka');
    await page.getByRole('link', { name: 'Napište nám' }).click();
    await expect(page).toHaveURL('/o-nas#kontakt');
    await expect(page.locator('.contact-left')).toBeInViewport();
    await page.waitForLoadState('networkidle');

    expect(await contactIntroWasHidden(page)).toBe(false);
  });
});

test.describe('Given a visitor on a computer who asks for less motion', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedStories(page);
  });

  for (const [name, path, ready] of [
    ['Pomáháme', '/projekty', '.grid-item'],
    ['O nás', '/o-nas', '.signer'],
  ] as const) {
    test(`when ${name} opens, then nothing waits hidden`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator(ready).first()).toBeAttached();
      await expect(page.locator('app-donate-band')).toBeAttached();

      await expect(page.locator('.motion-reveal')).toHaveCount(0);
    });
  }
});
