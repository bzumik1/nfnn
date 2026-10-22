import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import {
  administrator,
  bankAccountItem,
  mockDonorApi,
  openSignInDialog,
  problem,
  secondFactorEnrolment,
  secondFactorRequired,
  signIn,
  session,
} from './donor-session';

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
                : {
                    variableSymbol: '6123456789',
                    paymentCount: 14,
                    firstMonth: '2025-01',
                    lastMonth: '2026-10',
                  },
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
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
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

  test('when they open the privacy policy, then nothing on it breaks the rules', async ({
    page,
  }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');

    expect(await violations(page)).toEqual([]);
  });

  test('when they open an address the site does not know, then the page says so and breaks no rule', async ({
    page,
  }) => {
    await page.goto('/stara-stranka');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tuhle stránku jsme nenašli');
    await expect(page).toHaveURL(/\/stara-stranka$/);
    expect(await violations(page)).toEqual([]);
  });

  test('when they open a password reset link, then nothing on the page breaks the rules', async ({
    page,
  }) => {
    await page.goto('/obnova-hesla#token=abc');
    await expect(page.locator('h1')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they open an expired e-mail confirmation link, then nothing on the page breaks the rules', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/email-verification/confirm', (route) =>
      route.fulfill(
        problem(
          400,
          'donors/invalid-email-verification-token',
          'Odkaz pro potvrzení e-mailu je neplatný nebo vypršel',
          'Nechte si prosím poslat nový odkaz.',
        ),
      ),
    );

    await page.goto('/potvrzeni-emailu#token=abc');
    await expect(
      page.getByRole('heading', { name: 'Odkaz je neplatný nebo vypršel' }),
    ).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they open the sign-in dialog and its company registration, then nothing in it breaks the rules', async ({
    page,
  }) => {
    await openSignInDialog(page);
    expect(await violations(page)).toEqual([]);

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Registrace' }).click();
    await dialog.getByRole('radio', { name: 'Firma' }).click();

    expect(await violations(page)).toEqual([]);
  });

  test('when they send the contact form empty, then its error messages break no rule either', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Odeslat zprávu' }).click();
    await expect(page.locator('#contact-name')).toHaveAttribute('aria-invalid', 'true');

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor opens the overview, then nothing on it breaks the rules', async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.locator('.symbol-value')).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Jak přiřazujeme platby' }).click();
    await expect(page.getByRole('region', { name: 'Jak přiřazujeme platby' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor has a shared account, then its warning and the switch-off confirmation break no rule either', async ({
    page,
  }) => {
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

  test('when a signed-in donor is asked about an older symbol and answers it, then neither the question nor the answer breaks a rule', async ({
    page,
  }) => {
    await askAboutAnOlderSymbol(page);
    await signIn(page);
    const question = page.getByRole('group', {
      name: /Z tohoto účtu k nám chodí i platby s variabilním symbolem 6123456789/,
    });
    await expect(question).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await question.getByRole('button', { name: 'Ano, jsou moje' }).click();
    await expect(page.locator('.accounts-status')).toHaveText(
      'Přiřadili jsme vám 14 plateb s VS 6123456789 z účtu 19-2000145399/0800.',
    );
    await expect(question).toHaveCount(0);

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator opens the administration, then nothing on it breaks the rules', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/donations/import-state',
      (route) =>
        route.fulfill({
          json: {
            coveredFrom: '2026-07-20',
            coveredTo: '2026-10-17',
            lastAttemptedAt: '2026-10-18T09:00:00Z',
            lastSucceededAt: '2026-10-17T10:00:00Z',
            lastFailure: { kind: 'TRANSPORT', message: null, attemptedAt: '2026-10-18T09:00:00Z' },
            consecutiveFailures: 3,
            reportedOutage: 'TRANSPORT',
          },
        }),
    );
    await signIn(page, administrator);
    await page.getByRole('link', { name: 'Správa' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Správa' })).toBeFocused();
    await expect(page.locator('.admin-outage')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator pairs a bank payment, then the payments page and the dialog break no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/donations/payments',
      (route) =>
        route.fulfill({
          json: {
            year: null,
            availableYears: [],
            items: [
              {
                id: '019a1c00-0000-7000-8000-000000001001',
                bankTransactionId: 1001,
                bookedOn: '2026-10-10',
                amountMinor: 50000,
                currency: 'CZK',
                variableSymbol: '1111111111',
                counterpartyAccount: '2900233333/2010',
                counterpartyName: 'Nováková Jana',
                messageForRecipient: 'Dar pro fond',
                importedAt: '2026-10-17T10:00:00Z',
                unpairedByAdminAt: '2026-10-18T10:00:00Z',
                donation: null,
              },
            ],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/donations/donors',
      (route) =>
        route.fulfill({
          json: {
            items: [
              {
                donorId: administrator.id,
                name: 'Jana Nováková',
                type: 'PERSON',
                variableSymbol: '4821937560',
                companyIdentifier: null,
              },
            ],
          },
        }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/platby');
    await expect(page.getByRole('heading', { level: 1, name: 'Platby z banky' })).toBeFocused();
    await expect(page.locator('tbody tr')).toContainText('jen ručně');

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Přiřadit dárci' }).click();
    await page.getByRole('dialog').getByRole('searchbox').fill('jana');
    await expect(
      page.getByRole('dialog').getByRole('radio', { name: /Jana Nováková/ }),
    ).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator manages the administrators, then the page, its form and the confirmations break no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/donors/administrators',
      (route) =>
        route.fulfill({
          json: {
            items: [
              {
                donorId: administrator.id,
                name: 'Jana Nováková',
                email: 'jana@example.cz',
                secondFactorEnabled: true,
              },
              {
                donorId: '019a1c00-0000-7000-8000-00000000a002',
                name: 'Petr Svoboda',
                email: 'petr@example.cz',
                secondFactorEnabled: true,
              },
            ],
          },
        }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/spravci');
    await expect(page.getByRole('heading', { level: 1, name: 'Správci' })).toBeFocused();
    await expect(page.locator('tbody tr')).toHaveCount(2);

    expect(await violations(page)).toEqual([]);

    await page.locator('tbody tr').nth(1).getByRole('button', { name: 'Odebrat' }).click();
    await expect(page.locator('tbody tr').nth(1)).toContainText('Opravdu odebrat?');
    await page.getByRole('button', { name: 'Přidat správce' }).click();
    await expect(page.getByLabel('E-mail dárce')).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator corrects an older-symbol answer, then the page and its confirmation break no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/donations/symbol-claims',
      (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id: '019a1c00-0000-7000-8000-00000000c001',
                donorId: administrator.id,
                donorName: 'Jana Nováková',
                account: '1234567/0800',
                variableSymbol: '6123456789',
                answer: 'CONFIRMED',
                answeredAt: '2026-10-20T09:00:00Z',
                donationCount: 3,
              },
              {
                id: '019a1c00-0000-7000-8000-00000000c002',
                donorId: '019a1c00-0000-7000-8000-00000000a002',
                donorName: null,
                account: '2900233333/2010',
                variableSymbol: '777',
                answer: 'DECLINED',
                answeredAt: '2026-10-19T08:30:00Z',
                donationCount: 0,
              },
            ],
          },
        }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/starsi-symboly');
    await expect(page.getByRole('heading', { level: 1, name: 'Starší symboly' })).toBeFocused();
    await expect(page.locator('tbody tr')).toHaveCount(2);

    expect(await violations(page)).toEqual([]);

    await page.locator('tbody tr').first().getByRole('button', { name: 'Zrušit Ano' }).click();
    await expect(page.locator('tbody tr').first()).toContainText('změnit odpověď na Ne?');

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator reads the history, then the page with its paging breaks no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/donors/actions',
      (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id: '019a1c00-0000-7000-8000-00000000e001',
                adminId: administrator.id,
                adminName: 'Jana Nováková',
                adminEmail: 'jana@example.cz',
                action: 'PAIR_PAYMENT',
                subjectId: '019a1c00-0000-7000-8000-000000001001',
                details:
                  'Bank payment 019a1c00-0000-7000-8000-000000001001 paired to donor by hand',
                performedAt: '2026-10-22T10:00:00Z',
              },
              {
                id: '019a1c00-0000-7000-8000-00000000e002',
                adminId: '019a1c00-0000-7000-8000-00000000a009',
                adminName: null,
                adminEmail: null,
                action: 'REVOKE_ADMINISTRATION',
                subjectId: null,
                details: 'details',
                performedAt: '2026-10-21T10:00:00Z',
              },
            ],
            hasMore: true,
          },
        }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/historie');
    await expect(page.getByRole('heading', { level: 1, name: 'Historie správy' })).toBeFocused();
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Načíst starší' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor edits their data, then the form breaks no rule either', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Upravit údaje' }).click();
    await page.getByLabel('Město').fill('');
    await page.getByRole('button', { name: 'Uložit' }).click();
    await expect(page.getByLabel('Město')).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor opens the e-mail and password forms, then neither breaks a rule, with errors shown either', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Změnit e-mail' }).click();
    await page.getByLabel('Nový e-mail').fill('not-an-email');
    await page.getByRole('button', { name: 'Poslat potvrzovací odkaz' }).click();
    await expect(page.getByLabel('Nový e-mail')).toBeFocused();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Zrušit' }).click();
    await page.getByRole('button', { name: 'Změnit heslo' }).click();
    await expect(page.getByLabel('Současné heslo')).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor sets up the second factor, then the QR step breaks no rule, with its error shown either', async ({
    page,
  }) => {
    await page.route('**/api/donors/me/second-factor/setup', (route) =>
      route.fulfill({ json: secondFactorEnrolment }),
    );
    await signIn(page);
    await page.getByRole('button', { name: 'Zapnout dvoufaktorové ověření' }).click();
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();

    expect(await violations(page)).toEqual([]);

    await page.getByLabel('Kód z aplikace').fill('12345');
    await page.getByRole('button', { name: 'Zapnout dvoufaktorové ověření' }).click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when a donor with the second factor on signs in, then the code step breaks no rule', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.form-submit').click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when they press Tab first, then the skip link appears and takes them to the content', async ({
    page,
  }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');
    await expect(page.locator('h1')).toBeVisible();
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Přeskočit na obsah' });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(page.locator('main')).toBeFocused();
    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju$/);
  });

  test('when they open the sign-in dialog from the keyboard, then the focus stays in it and comes back after Esc', async ({
    page,
  }) => {
    await page.goto('/');
    const signInButton = page.locator('.nav-login');
    await signInButton.focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#login-email')).toBeFocused();
    for (let step = 0; step < 15; step++) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(
          () =>
            document.activeElement === document.body || !!document.activeElement?.closest('dialog'),
        ),
      ).toBe(true);
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

  test('when they open the menu, then its button says so, nothing breaks the rules and Esc closes it', async ({
    page,
  }) => {
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

  test('when a signed-in donor opens how payments are paired on a 360 px phone, then it fits the screen, breaks no rule and Esc closes it', async ({
    page,
  }) => {
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    expect(await violations(page)).toEqual([]);

    await panel.getByRole('link', { name: 'info@nfnn.cz' }).focus();
    await page.keyboard.press('Escape');

    await expect(panel).toBeHidden();
    await expect(helpButton).toBeFocused();
  });

  test('when a signed-in donor is asked about an older symbol on a 360 px phone, then the question fits the screen and both answers are big enough to tap', async ({
    page,
  }) => {
    await askAboutAnOlderSymbol(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);
    await page.setViewportSize({ width: 360, height: 800 });
    const question = page.getByRole('group', { name: /Z tohoto účtu k nám chodí/ });
    await expect(question).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    for (const name of ['Ano, jsou moje', 'Ne, nejsou moje']) {
      const size = await question.getByRole('button', { name }).boundingBox();
      expect(size?.width).toBeGreaterThanOrEqual(24);
      expect(size?.height).toBeGreaterThanOrEqual(24);
    }
    expect(await violations(page)).toEqual([]);
  });

  test('when they open the sign-in dialog, then it fills the screen and nothing in it breaks the rules', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Otevřít menu' }).click();
    await page.locator('#mobile-menu .mobile-login').click();

    const panel = page.locator('.dialog-panel');
    await expect(panel).toBeVisible();
    expect((await panel.boundingBox())?.width).toBe(390);
    expect(await violations(page)).toEqual([]);
  });
});
