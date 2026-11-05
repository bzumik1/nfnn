import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, samplePngBase64, session } from './donor-session';

const BAND = '/api/admin/content/donate-band';
const MEDIA = '/api/admin/content/media';
const PHOTO_ID = '0199f3e0-0000-7000-8000-00000000b101';
const PNG = Buffer.from(samplePngBase64, 'base64');

function bandPhoto(overrides: Record<string, unknown> = {}) {
  return {
    id: PHOTO_ID,
    url: `/api/content/media/${PHOTO_ID}`,
    width: 1600,
    height: 1067,
    alt: 'Usměvavá dívka na zahradě',
    focalPoint: null,
    ...overrides,
  };
}

async function servePhotos(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: PNG }),
  );
}

test.describe('Given an administrator who shows a photo in the Přispět band', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await servePhotos(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
  });

  test('when they upload a photo, describe it and save it, then it is sent with its description and can be removed after a confirmation', async ({
    page,
  }) => {
    const saved: unknown[] = [];
    let current: Record<string, unknown> | null = null;
    await page.route(
      (url) => url.pathname === BAND,
      (route) => {
        if (route.request().method() === 'PUT') {
          const body = route.request().postDataJSON() as {
            photoId: string | null;
            photoAlt: string | null;
          };
          saved.push(body);
          current =
            body.photoId === null ? null : bandPhoto({ id: body.photoId, alt: body.photoAlt });
        }
        return route.fulfill({ json: { photo: current } });
      },
    );
    await page.route(
      (url) => url.pathname === MEDIA,
      (route) =>
        route.fulfill({
          status: 201,
          json: { id: PHOTO_ID, url: `/api/content/media/${PHOTO_ID}`, width: 1600, height: 1067 },
        }),
    );

    await page.goto('/sprava/pruh-prispet');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Fotka v pruhu Přispět' }),
    ).toBeFocused();

    await page.getByLabel('Nahrát fotku').setInputFiles({
      name: 'zahrada.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page.locator('figure.preview figcaption')).toHaveText([
      'Na počítači',
      'Na telefonu',
    ]);
    await page.getByLabel('Popis pro čtečky (nepovinné)').fill('Usměvavá dívka na zahradě');
    await page.getByRole('button', { name: 'Uložit a ukázat na webu' }).click();

    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Uloženo. Fotka je na webu v pruhu Přispět.',
    );
    expect(saved).toEqual([{ photoId: PHOTO_ID, photoAlt: 'Usměvavá dívka na zahradě' }]);

    await page.getByRole('button', { name: 'Odebrat fotku z webu' }).click();
    await page
      .getByRole('group', { name: 'Odebrat fotku?' })
      .getByRole('button', { name: 'Odebrat a smazat' })
      .click();

    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Fotku jsme z webu odebrali a smazali. Pruh Přispět ukazuje zase ilustrační fotku.',
    );
    expect(saved.at(-1)).toEqual({ photoId: null, photoAlt: null });
  });
});

test.describe('Given a visitor and a Přispět band with a photo', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await servePhotos(page);
  });

  test('when they reach the end of the About page, then the band shows that photo with its description and leads to Přispět', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/content/home',
      (route) =>
        route.fulfill({
          json: { news: [], projects: [], donateBand: { photo: bandPhoto() } },
        }),
    );

    await page.goto('/o-nas');
    const band = page.getByRole('region', { name: 'Pomozte nám napsat další příběh' });
    await band.scrollIntoViewIfNeeded();

    const photo = band.getByRole('img', { name: 'Usměvavá dívka na zahradě' });
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute('src', new RegExp(`/api/content/media/${PHOTO_ID}\\?w=`));
    await expect(band.getByRole('link', { name: 'Přispět' })).toHaveAttribute('href', '/prispet');
    await expect(band.getByRole('link', { name: 'Kde pomáháme' })).toHaveAttribute(
      'href',
      '/projekty',
    );
  });
});
