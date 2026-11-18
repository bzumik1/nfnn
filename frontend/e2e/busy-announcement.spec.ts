import { Locator, Page } from '@playwright/test';
import {
  administrator,
  claudeConnection,
  mockDonorApi,
  openDonorSection,
  problem,
  signedInDevices,
  signIn,
} from './donor-session';
import { expect, test } from './fixtures';

const SIGNED_OUT =
  'Zařízení jsme odhlásili: iPhone · Safari. Pokud jste se na něm nepřihlásili vy, změňte si heslo.';

async function lengthenLoadingDelay(page: Page): Promise<void> {
  await page.evaluate(() => document.documentElement.style.setProperty('--delay-loading', '10s'));
}

async function listenTo(status: Locator): Promise<() => Promise<string[]>> {
  await status.evaluate((line) => {
    const heard: string[] = [];
    (window as unknown as { heard: string[] }).heard = heard;
    new MutationObserver(() => {
      const text = (line.textContent ?? '').trim();
      if (text !== '' && heard.at(-1) !== text) {
        heard.push(text);
      }
    }).observe(line, { subtree: true, childList: true, characterData: true });
  });
  return () => status.page().evaluate(() => (window as unknown as { heard: string[] }).heard);
}

async function signOutTheIPhone(page: Page, answers: Promise<void>): Promise<Locator> {
  await page.clock.install();
  await mockDonorApi(page);
  await page.route(
    (url) => url.pathname === '/api/donors/me/devices',
    (route) => route.fulfill({ json: { items: signedInDevices } }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/donors/me/devices/'),
    async (route) => {
      await answers;
      await route.fulfill({ status: 204 });
    },
  );
  await signIn(page);
  await openDonorSection(page, 'Údaje a zabezpečení');
  const devices = page.locator('.devices');
  await devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click();
  await expect(devices.getByRole('group', { name: 'Odhlásit iPhone · Safari?' })).toBeVisible();
  return devices;
}

test.describe('Given a donor signing out another device on Údaje a zabezpečení', () => {
  test('when the server takes longer than the loading delay, then the button is busy under its resting name, the card keeps its height and its status line says first Odhlašujeme… and then only the result', async ({
    page,
  }) => {
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const devices = await signOutTheIPhone(page, answered);
    const status = devices.locator('.devices-status');
    const heard = await listenTo(status);
    await lengthenLoadingDelay(page);
    const restingHeight = (await devices.boundingBox())?.height;
    const yes = devices.getByRole('button', { name: 'Odhlásit', exact: true });

    await yes.click();

    await expect(yes).toHaveAttribute('aria-busy', 'true');
    await expect(yes).toHaveAccessibleName('Odhlásit');
    await expect(status).toHaveText('');

    await page.clock.fastForward(10_000);

    await expect(status).toHaveText('Odhlašujeme…');
    await expect(yes.locator('.busy-label__face--shown')).toHaveText('Odhlašujeme…');
    await expect(yes).toHaveAccessibleName('Odhlásit');
    await expect(yes).not.toHaveAttribute('aria-live');
    expect((await devices.boundingBox())?.height).toBe(restingHeight);

    answer();

    await expect(status).toHaveText(SIGNED_OUT);
    expect(await heard()).toEqual(['Odhlašujeme…', SIGNED_OUT]);
  });

  test('when the server answers before the loading delay is over, then the status line says only the result', async ({
    page,
  }) => {
    const devices = await signOutTheIPhone(page, Promise.resolve());
    const status = devices.locator('.devices-status');
    const heard = await listenTo(status);
    await lengthenLoadingDelay(page);

    await devices.getByRole('button', { name: 'Odhlásit', exact: true }).click();

    await expect(status).toHaveText(SIGNED_OUT);
    expect(await heard()).toEqual([SIGNED_OUT]);
  });
});

test.describe('Given an administrator disconnecting Claude on Údaje a zabezpečení', () => {
  test('when the server refuses after the loading delay, then the button is no longer busy and its name is again its visible label', async ({
    page,
  }) => {
    await page.clock.install();
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donors/me/connections',
      (route) => route.fulfill({ json: { items: [claudeConnection] } }),
    );
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route(
      (url) => url.pathname.startsWith('/api/donors/me/connections/'),
      async (route) => {
        await answered;
        await route.fulfill(
          problem(500, 'server-error', 'Chyba serveru', 'Zkuste to prosím za chvíli.'),
        );
      },
    );
    await signIn(page, administrator);
    await openDonorSection(page, 'Údaje a zabezpečení');
    const disconnect = page.locator('.connection-disconnect');
    await expect(disconnect).toHaveAccessibleName('Odpojit');
    await lengthenLoadingDelay(page);

    await disconnect.click();
    await page.clock.fastForward(10_000);

    await expect(disconnect.locator('.busy-label__face--shown')).toHaveText('Odpojujeme…');
    await expect(disconnect).toHaveAccessibleName('Odpojit');
    await expect(disconnect).toHaveAttribute('aria-busy', 'true');

    answer();

    await expect(page.getByRole('alert')).toContainText('Chyba serveru');
    await expect(disconnect).not.toHaveAttribute('aria-busy');
    await expect(disconnect.locator('.busy-label__face--shown')).toHaveText('Odpojit');
    await expect(disconnect).toHaveAccessibleName('Odpojit');
  });
});
