import {
  donor,
  mockDonorApi,
  noDonations,
  openDonorSection,
  session,
  signIn,
} from './donor-session';
import { expect, test } from './fixtures';
import { DEVICE_DATABASE, leaked, rawDevice } from './raw-device';

const CANARY_STREET = 'Kanárkova 1234';

test.describe('Given a donor who edits the data on the receipt on a device that keeps an encrypted copy', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, noDonations);
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await page.route('**/api/donors/auth/logout', (route) => route.fulfill({ status: 204 }));
    await page.route('**/api/donors/me', async (route) => {
      if (route.request().method() !== 'PATCH') {
        return route.fallback();
      }
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...donor, ...body }),
      });
    });
    page.on('dialog', (dialog) => void dialog.accept());
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Upravit údaje' }).click();
    await page.getByLabel('Ulice a číslo').fill(CANARY_STREET);
    await expect.poll(async () => (await rawDevice(page)).drafts).toBe(1);
  });

  test('when the page is loaded again in the middle of the edit, then the edit is offered back from the device and saved once she continues, and the raw database never holds its text', async ({
    page,
  }) => {
    const raw = await rawDevice(page);
    for (const canary of [CANARY_STREET, 'profile']) {
      expect(leaked(raw.text, canary), canary).toBe(false);
    }

    await page.reload();

    const offer = page.locator('app-draft-offer');
    await expect(offer).toContainText('Máte tu rozepsaný text');
    await expect(page.locator('.profile-data')).toContainText('Dlouhá 12');
    await offer.getByRole('button', { name: 'Pokračovat v rozepsaném' }).click();
    await expect(page.getByLabel('Ulice a číslo')).toHaveValue(CANARY_STREET);
    const saved = page.waitForRequest(
      (request) => request.method() === 'PATCH' && request.url().endsWith('/api/donors/me'),
    );
    await page.getByRole('button', { name: 'Uložit údaje' }).click();
    expect((await saved).postDataJSON().address.street).toBe(CANARY_STREET);
    await expect(page.locator('.profile-data')).toContainText(CANARY_STREET);
    await expect.poll(async () => (await rawDevice(page)).drafts).toBe(0);
  });

  test('when she deletes the data on this device, then the edit leaves the device with the copy', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Smazat data z tohoto zařízení' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Smazat data a odhlásit' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect.poll(async () => (await rawDevice(page)).databases).not.toContain(DEVICE_DATABASE);
    expect((await rawDevice(page)).drafts).toBe(0);
  });
});
