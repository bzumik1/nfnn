import {
  administrator,
  mockDonorApi,
  openAccountItem,
  session,
  whenAdministrationCopied,
} from './donor-session';
import { expect, test } from './fixtures';

const LIST_TITLE = 'Co je u nás nového';
const article = {
  id: '0199f3e0-0000-7000-8000-00000000c021',
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

test.describe('Given an administrator on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) =>
        route.fulfill({ json: { items: [article], page: 0, size: 10, total: 1, hasMore: false } }),
    );
    await page.addInitScript(() => localStorage.setItem('nfnn.donor-session', '1'));
  });

  test('when they open Správa from the account sheet over the news, go a section deeper and press Zavřít, then the news is back', async ({
    page,
  }) => {
    const copied = whenAdministrationCopied(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
    await openAccountItem(page, 'Správa');
    await expect(page).toHaveURL(/\/sprava$/);
    await copied();

    const head = page.getByRole('banner');
    await expect(head.getByRole('button', { name: 'Zpět' })).toBeVisible();
    await expect(head.getByRole('button', { name: 'Účet' })).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Sekce správy' })
      .getByRole('link', { name: /Lidé fondu, správci, zálohy/ })
      .click();
    await expect(page).toHaveURL(/\/sprava\/vice$/);

    await head.getByRole('button', { name: 'Zavřít' }).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
  });

  test('when Správa opened by its address and they press Zavřít, then the site opens at home', async ({
    page,
  }) => {
    await page.goto('/sprava/vice');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Občas a pro technika' }),
    ).toBeVisible();

    await page.getByRole('banner').getByRole('button', { name: 'Zavřít' }).click();

    await expect(page).toHaveURL('/');
  });
});
