import { FOUNDATION_PAYMENT_DETAILS } from '../qr-matrices';
import { expect, pwaTest as test } from './pwa-fixtures';

const APP_API_OFFLINE =
  /^Failed to load resource: (?:the server responded with a status of 504 \(Gateway Timeout\)|net::ERR_INTERNET_DISCONNECTED) \(http:\/\/localhost:\d+\/api\//;
const APP_API_DOWN =
  /^Failed to load resource: the server responded with a status of 522 \((?:Unknown)?\) \(http:\/\/localhost:\d+\/api\//;
const KEPT_NOTE = /Údaje účtu z \d{1,2}\. \d{1,2}\. \d{4} · nemusí být aktuální/;
const PICTURE_NEVER_LOADED =
  /^(?:Error: Response not Ok \(fetchAndCacheOnce\): request for http:\/\/localhost:\d+\/images\/[\w-]+\.webp returned response 504 Gateway Timeout|Failed to load resource: net::ERR_FAILED) \(http:\/\/localhost:\d+\/(?:ngsw-worker\.js|images\/[\w-]+\.webp)\)$/;

const KEPT_DETAILS_AGE_MS = 10 * 60_000;
const SETTLED_OFFLINE = { timeout: 10_000 };

const OFFLINE_REQUESTS = new RegExp(`${APP_API_OFFLINE.source}|${PICTURE_NEVER_LOADED.source}`);

test.describe('Given a visitor who opened the site once with a connection', () => {
  test.beforeEach(async ({ page, context, swReady }) => {
    await context.route(
      (url) => url.pathname === '/api/donations/payment-details',
      (route) =>
        route.fulfill({
          json: FOUNDATION_PAYMENT_DETAILS,
          headers: {
            Date: new Date(Date.now() - KEPT_DETAILS_AGE_MS).toUTCString(),
            'Cache-Control': 'private, max-age=300',
          },
        }),
    );
    await page.goto('/prispet');
    await swReady();
    await expect(page.locator('#prispet .qr-code svg[role="img"]')).toBeVisible();
  });

  test.describe('when the connection is gone and the visitor opens the site again', () => {
    test.use({ allowedConsoleErrors: [OFFLINE_REQUESTS] });

    test('then the label says offline, the public page and Přispět render from what the browser kept, and sending a message waits for the connection', async ({
      page,
      goOffline,
    }) => {
      await goOffline();

      await page.reload();

      const label = page.getByRole('button', { name: /^Offline/ });
      await expect(label).toBeVisible(SETTLED_OFFLINE);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('#prispet .qr-code svg[role="img"]')).toBeVisible();
      await expect(page.locator('#prispet .bank [role="note"]')).toHaveText(KEPT_NOTE);

      await label.click();

      const sheet = page.getByRole('dialog', { name: 'Jste offline' });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText('Bez připojení můžete jen prohlížet.');
      await page.keyboard.press('Escape');

      await page.getByRole('link', { name: 'O nás' }).first().click();
      const send = page.locator('#kontakt').getByRole('button', { name: /^Odeslat zprávu/ });
      await expect(send).toHaveAttribute('aria-disabled', 'true');
      await expect(send).toHaveAccessibleDescription('Potřebuje připojení');
      await page.locator('#kontakt .contact-legal').scrollIntoViewIfNeeded();
      const unseen = page.locator('img.is-unavailable').first();
      await expect(unseen).toBeAttached();
      await expect(unseen).toHaveAttribute('alt');
    });
  });

  test.describe('when the server answers every API call with 522 and the visitor opens the site again', () => {
    test.use({ allowedConsoleErrors: [APP_API_DOWN] });

    test('then the label says offline, the sheet says the server does not answer, and Přispět draws the QR from the details the browser kept', async ({
      page,
      context,
    }) => {
      await context.route(
        (url) => url.pathname.startsWith('/api/'),
        (route) => route.fulfill({ status: 522, contentType: 'text/html', body: 'origin down' }),
      );

      await page.reload();

      const label = page.getByRole('button', { name: /^Offline/ });
      await expect(label).toBeVisible(SETTLED_OFFLINE);
      await expect(page.locator('#prispet .qr-code svg[role="img"]')).toBeVisible();
      await expect(page.locator('#prispet .bank [role="note"]')).toHaveText(KEPT_NOTE);

      await label.click();

      const sheet = page.getByRole('dialog', { name: 'Server neodpovídá' });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(
        'Připojení k internetu máte, ale server fondu teď neodpovídá. Zkoušíme to znovu sami.',
      );
    });
  });
});
