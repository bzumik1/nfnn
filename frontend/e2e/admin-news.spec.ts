import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
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
    coverImage: { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}`, alt: null },
    publishedOn: '2026-10-20',
    live: true,
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
    live: false,
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
      'Na webu od 20. 10. 2026',
      '20. 10. 2026 09:30',
    ]);

    await page.getByRole('link', { name: 'Zahrada pro děti' }).click();

    await expect(page).toHaveURL(`/sprava/aktuality/${ARTICLE_ID}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Úprava aktuality' })).toBeFocused();
    await expect(page.getByLabel('Titulek')).toHaveValue('Zahrada pro děti');
    await expect(page.locator('.image-preview')).toBeVisible();
    await expect(page.locator('.publish-state .ui-badge')).toHaveText('Na webu');
    await expect(
      page.getByRole('link', { name: 'Otevřít na webu (v novém okně)' }),
    ).toHaveAttribute('href', '/aktuality/zahrada-pro-deti');
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
    const updated: unknown[] = [];
    await page.route(
      (url) => url.pathname === `${NEWS}/${DRAFT_ID}`,
      (route) => {
        updated.push(route.request().postDataJSON());
        return route.fulfill({ json: draft({ coverImage: article().coverImage }) });
      },
    );
    await page.route(
      (url) => url.pathname === `${NEWS}/${DRAFT_ID}/publish`,
      (route) => {
        published.push(route.request().postDataJSON());
        return route.fulfill({
          json: draft({ coverImage: article().coverImage, publishedOn: '2026-10-23', live: true }),
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
    await page.getByLabel('Krátký souhrn').fill('Zveme vás na koncert.');
    const body = page.getByLabel('Text', { exact: true });
    await body.fill('Text o koncertu.');
    await body.evaluate((area: HTMLTextAreaElement) => area.setSelectionRange(0, 4));
    await page
      .getByRole('group', { name: 'Formátování textu' })
      .getByRole('button', { name: 'Tučně' })
      .click();
    await expect(body).toHaveValue('**Text** o koncertu.');
    await page.getByLabel('Nahrát fotku').setInputFiles({
      name: 'koncert.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect(page.locator('.image-preview')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Odebrat fotku' })).toBeVisible();
    await page.getByLabel('Popis fotky').fill('Lidé na koncertě');

    await page.getByRole('button', { name: 'Náhled', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Náhled', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('Titulek')).toBeHidden();
    const preview = page.locator('app-content-preview');
    await expect(preview.locator('.news-card .news-title')).toHaveText('Benefiční koncert');
    await expect(preview.locator('.news-card img')).toBeVisible();
    await expect(preview.locator('h3.ui-intro__title')).toBeVisible();
    await expect(preview.locator('.prose strong')).toHaveText('Text');
    await page.getByRole('button', { name: 'Upravit', exact: true }).click();
    await expect(page.getByLabel('Popis fotky')).toHaveValue('Lidé na koncertě');

    await page.getByRole('button', { name: 'Uložit koncept' }).click();

    await expect(page.locator('.ui-action-bar [role="status"]')).toHaveText(
      'Aktualitu jsme uložili jako koncept. Na web ji dostanete tlačítkem Uložit a zveřejnit.',
    );
    await expect(page).toHaveURL(`/sprava/aktuality/${DRAFT_ID}`);
    expect(created).toEqual([
      {
        title: 'Benefiční koncert',
        slug: 'beneficni-koncert',
        tag: null,
        perex: 'Zveme vás na koncert.',
        body: '**Text** o koncertu.',
        coverImageId: IMAGE_ID,
        coverImageAlt: 'Lidé na koncertě',
      },
    ]);

    await page.getByLabel('Datum zveřejnění').fill('2026-10-23');
    await page.getByRole('button', { name: 'Uložit a zveřejnit' }).click();

    await expect(page.locator('.ui-action-bar .ui-notice--status')).toHaveText(
      'Aktualita je na webu s datem 23. 10. 2026.',
    );
    await expect(page.getByRole('button', { name: 'Stáhnout z webu' })).toBeVisible();
    expect(updated).toHaveLength(1);
    expect(published).toEqual([{ publishedOn: '2026-10-23' }]);
    await expect(page.getByRole('link', { name: 'Otevřít na webu (v novém okně)' })).toBeVisible();
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
    await page.getByLabel('Krátký souhrn').fill('Perex.');
    await page.getByLabel('Text', { exact: true }).fill('Text.');
    await page.getByRole('button', { name: 'Uložit koncept' }).click();

    await expect(page.getByLabel('Titulek')).toBeFocused();
    await expect(page.getByLabel('Titulek')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Vyplňte prosím titulek.')).toBeVisible();
    expect(sent).toBe(0);
  });

  test('when the address is taken, then the address field says so and takes the focus', async ({
    page,
  }) => {
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
    await page.getByLabel('Krátký souhrn').fill('Perex.');
    await page.getByLabel('Text', { exact: true }).fill('Text.');
    await page.getByRole('button', { name: 'Uložit koncept' }).click();

    const address = page.getByLabel('Adresa na webu');
    await expect(address).toBeFocused();
    await expect(address).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByText('Tuto adresu už má jiná aktualita nebo projekt. Zvolte prosím jinou.'),
    ).toBeVisible();
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

    await expect(page.locator('.ui-action-bar .ui-notice--status')).toHaveText(
      'Aktualitu jsme z webu stáhli. Zůstává tu jako koncept.',
    );
    await expect(page.getByRole('button', { name: 'Uložit a zveřejnit' })).toBeVisible();

    await page.getByRole('button', { name: 'Smazat aktualitu' }).click();
    const question = page.getByRole('group', { name: 'Smazat aktualitu?' });
    await expect(question).toContainText('Opravdu smazat aktualitu „Zahrada pro děti“?');
    await question.getByRole('button', { name: 'Smazat natrvalo' }).click();

    await expect(page).toHaveURL('/sprava/aktuality');
    await expect(
      page.getByText('Zatím tu žádná aktualita není. Napište první tlačítkem Nová aktualita.'),
    ).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Aktualitu „Zahrada pro děti“ jsme smazali.',
    );
    expect(deleted).toBe(1);
  });

  test('when they leave an edited article by the side menu, then the page asks first and leaves only on request', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === `${NEWS}/${ARTICLE_ID}`,
      (route) => route.fulfill({ json: article() }),
    );
    await page.route(
      (url) => url.pathname === NEWS,
      (route) => route.fulfill({ json: { items: [article()] } }),
    );

    await page.goto(`/sprava/aktuality/${ARTICLE_ID}`);
    await page.getByLabel('Titulek').fill('Zahrada pro děti a rodiče');
    await page.getByRole('link', { name: '← Aktuality' }).click();

    const question = page.getByRole('dialog', { name: 'Máte neuložené změny' });
    await expect(question).toBeVisible();
    await expect(question.getByRole('button', { name: 'Zůstat a uložit' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(question).toBeHidden();
    await expect(page).toHaveURL(`/sprava/aktuality/${ARTICLE_ID}`);
    await expect(page.getByLabel('Titulek')).toHaveValue('Zahrada pro děti a rodiče');

    await page.getByRole('link', { name: '← Aktuality' }).click();
    await page.getByRole('button', { name: 'Odejít bez uložení' }).click();

    await expect(page).toHaveURL('/sprava/aktuality');
  });

  test('when they work on a phone, then the action bar stays in view while they scroll and never covers the field they move to', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === `${NEWS}/${ARTICLE_ID}`,
      (route) => route.fulfill({ json: article() }),
    );
    await page.setViewportSize({ width: 390, height: 700 });

    await page.goto(`/sprava/aktuality/${ARTICLE_ID}`);
    const bar = page.locator('.ui-action-bar');
    await expect(bar).toBeInViewport();
    await expect(bar.getByRole('button', { name: 'Uložit a ukázat na webu' })).toBeVisible();

    await page.getByLabel('Štítek').focus();
    await page.keyboard.press('Tab');
    const perex = page.getByLabel('Krátký souhrn');
    await expect(perex).toBeFocused();
    await expect
      .poll(async () => {
        const field = await perex.boundingBox();
        const barBox = await bar.boundingBox();
        return field !== null && barBox !== null && field.y + field.height <= barBox.y;
      })
      .toBe(true);

    await page.mouse.wheel(0, 900);
    await expect(bar).toBeInViewport();
  });

  test('when an article is published with a later date, then the list and the editor say when it goes live and offer no link to it', async ({
    page,
  }) => {
    const scheduled = article({ publishedOn: '2026-12-01', live: false });
    await page.route(
      (url) => url.pathname === NEWS,
      (route) => route.fulfill({ json: { items: [scheduled] } }),
    );
    await page.route(
      (url) => url.pathname === `${NEWS}/${ARTICLE_ID}`,
      (route) => route.fulfill({ json: scheduled }),
    );

    await page.goto('/sprava/aktuality');
    await expect(page.locator('tbody tr td').nth(2)).toHaveText('Zveřejní se 01. 12. 2026');

    await page.getByRole('link', { name: 'Zahrada pro děti' }).click();
    await expect(page.locator('.publish-state .ui-badge')).toHaveText('Zveřejní se 01. 12. 2026');
    await expect(page.getByRole('button', { name: 'Uložit změny' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Otevřít na webu/ })).toHaveCount(0);
  });
});
