import { expect, test } from './fixtures';
import { mockDonorApi, openDonorSection, signedInDevices, signIn } from './donor-session';

test.describe('Given a donor signed in on a Mac and an iPhone', () => {
  test('when they sign out the iPhone from the account, then the API is told and only this Mac stays', async ({
    page,
  }) => {
    await mockDonorApi(page);
    let listed = signedInDevices;
    await page.route(
      (url) => url.pathname === '/api/donors/me/devices',
      (route) => route.fulfill({ json: { items: listed } }),
    );
    const deleted: string[] = [];
    await page.route(
      (url) => url.pathname.startsWith('/api/donors/me/devices/'),
      async (route) => {
        deleted.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
        listed = signedInDevices.filter((device) => device.current);
        await route.fulfill({ status: 204 });
      },
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const devices = page.locator('.devices');
    await expect(devices.getByRole('heading', { name: 'Přihlášená zařízení' })).toBeVisible();
    await expect(devices.locator('.device-name')).toHaveText(['Mac · Safari', 'iPhone · Safari']);
    await expect(devices.locator('.device-current')).toHaveText('Toto zařízení');

    await devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click();

    await expect(devices.locator('.device-name')).toHaveText(['Mac · Safari']);
    await expect(devices.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Zařízení jsme odhlásili: iPhone · Safari. Pokud jste se na něm nepřihlásili vy, změňte si heslo.',
    );
    expect(deleted).toEqual([`DELETE /api/donors/me/devices/${signedInDevices[1].id}`]);
  });

  test('when they sign out every other device, then the API is told and the card says so', async ({
    page,
  }) => {
    await mockDonorApi(page);
    const deleted: string[] = [];
    await page.route(
      (url) => url.pathname === '/api/donors/me/devices',
      async (route) => {
        if (route.request().method() === 'DELETE') {
          deleted.push('DELETE /api/donors/me/devices');
          await route.fulfill({ status: 204 });
          return;
        }
        await route.fulfill({ json: { items: signedInDevices } });
      },
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const devices = page.locator('.devices');
    await devices.getByRole('button', { name: 'Odhlásit všechna ostatní zařízení' }).click();

    await expect(devices.locator('.device')).toHaveCount(1);
    await expect(devices.getByText('Ostatní zařízení jsou odhlášená.')).toBeVisible();
    expect(deleted).toEqual(['DELETE /api/donors/me/devices']);
  });
});
