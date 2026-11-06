import { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c001',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'Zahradu stavíme s dobrovolníky.\n\nPlán najdete na [stránkách obce](https://example.cz/plan).',
  coverImage: null,
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

const olderArticle = {
  ...article,
  id: '0199f3e0-0000-7000-8000-00000000c002',
  slug: 'letni-tabor',
  title: 'Letní tábor',
  publishedOn: '2026-08-10',
};

async function publishedArticle(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({
        json: { items: [article, olderArticle], page: 0, size: 10, total: 2, hasMore: false },
      }),
  );
}

async function selectEverything(page: Page): Promise<string> {
  return page.evaluate(() => {
    const selection = document.getSelection();
    selection?.selectAllChildren(document.body);
    return selection?.toString() ?? '';
  });
}

test.describe('Given a visitor on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('when they select everything on a news article, then the article text and its link are selected and the labels of the controls are not', async ({
    page,
  }) => {
    await publishedArticle(page);
    await page.goto(`/aktuality/${article.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();

    const selected = await selectEverything(page);

    expect(selected).toContain('Zahradu stavíme s dobrovolníky.');
    expect(selected).toContain('stránkách obce');
    expect(selected).not.toContain('Přihlásit se');
    expect(selected).not.toContain('Všechny aktuality');
    expect(selected).not.toContain('Pomáháme');
  });

  test('when they select everything on Aktuality, then the labels of the news cards and the tabs are not selected', async ({
    page,
  }) => {
    await publishedArticle(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('link', { name: olderArticle.title })).toBeVisible();

    const selected = await selectEverything(page);

    expect(selected).not.toContain(olderArticle.title);
    expect(selected).not.toContain('Pomáháme');
  });

  test('when they select everything on Přispět, then the bank details are selected and the copy buttons are not', async ({
    page,
  }) => {
    await page.goto('/prispet');
    const accountNumber = page.locator('.bank-value').first();
    await expect(accountNumber).toHaveText(/\d/);
    await expect(page.getByRole('button', { name: /^Kopírovat/ }).first()).toBeVisible();

    const selected = await selectEverything(page);

    expect(selected).toContain((await accountNumber.textContent())?.trim() ?? '');
    expect(selected).toMatch(/CZ\d{2}/);
    expect(selected).not.toContain('Kopírovat');
  });
});
