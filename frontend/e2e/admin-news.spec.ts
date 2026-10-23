import { expect, Page, test } from '@playwright/test';
import { administrator, mockDonorApi, problem, session } from './donor-session';

const NEWS = '/api/admin/content/news';
const MEDIA = '/api/admin/content/media';
const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a001';
const ARTICLE_ID = '0199f3e0-0000-7000-8000-00000000c001';
const DRAFT_ID = '0199f3e0-0000-7000-8000-00000000c002';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQTX4NRwzEcQBO0hcxU+9NfQAAAABJRU5ErkJggg==',
  'base64',
);

function article(overrides: Record<string, unknown> = {}) {
  return {
    id: ARTICLE_ID,
    slug: 'zahrada-pro-deti',
    title: 'Zahrada pro děti',
    tag: 'Projekt',
    perex: 'Stavíme zahradu, kde si děti budou hrát.',
    body: 'První odstavec.\n\nDruhý odstavec.',
    coverImage: { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}` },
    publishedOn: '2026-10-20',
    createdAt: '2026-10-19T09:00:00Z',
    updatedAt: '2026-10-20T07:30:00Z',
    ...overrides,
  };
}

function draft(overrides: Record<string, unknown> = {}) {
  return article({
    id: DRAFT_ID,
    slug: 'beneficni-koncert',
    title: 'Benefiční koncert',
    tag: null,
    perex: 'Zveme vás na koncert.',
    body: 'Text o koncertu.',
    coverImage: null,
    publishedOn: null,
    createdAt: '2026-10-22T09:00:00Z',
    updatedAt: '2026-10-22T09:00:00Z',
    ...overrides,
  });
}

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator managing the news', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when they open the list, then drafts and published articles show their state and lead to the editor', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === NEWS,
      (route) => route.fulfill({ json: { items: [draft(), article()] } }),
    );
    await page.route(
      (url) => url.pathname === `${NEWS}/${ARTICLE_ID}`,
      (route) => route.fulfill({ json: article() }),
    );

    await page.goto('/sprava/aktuality');

    await expect(page).toHaveTitle('Aktuality | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Aktuality' })).toBeFocused();
    await expect(page.locator('tbody tr').nth(0).locator('td')).toHaveText([
      'Benefiční koncert',
      'bez štítku',
      'Koncept',
      '22. 10. 2026 11:00',
    ]);
    await expect(page.locator('tbody tr').nth(1).locator('td')).toHaveText([
      'Zahrada pro děti',
      'Projekt',
      'Zveřejněno 20. 10. 2026',
      '20. 10. 2026 09:30',
    ]);

    await page.getByRole('link', { name: 'Zahrada pro děti' }).click();

    await expect(page).toHaveURL(`/sprava/aktuality/${ARTICLE_ID}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Úprava aktuality' })).toBeFocused();
    await expect(page.getByLabel('Titulek')).toHaveValue('Zahrada pro děti');
    await expect(page.locator('.image-preview')).toBeVisible();
    await expect(page.getByText('Zveřejněno s datem 20. 10. 2026.')).toBeVisible();
  });

  test('when they write a new article with a photo and publish it, then each step is confirmed and the requests carry what they typed', async ({
    page,
  }) => {
    const created: unknown[] = [];
    const published: unknown[] = [];
    await page.route(
      (url) => url.pathname === MEDIA,
      (route) =>
        route.fulfill({
          status: 201,
          json: { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}`, width: 1600, height: 1000 },
        }),
    );
    await page.route(
      (url) => url.pathname === NEWS,
      (route) => {
        created.push(route.request().postDataJSON());
        return route.fulfill({ status: 201, json: draft({ coverImage: article().coverImage }) });
      },
    );
    await page.route(
      (url) => url.pathname === `${NEWS}/${DRAFT_ID}/publish`,
      (route) => {
        published.push(route.request().postDataJSON());
        return route.fulfill({
          json: draft({ coverImage: article().coverImage, publishedOn: '2026-10-23' }),
        });
      },
    );

    await page.goto('/sprava/aktuality/nova');
    await expect(page.getByRole('heading', { level: 1, name: 'Nová aktualita' })).toBeFocused();

    await page.getByLabel('Titulek').fill('Benefiční koncert');
    await expect(page.getByLabel('Adresa na webu')).toHaveValue('beneficni-koncert');
    await expect(
      page.getByText('Aktualita bude na nfnn.cz/aktuality/beneficni-koncert.'),
    ).toBeVisible();
    await page.getByLabel('Perex').fill('Zveme vás na koncert.');
    await page.getByLabel('Text', { exact: true }).fill('Text o koncertu.');
    await page.getByLabel('Fotka').setInputFiles({
      name: 'koncert.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect(page.locator('.image-preview')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Odebrat fotku' })).toBeVisible();

    await page.getByRole('button', { name: 'Uložit koncept' }).click();

    await expect(page.locator('.admin-notice--status')).toHaveText(
      'Aktualitu jsme uložili jako koncept. Na web ji dostanete tlačítkem Zveřejnit.',
    );
    await expect(page).toHaveURL(`/sprava/aktuality/${DRAFT_ID}`);
    expect(created).toEqual([
      {
        title: 'Benefiční koncert',
        slug: 'beneficni-koncert',
        tag: null,
        perex: 'Zveme vás na koncert.',
        body: 'Text o koncertu.',
        coverImageId: IMAGE_ID,
      },
    ]);

    await page.getByLabel('Datum zveřejnění').fill('2026-10-23');
    await page.getByRole('button', { name: 'Zveřejnit' }).click();

    await expect(page.locator('.admin-notice--status')).toHaveText(
      'Aktualita je na webu s datem 23. 10. 2026.',
    );
    await expect(page.getByRole('button', { name: 'Stáhnout z webu' })).toBeVisible();
    expect(published).toEqual([{ publishedOn: '2026-10-23' }]);
  });

  test('when the title is missing, then the field says so, gets focus and nothing is sent', async ({
    page,
  }) => {
    let sent = 0;
    await page.route(
      (url) => url.pathname === NEWS,
      (route) => {
        sent++;
        return route.fulfill({ status: 500 });
      },
    );

    await page.goto('/sprava/aktuality/nova');
    await page.getByLabel('Perex').fill('Perex.');
    await page.getByLabel('Text', { exact: true }).fill('Text.');
    await page.getByRole('button', { name: 'Uložit koncept' }).click();

    await expect(page.getByLabel('Titulek')).toBeFocused();
    await expect(page.getByLabel('Titulek')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Vyplňte prosím titulek.')).toBeVisible();
    expect(sent).toBe(0);
  });

  test('when the address is taken, then the form carries the backend words', async ({ page }) => {
    await page.route(
      (url) => url.pathname === NEWS,
      (route) =>
        route.fulfill(
          problem(
            409,
            'content/slug-taken',
            'Adresa je obsazená',
            'Jinou aktualitu už najdete na této adrese. Zvolte jinou.',
          ),
        ),
    );

    await page.goto('/sprava/aktuality/nova');
    await page.getByLabel('Titulek').fill('Zahrada pro děti');
    await page.getByLabel('Perex').fill('Perex.');
    await page.getByLabel('Text', { exact: true }).fill('Text.');
    await page.getByRole('button', { name: 'Uložit koncept' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'Adresa je obsazená. Jinou aktualitu už najdete na této adrese. Zvolte jinou.',
    );
  });

  test('when they take a published article off the site and then delete it, then the page confirms each step and returns to the list', async ({
    page,
  }) => {
    let view = article();
    let deleted = 0;
    await page.route(
      (url) => url.pathname === `${NEWS}/${ARTICLE_ID}`,
      (route) => {
        if (route.request().method() === 'DELETE') {
          deleted++;
          return route.fulfill({ status: 204 });
        }
        return route.fulfill({ json: view });
      },
    );
    await page.route(
      (url) => url.pathname === `${NEWS}/${ARTICLE_ID}/unpublish`,
      (route) => {
        view = article({ publishedOn: null });
        return route.fulfill({ json: view });
      },
    );
    await page.route(
      (url) => url.pathname === NEWS,
      (route) => route.fulfill({ json: { items: [] } }),
    );

    await page.goto(`/sprava/aktuality/${ARTICLE_ID}`);
    await page.getByRole('button', { name: 'Stáhnout z webu' }).click();

    await expect(page.locator('.admin-notice--status')).toHaveText(
      'Aktualitu jsme z webu stáhli. Zůstává tu jako koncept.',
    );
    await expect(page.getByRole('button', { name: 'Zveřejnit' })).toBeVisible();

    await page.getByRole('button', { name: 'Smazat aktualitu' }).click();
    const question = page.getByRole('group', { name: 'Smazat aktualitu?' });
    await expect(question).toContainText('Opravdu smazat aktualitu „Zahrada pro děti“?');
    await question.getByRole('button', { name: 'Ano, smazat' }).click();

    await expect(page).toHaveURL('/sprava/aktuality');
    await expect(
      page.getByText('Zatím tu žádná aktualita není. Napište první tlačítkem Nová aktualita.'),
    ).toBeVisible();
    expect(deleted).toBe(1);
  });
});
