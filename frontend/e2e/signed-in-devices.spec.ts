import { Locator } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  longUnusedDevices,
  mockDonorApi,
  openDonorSection,
  signedInDevices,
  signIn,
} from './donor-session';

async function groundAndTextContrast(
  button: Locator,
): Promise<{ ground: string; surface: string; textContrast: number }> {
  return button.evaluate((element) => {
    const luminance = (written: string) => {
      const [r, g, b] = (written.match(/[\d.]+/g) ?? [])
        .slice(0, 3)
        .map((channel) => Number(channel) / 255)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--color-surface)';
    element.parentElement?.append(probe);
    const surface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const style = getComputedStyle(element);
    const front = luminance(style.color);
    const behind = luminance(style.backgroundColor);
    return {
      ground: style.backgroundColor,
      surface,
      textContrast: (Math.max(front, behind) + 0.05) / (Math.min(front, behind) + 0.05),
    };
  });
}

test.describe('Given a donor signed in on a Mac and an iPhone', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`when they ask to sign out the iPhone in the ${colorScheme} appearance, then Zrušit stands on the surface ground, outlined, with readable text`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donors/me/devices',
        (route) => route.fulfill({ json: { items: signedInDevices } }),
      );
      await signIn(page);
      await openDonorSection(page, 'Údaje a zabezpečení');

      const devices = page.locator('.devices');
      await devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click();
      const cancel = devices
        .getByRole('group', { name: 'Odhlásit iPhone · Safari?' })
        .getByRole('button', { name: 'Zrušit' });

      await expect(cancel).toHaveClass(/\bui-button--quiet\b/);
      await expect
        .poll(async () => {
          const { ground, surface } = await groundAndTextContrast(cancel);
          return ground === surface;
        })
        .toBe(true);
      const { textContrast } = await groundAndTextContrast(cancel);
      expect(textContrast).toBeGreaterThanOrEqual(4.5);
    });
  }

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
    const question = devices.getByRole('group', { name: 'Odhlásit iPhone · Safari?' });
    await expect(question.getByRole('button', { name: 'Zrušit' })).toBeFocused();
    expect(deleted).toEqual([]);
    await question.getByRole('button', { name: 'Odhlásit', exact: true }).click();

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
    await devices
      .getByRole('group', { name: 'Odhlásit všechna ostatní zařízení?' })
      .getByRole('button', { name: 'Odhlásit', exact: true })
      .click();

    await expect(devices.locator('.device')).toHaveCount(1);
    await expect(devices.getByText('Ostatní zařízení jsou odhlášená.')).toBeVisible();
    expect(deleted).toEqual(['DELETE /api/donors/me/devices']);
  });

  test('when two older sign-ins lie folded, then the donor opens them, sees the installed app named so and signs one out', async ({
    page,
  }) => {
    await mockDonorApi(page);
    let listed = [...signedInDevices, ...longUnusedDevices];
    const deleted: string[] = [];
    await page.route(
      (url) => url.pathname === '/api/donors/me/devices',
      (route) => route.fulfill({ json: { items: listed } }),
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/donors/me/devices/'),
      async (route) => {
        const path = new URL(route.request().url()).pathname;
        deleted.push(`${route.request().method()} ${path}`);
        listed = listed.filter((device) => !path.endsWith(device.id));
        await route.fulfill({ status: 204 });
      },
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const devices = page.locator('.devices');
    await expect(devices.locator('.device-name')).toHaveText(['Mac · Safari', 'iPhone · Safari']);
    const older = devices.getByRole('button', { name: /Starší \(2\)/ });
    await expect(older).toHaveAttribute('aria-expanded', 'false');

    await older.click();

    await expect(older).toHaveAttribute('aria-expanded', 'true');
    await expect(devices.locator('#devices-older .device-name')).toHaveText([
      'iPhone · aplikace',
      'Windows · Edge',
    ]);

    await devices.getByRole('button', { name: 'Odhlásit iPhone · aplikace' }).click();
    await devices
      .getByRole('group', { name: 'Odhlásit iPhone · aplikace?' })
      .getByRole('button', { name: 'Odhlásit', exact: true })
      .click();

    await expect(devices.locator('#devices-older .device-name')).toHaveText(['Windows · Edge']);
    await expect(devices.getByRole('button', { name: /Starší \(1\)/ })).toBeVisible();
    await expect(devices.locator('.devices-status')).toBeFocused();
    expect(deleted).toEqual([`DELETE /api/donors/me/devices/${longUnusedDevices[0].id}`]);
  });
});
