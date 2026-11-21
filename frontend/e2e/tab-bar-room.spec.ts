import type { Locator, Page } from '@playwright/test';
import { mockPublicContent, servePaymentDetails } from './baseline/screen-mocks';
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

async function resolvedLength(page: Page, length: string): Promise<number> {
  return page.evaluate((value) => {
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.height = value;
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  }, length);
}

async function bottomPaddingOfTheBody(page: Page): Promise<number> {
  return page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom));
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

test.describe('Given a visitor on a computer, where a page ends with a section that keeps its full bottom padding', () => {
  test.use({ viewport: COMPUTER });

  for (const { path, lastPart } of [
    { path: '/o-nas', lastPart: '#kontakt form' },
    { path: '/prispet', lastPart: '#prispet .bank' },
  ]) {
    test(`when they scroll ${path} to its end, then the empty band between its last line and the tab bar is no taller than the room the bar takes`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await mockPublicContent(page);
      await servePaymentDetails(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator(lastPart).first()).toBeVisible();
      await scrolledToTheEnd(page);

      const bar = await tabBar(page).boundingBox();
      expect(bar).not.toBeNull();
      const roomOfTheBar = COMPUTER.height - bar!.y;
      const emptyBand = bar!.y - (await lowestContentEdge(page));

      expect(emptyBand).toBeLessThanOrEqual(roomOfTheBar);
    });
  }
});

for (const [width, viewport] of [
  ['a phone', PHONE],
  ['a computer', COMPUTER],
] as const) {
  test.describe(`Given a visitor on ${width}, where a page ends with a section that holds the tab bar in its bottom padding`, () => {
    test.use({ viewport });

    for (const { path, lastPart } of [
      { path: '/o-nas', lastPart: '#kontakt form' },
      { path: '/prispet', lastPart: '#prispet .bank' },
    ]) {
      test(`when they scroll ${path} to its end, then its last line keeps at least the tab bar's room and --space-6 above the page's end`, async ({
        page,
      }) => {
        await mockDonorApi(page);
        await mockPublicContent(page);
        await servePaymentDetails(page);
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.locator(lastPart).first()).toBeVisible();
        await scrolledToTheEnd(page);

        const floor = await resolvedLength(page, 'calc(var(--tab-bar-clearance) + var(--space-6))');
        const roomUnderTheLastLine = viewport.height - (await lowestContentEdge(page));

        expect(roomUnderTheLastLine).toBeGreaterThanOrEqual(floor - 1);
      });
    }
  });
}

test.describe('Given a visitor on a phone who has lost the connection, so the Offline pill floats above the tab bar', () => {
  test.use({ viewport: PHONE });

  for (const { path, lastPart } of [
    { path: '/o-nas', lastPart: '#kontakt form' },
    { path: '/prispet', lastPart: '#prispet .bank' },
  ]) {
    test(`when they scroll ${path} to its end, then its last line stands above the pill, and the page adds no more room under it than the body keeps for the pill`, async ({
      page,
      context,
    }) => {
      await mockDonorApi(page);
      await mockPublicContent(page);
      await servePaymentDetails(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator(lastPart).first()).toBeVisible();
      await scrolledToTheEnd(page);
      const roomUnderTheLastLineOnline = PHONE.height - (await lowestContentEdge(page));
      const bodyPaddingOnline = await bottomPaddingOfTheBody(page);

      await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
      await context.setOffline(true);
      const pill = page.getByRole('button', { name: /^Offline/ });
      await expect(pill).toBeVisible();
      await expect(page.locator('html')).toHaveClass(/\bis-offline\b/);
      await scrolledToTheEnd(page);

      const box = await pill.boundingBox();
      expect(box).not.toBeNull();
      const lastLine = await lowestContentEdge(page);
      expect(lastLine).toBeLessThanOrEqual(box!.y);
      const roomAddedOffline = PHONE.height - lastLine - roomUnderTheLastLineOnline;
      const bodyPaddingAddedOffline = (await bottomPaddingOfTheBody(page)) - bodyPaddingOnline;
      expect(roomAddedOffline).toBeLessThanOrEqual(bodyPaddingAddedOffline + 1);
    });
  }
});

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
