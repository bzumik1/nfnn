import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, session, signIn } from './donor-session';

const PHONE = { width: 390, height: 844 };
const COMPUTER = { width: 1280, height: 800 };
const NEWS = '/api/admin/content/news';
const ARTICLE_ID = '0199f3e0-0000-7000-8000-00000000c001';

const article = {
  id: ARTICLE_ID,
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec.\n\nDruhý odstavec.',
  coverImage: null,
  publishedOn: '2026-10-20',
  live: true,
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
  version: '4c9e1a7b20d3f856',
};

function tabBar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Hlavní sekce' });
}

async function lowestContentEdge(page: Page): Promise<number> {
  return page.evaluate(() => {
    const underFixedChrome = (element: Element): boolean => {
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        const position = getComputedStyle(node).position;
        if (position === 'fixed' || position === 'sticky') {
          return true;
        }
      }
      return false;
    };
    const holdsContent = (element: Element): boolean =>
      element.matches('a[href], button, input, select, textarea, img') ||
      [...element.childNodes].some(
        (child) => child.nodeType === Node.TEXT_NODE && child.textContent!.trim() !== '',
      );
    let lowest = 0;
    for (const element of document.querySelectorAll('main *')) {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        box.height === 0 ||
        style.visibility === 'hidden' ||
        element.closest('[aria-hidden="true"], .visually-hidden') !== null ||
        !holdsContent(element) ||
        underFixedChrome(element)
      ) {
        continue;
      }
      lowest = Math.max(lowest, box.bottom);
    }
    return lowest;
  });
}

async function scrolledToTheEnd(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
  );
  await page.waitForFunction(
    () =>
      Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1,
  );
}

async function expectTheEndAboveTheTabBar(page: Page): Promise<void> {
  await scrolledToTheEnd(page);
  const bar = await tabBar(page).boundingBox();
  expect(bar).not.toBeNull();
  expect(await lowestContentEdge(page)).toBeLessThanOrEqual(bar!.y);
}

async function expectTheEndOnScreenWithoutTheTabBar(page: Page): Promise<void> {
  await expect(tabBar(page)).toHaveCount(0);
  await scrolledToTheEnd(page);
  const height = await page.evaluate(() => window.innerHeight);
  expect(await lowestContentEdge(page)).toBeLessThanOrEqual(height);
}

async function rememberedAdministrator(page: Page): Promise<void> {
  await mockDonorApi(page);
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

for (const [width, viewport] of [
  ['a phone', PHONE],
  ['a computer', COMPUTER],
] as const) {
  test.describe(`Given a visitor on ${width}, where the tab bar floats over the bottom of every page`, () => {
    test.use({ viewport });

    for (const path of ['/o-nas', '/aktuality', '/projekty', '/prispet']) {
      test(`when they scroll ${path} to its end, then its last line stands above the tab bar`, async ({
        page,
      }) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        await expectTheEndAboveTheTabBar(page);
      });
    }
  });
}

test.describe('Given a signed-in donor', () => {
  for (const [width, viewport] of [
    ['a phone', PHONE],
    ['a computer', COMPUTER],
  ] as const) {
    test(`when they scroll their overview to its end on ${width}, then no tab bar shows and its last line stands on screen`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.setViewportSize(COMPUTER);
      await signIn(page);
      await page.setViewportSize(viewport);

      await expectTheEndOnScreenWithoutTheTabBar(page);
    });
  }
});

test.describe('Given an administrator', () => {
  test.beforeEach(async ({ page }) => {
    await rememberedAdministrator(page);
  });

  test('when they scroll the administration to its end on a phone, then no tab bar shows and its last line stands on screen', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/sprava/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: 'Aktuality' })).toBeVisible();

    await expectTheEndOnScreenWithoutTheTabBar(page);
  });

  test('when they open the administration on a computer, then the side panel leads and no tab bar shows', async ({
    page,
  }) => {
    await page.setViewportSize(COMPUTER);
    await page.goto('/sprava/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: 'Aktuality' })).toBeVisible();

    await expect(page.getByRole('navigation', { name: 'Správa' })).toBeVisible();
    await expect(tabBar(page)).toHaveCount(0);
  });

  test('when they edit an article on a phone, then the editor fills the screen without the tab bar and its action bar stays in reach', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === `${NEWS}/${ARTICLE_ID}`,
      (route) => route.fulfill({ json: article }),
    );
    await page.setViewportSize(PHONE);

    await page.goto(`/sprava/aktuality/${ARTICLE_ID}`);
    const save = page
      .locator('.ui-action-bar')
      .getByRole('button', { name: 'Uložit a ukázat na webu' });
    await expect(save).toBeVisible();

    await expect(tabBar(page)).toHaveCount(0);
    await expect(save).toBeInViewport({ ratio: 1 });
  });

  test('when they edit an article on a computer, then nothing covers the action bar', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === `${NEWS}/${ARTICLE_ID}`,
      (route) => route.fulfill({ json: article }),
    );
    await page.setViewportSize(COMPUTER);

    await page.goto(`/sprava/aktuality/${ARTICLE_ID}`);
    const save = page
      .locator('.ui-action-bar')
      .getByRole('button', { name: 'Uložit a ukázat na webu' });
    await expect(save).toBeVisible();
    await save.click({ trial: true });

    await expect(tabBar(page)).toHaveCount(0);
  });
});
