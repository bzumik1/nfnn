import { Page } from '@playwright/test';

import { administrator, donor, mockDonorApi, session, signIn } from './donor-session';
import { expect, test } from './fixtures';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

async function browserOffersInstall(page: Page, outcome: 'accepted' | 'dismissed'): Promise<void> {
  await page.evaluate((chosen) => {
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(offer, {
      prompt: () => {
        document.documentElement.dataset['installPrompted'] = 'yes';
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: chosen, platform: 'web' }),
    });
    window.dispatchEvent(offer);
  }, outcome);
}

async function prompted(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.dataset['installPrompted'] === 'yes');
}

const card = (page: Page) => page.getByRole('region', { name: 'Nová naděje jako aplikace' });

test.describe('Given a signed-in donor on their overview', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await signIn(page);
  });

  test('when the browser cannot install the site, then no offer is shown', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect(card(page)).toHaveCount(0);
  });

  test('when the browser offers to install the site, then the card appears without taking the focus and installs it with one press', async ({
    page,
  }) => {
    await browserOffersInstall(page, 'accepted');

    await expect(card(page)).toBeVisible();
    expect(await card(page).evaluate((region) => region.contains(document.activeElement))).toBe(
      false,
    );
    await card(page).getByRole('button', { name: 'Nainstalovat aplikaci' }).click();

    expect(await prompted(page)).toBe(true);
    const closing = page.locator('p', {
      hasText: 'Aplikace se instaluje. Najdete ji mezi ostatními aplikacemi v zařízení.',
    });
    await expect(closing).toBeVisible();
    await expect(closing).toBeFocused();
  });

  test('when they choose "Teď ne", then the card says it hides the offer and it stays hidden after the page is opened again', async ({
    page,
  }) => {
    await browserOffersInstall(page, 'accepted');
    await card(page).getByRole('button', { name: 'Teď ne' }).click();

    await expect(
      page.locator('p', { hasText: 'Dobře, nabídku na tři měsíce skryjeme.' }),
    ).toBeFocused();
    expect(await prompted(page)).toBe(false);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await browserOffersInstall(page, 'accepted');

    await expect(card(page)).toHaveCount(0);
  });
});

test.describe('Given a signed-in donor in Safari on an iPhone', () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test('when they open their overview, then the card says how to add the site to the home screen and that the app asks to sign in again', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await signIn(page);

    await expect(card(page)).toContainText(
      'Klepněte na Sdílet (v Safari ho najdete i pod tlačítkem ⋯) a pak na Přidat na plochu. V aplikaci se přihlásíte ještě jednou.',
    );
    await expect(card(page).getByRole('button', { name: 'Nainstalovat aplikaci' })).toHaveCount(0);
  });
});

test.describe('Given the app starting before its code has run', () => {
  test('when the page first paints, then it shows only the theme icon in the middle of the surface, as the launch image does', async ({
    page,
  }) => {
    await page.route('**/main-*.js', () => undefined);
    await page.goto('/aplikace', { waitUntil: 'commit' });

    const icon = page.locator('.launch-screen__icon');
    await expect(icon).toBeVisible();
    const box = await icon.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    expect(box!.width).toBe(128);
    expect(box!.height).toBe(128);
    expect(box!.x + box!.width / 2).toBeCloseTo(viewport!.width / 2, 0);
    expect(box!.y + box!.height / 2).toBeCloseTo(viewport!.height / 2, 0);
    await expect(page.locator('.launch-screen')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
  });
});

test.describe('Given the installed app opening its start address /aplikace', () => {
  test('when nobody is signed in, then it opens the home page without a dialog or a focused field, and Přihlásit se there offers the sign-in', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.goto('/aplikace');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.activeElement?.matches('input, textarea') ?? false),
    ).toBe(false);
    await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  for (const [who, user, address] of [
    ['a donor', donor, /\/darce\/prehled$/],
    ['an administrator', administrator, /\/sprava$/],
  ] as const) {
    test(`when ${who} is still signed in, then it opens their own start page`, async ({ page }) => {
      await mockDonorApi(page);
      await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200, user)));
      await page.addInitScript(() => localStorage.setItem('nfnn.donor-session', '1'));

      await page.goto('/aplikace');

      await expect(page).toHaveURL(address);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }
});
