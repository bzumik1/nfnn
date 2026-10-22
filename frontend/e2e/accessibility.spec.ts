import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { bankAccountItem, mockDonorApi, openSignInDialog, signIn } from './donor-session';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function askAboutAnOlderSymbol(page: Page): Promise<void> {
  let confirmed = false;
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-accounts',
    (route) =>
      route.fulfill({
        json: {
          items: [
            bankAccountItem({
              accountNumber: '19-2000145399/0800',
              verificationPaymentOn: '2026-10-16',
              symbolOffer: confirmed
                ? null
                : { variableSymbol: '6123456789', paymentCount: 14, firstMonth: '2025-01', lastMonth: '2026-10' },
              confirmedSymbols: confirmed ? ['6123456789'] : [],
            }),
          ],
        },
      }),
  );
  await page.route(
    (url) => url.pathname.endsWith('/symbol-claim/confirm'),
    (route) => {
      confirmed = true;
      return route.fulfill({ json: { pairedCount: 14, changedYearlyReceipts: [] } });
    },
  );
}

async function violations(page: Page): Promise<string[]> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity),
  );
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
}

test.describe('Given a visitor who relies on WCAG 2.2 AA', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they open the home page, then nothing on it breaks the rules', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.qr-code img')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they open the privacy policy, then nothing on it breaks the rules', async ({ page }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');

    expect(await violations(page)).toEqual([]);
  });

  test('when they open an address the site does not know, then the page says so and breaks no rule', async ({ page }) => {
    await page.goto('/stara-stranka');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tuhle stránku jsme nenašli');
    await expect(page).toHaveURL(/\/stara-stranka$/);
    expect(await violations(page)).toEqual([]);
  });

  test('when they open a password reset link, then nothing on the page breaks the rules', async ({ page }) => {
    await page.goto('/obnova-hesla#token=abc');
    await expect(page.locator('h1')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they open the sign-in dialog and its company registration, then nothing in it breaks the rules', async ({ page }) => {
    await openSignInDialog(page);
    expect(await violations(page)).toEqual([]);

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Registrace' }).click();
    await dialog.getByRole('radio', { name: 'Firma' }).click();

    expect(await violations(page)).toEqual([]);
  });

  test('when they send the contact form empty, then its error messages break no rule either', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Odeslat zprávu' }).click();
    await expect(page.locator('#contact-name')).toHaveAttribute('aria-invalid', 'true');

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor opens the overview, then nothing on it breaks the rules', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('.symbol-value')).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Jak přiřazujeme platby' }).click();
    await expect(page.getByRole('region', { name: 'Jak přiřazujeme platby' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor has a shared account, then its warning and the switch-off confirmation break no rule either', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-accounts',
      (route) =>
        route.fulfill({
          json: {
            items: [
              bankAccountItem({ shared: true }),
              bankAccountItem({
                id: '0192f0c4-0000-7000-8000-000000000002',
                accountNumber: '19-2000145399/0800',
                status: 'DISCONNECTED',
                verifiedOn: '2026-03-12',
                disconnectedOn: '2026-09-30',
                donationCount: 2,
                totalAmountMinor: 80000,
                lastDonationOn: '2026-09-12',
              }),
            ],
          },
        }),
    );
    await signIn(page);
    await expect(page.locator('.account-hint--warning')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Vypnout párování' }).click();
    await expect(page.getByRole('button', { name: 'Nechat zapnuté' })).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor is asked about an older symbol and answers it, then neither the question nor the answer breaks a rule', async ({ page }) => {
    await askAboutAnOlderSymbol(page);
    await signIn(page);
    const question = page.getByRole('group', { name: /Z tohoto účtu k nám chodí i platby s variabilním symbolem 6123456789/ });
    await expect(question).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await question.getByRole('button', { name: 'Ano, jsou moje' }).click();
    await expect(page.locator('.accounts-status')).toHaveText('Přiřadili jsme vám 14 plateb s VS 6123456789 z účtu 19-2000145399/0800.');
    await expect(question).toHaveCount(0);

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor edits their data, then the form breaks no rule either', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Upravit údaje' }).click();
    await page.getByLabel('Město').fill('');
    await page.getByRole('button', { name: 'Uložit' }).click();
    await expect(page.getByLabel('Město')).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when they press Tab first, then the skip link appears and takes them to the content', async ({ page }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');
    await expect(page.locator('h1')).toBeVisible();
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Přeskočit na obsah' });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(page.locator('main')).toBeFocused();
    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju$/);
  });

  test('when they open the sign-in dialog from the keyboard, then the focus stays in it and comes back after Esc', async ({ page }) => {
    await page.goto('/');
    const signInButton = page.locator('.nav-login');
    await signInButton.focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#login-email')).toBeFocused();
    for (let step = 0; step < 15; step++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest('dialog'))).toBe(true);
    }

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(signInButton).toBeFocused();
  });
});

test.describe('Given a visitor on a phone who relies on WCAG 2.2 AA', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they open the menu, then its button says so, nothing breaks the rules and Esc closes it', async ({ page }) => {
    await page.goto('/');
    const menuButton = page.getByRole('button', { name: 'Otevřít menu' });
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await menuButton.click();

    const closeButton = page.getByRole('button', { name: 'Zavřít menu' });
    await expect(closeButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#mobile-menu')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.locator('#mobile-menu a').first().focus();
    await page.keyboard.press('Escape');

    await expect(page.locator('#mobile-menu')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Otevřít menu' })).toBeFocused();
  });

  test('when a signed-in donor opens how payments are paired on a 360 px phone, then it fits the screen, breaks no rule and Esc closes it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);
    await page.setViewportSize({ width: 360, height: 800 });
    const helpButton = page.getByRole('button', { name: 'Jak přiřazujeme platby' });
    await expect(helpButton).toHaveAttribute('aria-expanded', 'false');
    const size = await helpButton.boundingBox();
    expect(size?.width).toBeGreaterThanOrEqual(24);
    expect(size?.height).toBeGreaterThanOrEqual(24);

    await helpButton.click();

    await expect(helpButton).toHaveAttribute('aria-expanded', 'true');
    const panel = page.getByRole('region', { name: 'Jak přiřazujeme platby' });
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    expect(await violations(page)).toEqual([]);

    await panel.getByRole('link', { name: 'info@nfnn.cz' }).focus();
    await page.keyboard.press('Escape');

    await expect(panel).toBeHidden();
    await expect(helpButton).toBeFocused();
  });

  test('when a signed-in donor is asked about an older symbol on a 360 px phone, then the question fits the screen and both answers are big enough to tap', async ({ page }) => {
    await askAboutAnOlderSymbol(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);
    await page.setViewportSize({ width: 360, height: 800 });
    const question = page.getByRole('group', { name: /Z tohoto účtu k nám chodí/ });
    await expect(question).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    for (const name of ['Ano, jsou moje', 'Ne, nejsou moje']) {
      const size = await question.getByRole('button', { name }).boundingBox();
      expect(size?.width).toBeGreaterThanOrEqual(24);
      expect(size?.height).toBeGreaterThanOrEqual(24);
    }
    expect(await violations(page)).toEqual([]);
  });

  test('when they open the sign-in dialog, then it fills the screen and nothing in it breaks the rules', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Otevřít menu' }).click();
    await page.locator('#mobile-menu .mobile-login').click();

    const panel = page.locator('.dialog-panel');
    await expect(panel).toBeVisible();
    expect((await panel.boundingBox())?.width).toBe(390);
    expect(await violations(page)).toEqual([]);
  });
});
