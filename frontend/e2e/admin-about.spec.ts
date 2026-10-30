import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, samplePngBase64, session } from './donor-session';

const ABOUT = '/api/admin/content/about';
const MEDIA = '/api/admin/content/media';
const PHOTO_ID = '0199f3e0-0000-7000-8000-00000000b001';
const PNG = Buffer.from(samplePngBase64, 'base64');

function aboutPhoto(overrides: Record<string, unknown> = {}) {
  return {
    id: PHOTO_ID,
    url: `/api/content/media/${PHOTO_ID}`,
    width: 1413,
    height: 1884,
    alt: 'Malý chlapec v náručí dvou dospělých',
    caption: 'Kde to všechno začalo',
    ...overrides,
  };
}

async function servePhotos(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: PNG }),
  );
}

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator who shows a photo in the About section', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await servePhotos(page);
    await rememberedSession(page);
  });

  test('when they upload a photo, describe it and save it, then it is sent with its texts and can be removed after a confirmation', async ({
    page,
  }) => {
    const saved: unknown[] = [];
    let current: Record<string, unknown> | null = null;
    await page.route(
      (url) => url.pathname === ABOUT,
      (route) => {
        if (route.request().method() === 'PUT') {
          const body = route.request().postDataJSON() as {
            photoId: string | null;
            photoAlt: string | null;
            caption: string | null;
          };
          saved.push(body);
          current =
            body.photoId === null
              ? null
              : aboutPhoto({ id: body.photoId, alt: body.photoAlt, caption: body.caption });
        }
        return route.fulfill({ json: { photo: current } });
      },
    );
    await page.route(
      (url) => url.pathname === MEDIA,
      (route) =>
        route.fulfill({
          status: 201,
          json: { id: PHOTO_ID, url: `/api/content/media/${PHOTO_ID}`, width: 1413, height: 1884 },
        }),
    );

    await page.goto('/sprava/o-nas');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Fotka v sekci O nás' }),
    ).toBeFocused();
    await expect(
      page.getByText('Fotka zatím není nahraná, web ukazuje ilustrační fotku.'),
    ).toBeVisible();

    await page.getByLabel('Nahrát fotku').setInputFiles({
      name: 'zakladatele.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page.locator('.photo-preview')).toBeVisible();
    await expect(
      page.getByText('Fotka je nahraná. Na web se dostane, až ji uložíte.'),
    ).toBeVisible();
    await page
      .getByLabel('Popis pro čtečky (nepovinné)')
      .fill('Malý chlapec v náručí dvou dospělých');
    await page.getByLabel('Popisek pod fotkou (nepovinné)').fill('Kde to všechno začalo');
    await page.getByRole('button', { name: 'Uložit a ukázat na webu' }).click();

    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Uloženo. Fotka je na webu v sekci O nás.',
    );
    expect(saved).toEqual([
      {
        photoId: PHOTO_ID,
        photoAlt: 'Malý chlapec v náručí dvou dospělých',
        caption: 'Kde to všechno začalo',
      },
    ]);

    await page.getByRole('button', { name: 'Odebrat fotku z webu' }).click();
    const confirmation = page.getByRole('group', { name: 'Odebrat fotku?' });
    await expect(confirmation).toContainText('Opravdu fotku odebrat z webu a smazat?');
    await confirmation.getByRole('button', { name: 'Odebrat a smazat' }).click();

    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Fotku jsme z webu odebrali a smazali. Sekce O nás ukazuje zase ilustrační fotku.',
    );
    await expect(page.getByLabel('Nahrát fotku')).toBeFocused();
    expect(saved.at(-1)).toEqual({ photoId: null, photoAlt: null, caption: null });
  });
});

test.describe('Given a visitor and an About section with a photo', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await servePhotos(page);
  });

  test('when they open the home page, then the section shows the whole photo with its description and caption instead of the placeholder', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/content/home',
      (route) =>
        route.fulfill({ json: { news: [], projects: [], about: { photo: aboutPhoto() } } }),
    );

    await page.goto('/');
    const figure = page.locator('#o-nas figure');
    await figure.scrollIntoViewIfNeeded();

    const photo = figure.getByRole('img', { name: 'Malý chlapec v náručí dvou dospělých' });
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute('src', `/api/content/media/${PHOTO_ID}?w=480`);
    await expect(figure.locator('figcaption')).toHaveText('Kde to všechno začalo');
    await expect(page.locator('#o-nas .about-img-wrap')).toHaveCount(0);
  });
});
