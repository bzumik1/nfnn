import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, problem, session } from './donor-session';

const PROJECTS = '/api/admin/content/projects';
const MEDIA = '/api/admin/content/media';
const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a001';
const PROJECT_ID = '0199f3e0-0000-7000-8000-00000000c001';
const DRAFT_ID = '0199f3e0-0000-7000-8000-00000000c002';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQTX4NRwzEcQBO0hcxU+9NfQAAAABJRU5ErkJggg==',
  'base64',
);

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    slug: 'zahrada-pro-deti',
    title: 'Zahrada pro děti',
    year: 2024,
    category: 'CHILDREN',
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
  return project({
    id: DRAFT_ID,
    slug: 'beneficni-koncert',
    title: 'Benefiční koncert',
    year: 2026,
    category: 'OTHER',
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

test.describe('Given an administrator managing the projects', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when they open the list, then drafts and published projects show their state and lead to the editor', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === PROJECTS,
      (route) => route.fulfill({ json: { items: [draft(), project()] } }),
    );
    await page.route(
      (url) => url.pathname === `${PROJECTS}/${PROJECT_ID}`,
      (route) => route.fulfill({ json: project() }),
    );

    await page.goto('/sprava/projekty');

    await expect(page).toHaveTitle('Projekty | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Projekty' })).toBeFocused();
    await expect(page.locator('tbody tr').nth(0).locator('td')).toHaveText([
      'Benefiční koncert',
      '2026',
      'Ostatní',
      'bez štítku',
      'Koncept',
      '22. 10. 2026 11:00',
    ]);
    await expect(page.locator('tbody tr').nth(1).locator('td')).toHaveText([
      'Zahrada pro děti',
      '2024',
      'Děti',
      'Projekt',
      'Na webu od 20. 10. 2026',
      '20. 10. 2026 09:30',
    ]);

    await page.getByRole('link', { name: 'Zahrada pro děti' }).click();

    await expect(page).toHaveURL(`/sprava/projekty/${PROJECT_ID}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Úprava projektu' })).toBeFocused();
    await expect(page.getByLabel('Titulek')).toHaveValue('Zahrada pro děti');
    await expect(page.getByLabel('Rok')).toHaveValue('2024');
    await expect(page.locator('.image-preview')).toBeVisible();
    await expect(page.locator('.publish-state .ui-badge')).toHaveText('Na webu');
    await expect(
      page.getByRole('link', { name: 'Otevřít na webu (v novém okně)' }),
    ).toHaveAttribute('href', '/projekty/zahrada-pro-deti');
  });

  test('when they write a new project with a photo and publish it, then each step is confirmed and the requests carry what they typed', async ({
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
      (url) => url.pathname === PROJECTS,
      (route) => {
        created.push(route.request().postDataJSON());
        return route.fulfill({ status: 201, json: draft({ coverImage: project().coverImage }) });
      },
    );
    const updated: unknown[] = [];
    await page.route(
      (url) => url.pathname === `${PROJECTS}/${DRAFT_ID}`,
      (route) => {
        updated.push(route.request().postDataJSON());
        return route.fulfill({ json: draft({ coverImage: project().coverImage }) });
      },
    );
    await page.route(
      (url) => url.pathname === `${PROJECTS}/${DRAFT_ID}/publish`,
      (route) => {
        published.push(route.request().postDataJSON());
        return route.fulfill({
          json: draft({ coverImage: project().coverImage, publishedOn: '2026-10-23', live: true }),
        });
      },
    );

    await page.goto('/sprava/projekty/nova');
    await expect(page.getByRole('heading', { level: 1, name: 'Nový projekt' })).toBeFocused();

    await page.getByLabel('Titulek').fill('Benefiční koncert');
    await expect(page.getByLabel('Adresa na webu')).toHaveValue('beneficni-koncert');
    await expect(
      page.getByText('Projekt bude na nfnn.cz/projekty/beneficni-koncert.'),
    ).toBeVisible();
    await page.getByLabel('Rok').fill('2026');
    await page.getByLabel('Kategorie').selectOption({ label: 'Dospělí' });
    await page.getByLabel('Krátký souhrn').fill('Zveme vás na koncert.');
    await page.getByLabel('Text', { exact: true }).fill('Text o koncertu.');
    await page.getByLabel('Nahrát fotku').setInputFiles({
      name: 'koncert.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect(page.locator('.image-preview')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Odebrat fotku' })).toBeVisible();
    await page.getByRole('button', { name: 'Náhled', exact: true }).click();
    const preview = page.locator('app-content-preview');
    await expect(preview.locator('.card .card-title')).toHaveText('Benefiční koncert');
    await expect(preview.locator('.card .card-year')).toHaveText('2026');
    await expect(preview.locator('h3.ui-intro__title')).toBeVisible();

    await page.getByRole('button', { name: 'Uložit koncept' }).click();

    await expect(page.locator('.ui-action-bar [role="status"]')).toHaveText(
      'Projekt jsme uložili jako koncept. Na web ho dostanete tlačítkem Uložit a zveřejnit.',
    );
    await expect(page).toHaveURL(`/sprava/projekty/${DRAFT_ID}`);
    expect(created).toEqual([
      {
        title: 'Benefiční koncert',
        year: 2026,
        category: 'ADULTS',
        slug: 'beneficni-koncert',
        tag: null,
        perex: 'Zveme vás na koncert.',
        body: 'Text o koncertu.',
        coverImageId: IMAGE_ID,
        coverImageAlt: null,
      },
    ]);

    await page.getByRole('button', { name: 'Upravit', exact: true }).click();
    await page.getByLabel('Datum zveřejnění').fill('2026-10-23');
    await page.getByRole('button', { name: 'Uložit a zveřejnit' }).click();

    await expect(page.locator('.ui-action-bar .ui-notice--status')).toHaveText(
      'Projekt je na webu s datem 23. 10. 2026.',
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
      (url) => url.pathname === PROJECTS,
      (route) => {
        sent++;
        return route.fulfill({ status: 500 });
      },
    );

    await page.goto('/sprava/projekty/nova');
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
      (url) => url.pathname === PROJECTS,
      (route) =>
        route.fulfill(
          problem(
            409,
            'content/slug-taken',
            'Adresa je obsazená',
            'Jiná aktualita nebo projekt už tuto adresu používá; zvolte jinou.',
          ),
        ),
    );

    await page.goto('/sprava/projekty/nova');
    await page.getByLabel('Titulek').fill('Zahrada pro děti');
    await page.getByLabel('Krátký souhrn').fill('Perex.');
    await page.getByLabel('Text', { exact: true }).fill('Text.');
    await page.getByRole('button', { name: 'Uložit koncept' }).click();

    const address = page.getByLabel('Adresa na webu');
    await expect(address).toBeFocused();
    await expect(address).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByText('Tuto adresu už má jiný projekt nebo aktualita. Zvolte prosím jinou.'),
    ).toBeVisible();
  });

  test('when they take a published project off the site and then delete it, then the page confirms each step and returns to the list', async ({
    page,
  }) => {
    let view = project();
    let deleted = 0;
    await page.route(
      (url) => url.pathname === `${PROJECTS}/${PROJECT_ID}`,
      (route) => {
        if (route.request().method() === 'DELETE') {
          deleted++;
          return route.fulfill({ status: 204 });
        }
        return route.fulfill({ json: view });
      },
    );
    await page.route(
      (url) => url.pathname === `${PROJECTS}/${PROJECT_ID}/unpublish`,
      (route) => {
        view = project({ publishedOn: null });
        return route.fulfill({ json: view });
      },
    );
    await page.route(
      (url) => url.pathname === PROJECTS,
      (route) => route.fulfill({ json: { items: [] } }),
    );

    await page.goto(`/sprava/projekty/${PROJECT_ID}`);
    await page.getByRole('button', { name: 'Stáhnout z webu' }).click();

    await expect(page.locator('.ui-action-bar .ui-notice--status')).toHaveText(
      'Projekt jsme z webu stáhli. Zůstává tu jako koncept.',
    );
    await expect(page.getByRole('button', { name: 'Uložit a zveřejnit' })).toBeVisible();

    await page.getByRole('button', { name: 'Smazat projekt' }).click();
    const question = page.getByRole('group', { name: 'Smazat projekt?' });
    await expect(question).toContainText('Opravdu smazat projekt „Zahrada pro děti“?');
    await question.getByRole('button', { name: 'Smazat natrvalo' }).click();

    await expect(page).toHaveURL('/sprava/projekty');
    await expect(
      page.getByText('Zatím tu žádný projekt není. Napište první tlačítkem Nový projekt.'),
    ).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Projekt „Zahrada pro děti“ jsme smazali.',
    );
    expect(deleted).toBe(1);
  });
});
