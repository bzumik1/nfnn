import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, openAccountItem, signIn } from './donor-session';

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c001',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec.',
  coverImage: null,
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

async function publishedArticle(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({ json: { items: [article], page: 0, size: 10, total: 1, hasMore: false } }),
  );
}

function tabs(page: Page) {
  return page.getByRole('navigation', { name: 'Hlavní sekce' });
}

function back(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: 'Zpět' });
}

async function openArticleFromList(page: Page): Promise<void> {
  await page.goto('/aktuality');
  await page.getByRole('link', { name: article.title }).click();
  await expect(page).toHaveURL(`/aktuality/${article.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeFocused();
}

test.describe('Given a visitor who moves through the tabs and back', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedArticle(page);
  });

  test('when they press Zpět with the keyboard on an article opened from the list, then the list returns and its heading takes the focus', async ({
    page,
  }) => {
    await openArticleFromList(page);

    await back(page).focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: 'Aktuality' })).toBeFocused();
  });

  test('when they reload the article and press Zpět, then the list returns without leaving the site', async ({
    page,
  }) => {
    await openArticleFromList(page);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });

  test('when they leave the article for another tab and come back, then the tab opens the article again and Zpět stays in the tab', async ({
    page,
  }) => {
    await openArticleFromList(page);

    await tabs(page).getByRole('link', { name: 'Pomáháme' }).click();
    await expect(page).toHaveURL('/projekty');
    await tabs(page).getByRole('link', { name: 'Aktuality' }).click();
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: 'Aktuality' })).toBeFocused();
  });

  test('when they open an article from outside the site and press Zpět, then its list opens in place of it', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${article.slug}`);

    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });
});

test.describe('Given a signed-in donor on a phone who opens a section from the account sheet', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/o-nas');
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await tabs(page).getByRole('link', { name: 'O nás' }).click();
    await expect(page).toHaveURL('/o-nas');
  });

  test('when they choose a section, then its heading takes the focus, also for the next section chosen inside the account', async ({
    page,
  }) => {
    await openAccountItem(page, 'Moje dary');
    await expect(page.getByRole('heading', { level: 1, name: 'Moje dary' })).toBeFocused();

    await openAccountItem(page, 'Potvrzení o daru');

    await expect(page).toHaveURL('/darce/potvrzeni');
    await expect(page.getByRole('heading', { level: 1, name: 'Potvrzení o daru' })).toBeFocused();
  });

  test('when they go back with the browser, then the page the sheet was opened on returns', async ({
    page,
  }) => {
    await openAccountItem(page, 'Moje dary');
    await expect(page).toHaveURL('/darce/dary');

    await page.goBack();

    await expect(page).toHaveURL('/o-nas');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('when they press Zpět, then the page the sheet was opened on returns', async ({ page }) => {
    await openAccountItem(page, 'Moje dary');
    await expect(page).toHaveURL('/darce/dary');

    await back(page).click();

    await expect(page).toHaveURL('/o-nas');
  });

  test('when they choose the section already open, then the sheet closes and one Back leaves it', async ({
    page,
  }) => {
    await openAccountItem(page, 'Moje dary');
    await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('link', { name: 'Moje dary' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await sheet.getByRole('link', { name: 'Moje dary' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL('/darce/dary');
    await page.goBack();

    await expect(page).toHaveURL('/o-nas');
  });
});

test.describe('Given an address of a section of the old one-page home', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  for (const [old, now, heading] of [
    ['/#prispet', '/prispet', 'Přispějte na pomůcky pro děti'],
    ['/#o-nas', '/o-nas', null],
    ['/#projekty', '/projekty', 'Komu jsme pomohli'],
    ['/#aktuality', '/aktuality', 'Aktuality'],
    ['/#uvod', '/', null],
  ] as const) {
    test(`when ${old} is opened, then ${now} shows and Back does not return to the old address`, async ({
      page,
    }) => {
      await page.goto(old);

      await expect(page).toHaveURL(now);
      if (heading !== null) {
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      }
      await page.goBack();
      await expect(page).toHaveURL('about:blank');
    });
  }

  test('when /#kontakt is opened, then the contact section of O nás is on screen', async ({
    page,
  }) => {
    await page.goto('/#kontakt');

    await expect(page).toHaveURL('/o-nas#kontakt');
    await expect(page.locator('#kontakt')).toBeInViewport();
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });
});
