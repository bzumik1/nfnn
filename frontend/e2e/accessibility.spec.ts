import AxeBuilder from '@axe-core/playwright';
import { routeLogsApi } from './admin-logs-api';
import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  administrator,
  adminSettings,
  bankAccountItem,
  claudeConnection,
  connectionRequest,
  donationItem,
  donor,
  mockConnectApi,
  mockDonorApi,
  openDonorSection,
  openSignInDialog,
  problem,
  samplePngBase64,
  secondFactorEnrolment,
  secondFactorRecovery,
  secondFactorRequired,
  signIn,
  session,
} from './donor-session';
import {
  chunkLoadNotice,
  chunkLoadPageHeading,
  openHomeThenLoseNewChunks,
  openPolicyFromFooter,
  withoutSessionStorage,
} from './lost-chunks';
import { uploadedSignature } from './signature-image';

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
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
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
    await expect(page.locator('.qr-code svg')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when the home page shows published news and projects and they open both pages, then nothing breaks the rules', async ({
    page,
  }) => {
    const imageId = '0199f3e0-0000-7000-8000-00000000a001';
    const article = {
      id: '0199f3e0-0000-7000-8000-00000000c001',
      slug: 'zahrada-pro-deti',
      title: 'Zahrada pro děti',
      tag: 'Projekt',
      perex: 'Stavíme zahradu, kde si děti budou hrát.',
      body: 'První odstavec.\n\nDruhý odstavec.',
      coverImage: { id: imageId, url: `/api/content/media/${imageId}`, alt: null },
      publishedOn: '2026-10-20',
      live: true,
      createdAt: '2026-10-19T09:00:00Z',
      updatedAt: '2026-10-20T07:30:00Z',
    };
    const project = {
      ...article,
      id: '0199f3e0-0000-7000-8000-00000000c002',
      slug: 'dominik-7-let',
      title: 'Dominik, 7 let',
      year: 2024,
      tag: 'Kompenzační pomůcky',
      coverImage: null,
    };
    await page.route(
      (url) => url.pathname === '/api/content/home',
      (route) => route.fulfill({ json: { news: [article], projects: [project] } }),
    );
    await page.route(
      (url) => url.pathname === `/api/content/news/${article.slug}`,
      (route) => route.fulfill({ json: article }),
    );
    await page.route(
      (url) => url.pathname === `/api/content/projects/${project.slug}`,
      (route) => route.fulfill({ json: project }),
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/content/media/'),
      (route) =>
        route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(samplePngBase64, 'base64'),
        }),
    );

    await page.goto('/');
    await expect(page.locator('#aktuality .news-card')).toHaveCount(1);
    await expect(page.locator('.qr-code svg')).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.goto('/aktuality/zahrada-pro-deti');
    await expect(page.getByRole('heading', { level: 1, name: 'Zahrada pro děti' })).toBeFocused();

    expect(await violations(page)).toEqual([]);

    await page.goto('/projekty/dominik-7-let');
    await expect(page.getByRole('heading', { level: 1, name: 'Dominik, 7 let' })).toBeFocused();

    expect(await violations(page)).toEqual([]);
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) =>
        route.fulfill({
          json: { items: [article], page: 1, size: 10, total: 21, hasMore: true },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/content/projects',
      (route) =>
        route.fulfill({ json: { items: [], page: 0, size: 10, total: 0, hasMore: false } }),
    );
    await page.goto('/aktuality?strana=2');
    await expect(page.getByRole('heading', { level: 1, name: 'Aktuality' })).toBeFocused();
    await expect(page.getByText('Strana 2 z 3')).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.goto('/projekty');
    await expect(page.getByText('Zatím tu žádný projekt není.')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they open the privacy policy, then nothing on it breaks the rules', async ({
    page,
  }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');

    expect(await violations(page)).toEqual([]);
  });

  test('when a page cannot be loaded and the reload bar shows over the page, then nothing breaks the rules', async ({
    page,
  }) => {
    await withoutSessionStorage(page);
    await openHomeThenLoseNewChunks(page);
    await openPolicyFromFooter(page);
    await expect(chunkLoadNotice(page)).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when the first page cannot be loaded and its own page offers a reload, then nothing breaks the rules', async ({
    page,
  }) => {
    await openHomeThenLoseNewChunks(page);
    await openPolicyFromFooter(page);
    await expect(page.getByRole('heading', chunkLoadPageHeading)).toBeVisible();

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

  test('when they restore access with a new passkey and the code from the app is needed, then the page breaks no rule', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/password-reset/passkey/options', (route) =>
      route.fulfill(
        problem(
          400,
          'donors/second-factor-code-required',
          'Zadejte kód z aplikace',
          'Účet má zapnuté dvoufaktorové ověření.',
        ),
      ),
    );
    await page.goto('/obnova-hesla#token=abc');
    await page.getByRole('radio', { name: 'Nový přístupový klíč' }).click();
    await page.getByLabel('Název klíče').fill('Nový telefon');
    await page.getByRole('button', { name: 'Vytvořit klíč' }).click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when a donor without a password confirms the e-mail, then the offer of the first passkey breaks no rule', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/email-verification/confirm', (route) =>
      route.fulfill(session(200, { ...donor, hasPassword: false })),
    );
    await page.goto('/potvrzeni-emailu#token=abc');
    await expect(page.getByRole('button', { name: 'Vytvořit přístupový klíč' })).toBeVisible();

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

  test('when an application asks an administrator to connect, then the sign-in prompt, the consent and the connected applications break no rule', async ({
    page,
  }) => {
    await mockConnectApi(page);
    await page.route('**/api/donors/auth/login', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto(connectionRequest);
    await expect(
      page.getByRole('heading', { name: 'Aplikace žádá o přístup ke správě' }),
    ).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.locator('.ui-panel-page').getByRole('button', { name: 'Přihlásit se' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#login-email').fill('jana@example.cz');
    await dialog.locator('#login-password').fill('correct horse battery');
    await dialog.locator('.ui-button--block').click();
    await expect(page.getByRole('button', { name: 'Povolit', exact: true })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Povolit', exact: true }).click();
    await expect(page.getByLabel('Kód z aplikace')).toHaveAttribute('aria-invalid', 'true');
    expect(await violations(page)).toEqual([]);

    await page.route(
      (url) => url.pathname === '/api/donors/me/connections',
      (route) => route.fulfill({ json: { items: [claudeConnection] } }),
    );
    await page.goto('/darce/udaje');
    await expect(page.locator('.connections .connection-client')).toHaveText('claude.ai');
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

    await dialog.getByRole('radio', { name: 'Přístupovým klíčem' }).click();

    expect(await violations(page)).toEqual([]);
  });

  test('when a company registration is filled in from the business register, then the form and its status line break no rule', async ({
    page,
  }) => {
    await page.route('**/api/donors/company-lookup?*', (route) =>
      route.fulfill({
        json: {
          companyIdentifier: '45274649',
          name: 'Stavby Novák s.r.o.',
          address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
        },
      }),
    );
    await openSignInDialog(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Registrace' }).click();
    await dialog.getByRole('radio', { name: 'Firma' }).click();
    await dialog.getByLabel('IČO').fill('45274649');
    await expect(dialog.getByRole('status').filter({ hasText: /\S/ })).toContainText('ARES');

    expect(await violations(page)).toEqual([]);
  });

  test('when they ask for a reset link and register, then the sent panels of the dialog break no rule', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/password-reset/request', (route) =>
      route.fulfill({ status: 202, body: '' }),
    );
    await page.route('**/api/donors/auth/register', (route) =>
      route.fulfill({ status: 202, body: '' }),
    );
    await openSignInDialog(page);
    const dialog = page.getByRole('dialog');

    await dialog.locator('#login-email').fill('jana@example.cz');
    await dialog.getByRole('button', { name: 'Zapomněli jste heslo?' }).click();
    await dialog.getByRole('button', { name: 'Odeslat odkaz' }).click();
    await expect(dialog.getByRole('heading', { name: 'Zkontrolujte si e-mail' })).toBeFocused();
    expect(await violations(page)).toEqual([]);

    await dialog.getByRole('button', { name: 'Zpět na přihlášení' }).click();
    await dialog.getByRole('button', { name: 'Registrace' }).click();
    await dialog.locator('#register-name').fill('Jana Nováková');
    await dialog.locator('#register-street').fill('Dlouhá 12');
    await dialog.locator('#register-postal-code').fill('400 01');
    await dialog.locator('#register-city').fill('Ústí nad Labem');
    await dialog.locator('#register-password').fill('correct horse battery');
    await dialog.getByRole('button', { name: 'Vytvořit účet' }).click();
    await expect(dialog.getByRole('heading', { name: 'Zkontrolujte si e-mail' })).toBeFocused();
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

  test('when a signed-in donor opens each section, then nothing on them breaks the rules', async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.locator('.send-gift app-qr-code')).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.locator('.send-gift').getByRole('button', { name: 'Jiná částka' }).click();
    await page.locator('#send-gift-custom-amount').fill('2 500');
    await expect(page.locator('.send-gift .bank-value').nth(1)).toHaveText('2 500 Kč');

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Jak nastavit trvalý příkaz' }).click();
    await expect(page.locator('.standing-details .standing-value').first()).toHaveText(
      '5544332217/2010',
    );
    await page.getByRole('button', { name: 'Zkontrolovat nové platby' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Žádný nový dar' })).toBeVisible();

    expect(await violations(page)).toEqual([]);

    for (const section of ['Moje dary', 'Potvrzení o daru', 'Údaje a zabezpečení']) {
      await openDonorSection(page, section);
      expect(await violations(page)).toEqual([]);
    }

    await openDonorSection(page, 'Bankovní účty');
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Jak přiřazujeme platby' }).click();
    await expect(page.getByRole('region', { name: 'Jak přiřazujeme platby' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor adds a bank account, then the dialog breaks no rule while it waits for the payment or once the account is verified', async ({
    page,
  }) => {
    await page.clock.install();
    let dialogOpen = false;
    let paymentBooked = false;
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-check',
      (route) => {
        if (route.request().method() === 'POST' && dialogOpen) {
          paymentBooked = true;
        }
        return route.fulfill({
          status: 202,
          json: { bankDataAsOf: '2026-10-18T08:05:30Z', checking: false },
        });
      },
    );
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-accounts',
      (route) =>
        route.fulfill({
          json: {
            items: paymentBooked
              ? [
                  bankAccountItem({
                    accountNumber: '1234567890/0800',
                    verifiedOn: '2026-10-18',
                    verificationPaymentOn: '2026-10-18',
                    symbolOffer: {
                      variableSymbol: '6123456789',
                      paymentCount: 1,
                      firstMonth: '2026-10',
                      lastMonth: '2026-10',
                    },
                  }),
                ]
              : [],
          },
        }),
    );
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');

    await page.getByRole('button', { name: 'Přidat účet' }).click();
    dialogOpen = true;
    const watch = page.getByRole('dialog').locator('.add-account-watch');
    await expect(watch).toContainText('Čekáme na vaši platbu…');

    expect(await violations(page)).toEqual([]);

    await page.clock.fastForward(30_000);
    await expect(watch).toContainText('Účet 1234567890/0800 je ověřený');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Ano, jsou moje' }),
    ).toBeVisible();

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
    await openDonorSection(page, 'Bankovní účty');
    await expect(page.locator('.account-hint--warning')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Nepřiřazovat platby z tohoto účtu' }).click();
    await expect(page.getByRole('button', { name: 'Ponechat' })).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor is asked about an older symbol and answers it, then neither the question nor the answer breaks a rule', async ({
    page,
  }) => {
    await askAboutAnOlderSymbol(page);
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');
    const question = page.getByRole('group', {
      name: /Z tohoto účtu k nám chodí i platby s variabilním symbolem 6123456789/,
    });
    await expect(question).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await question.getByRole('button', { name: 'Ano, jsou moje' }).click();
    await expect(page.locator('.accounts-status')).toHaveText(
      'Přiřadili jsme vám 14 plateb se symbolem 6123456789 z účtu 19-2000145399/0800.',
    );
    await expect(question).toHaveCount(0);

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator opens the administration, then nothing on it breaks the rules', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/donations/overview',
      (route) =>
        route.fulfill({
          json: {
            year: 2026,
            availableYears: [2026, 2025],
            donorsRegistered: 3,
            newDonors: 3,
            givingDonors: 3,
            received: { count: 5, totalMinor: 288350, currency: 'CZK' },
            paired: { count: 4, totalMinor: 273350, currency: 'CZK' },
            unpaired: { count: 1, totalMinor: 15000, currency: 'CZK' },
            months: [
              {
                month: '2026-10',
                received: { count: 1, totalMinor: 99900, currency: 'CZK' },
                newDonors: 1,
                givingDonors: 1,
                paired: { count: 1, totalMinor: 99900, currency: 'CZK' },
                unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
              },
              {
                month: '2026-09',
                received: { count: 4, totalMinor: 188450, currency: 'CZK' },
                newDonors: 2,
                givingDonors: 2,
                paired: { count: 3, totalMinor: 173450, currency: 'CZK' },
                unpaired: { count: 1, totalMinor: 15000, currency: 'CZK' },
              },
            ],
          },
        }),
    );
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
    await page.route(
      (url) => url.pathname === '/api/admin/operations/backups',
      (route) =>
        route.fulfill({
          json: {
            available: true,
            backups: [],
            lastBackup: {
              outcome: 'OK',
              startedAt: '2026-10-23T01:00:00Z',
              finishedAt: '2026-10-23T01:00:03Z',
              fileName: 'nfnn-2026-10-23_0300.dump.age',
              sizeBytes: 1590,
              tables: null,
              requestId: null,
              error: null,
            },
            lastTestRestore: null,
            lastRestore: null,
            restoreFiles: [],
            pendingRequests: 0,
            problems: [],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/donors/me/previous-sign-in',
      (route) => route.fulfill({ json: { previousSignInAt: '2026-10-28T20:14:00Z' } }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/donations/overview/since',
      (route) =>
        route.fulfill({
          json: {
            from: '2026-10-28T20:14:00Z',
            payments: { count: 5, totalMinor: 1250000, currency: 'CZK' },
            paired: { count: 3, totalMinor: 750000, currency: 'CZK' },
            unpaired: { count: 2, totalMinor: 500000, currency: 'CZK' },
            newDonors: 3,
          },
        }),
    );
    await signIn(page, administrator);
    await page.getByRole('link', { name: 'Správa' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Správa' })).toBeFocused();
    await expect(
      page
        .getByRole('region', { name: 'Od posledního přihlášení' })
        .getByRole('link', { name: '2 platby za 5 000 Kč' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Co potřebuje vaši pozornost' })).toContainText(
      'Platby z banky se nestahují',
    );
    await expect(page.locator('.overview-table tbody tr')).toHaveCount(2);
    await expect(page.getByText('Zálohování je v pořádku.')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator opens the administration menu on a phone, then the open side panel breaks no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/donations/import-state',
      (route) =>
        route.fulfill({
          json: {
            coveredFrom: null,
            coveredTo: null,
            lastAttemptedAt: null,
            lastSucceededAt: null,
            lastFailure: null,
            consecutiveFailures: 0,
            reportedOutage: null,
          },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/donations/overview',
      (route) =>
        route.fulfill({
          json: {
            year: 2026,
            availableYears: [2026],
            donorsRegistered: 0,
            newDonors: 0,
            received: { count: 0, totalMinor: 0, currency: 'CZK' },
            paired: { count: 0, totalMinor: 0, currency: 'CZK' },
            unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
            months: [],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/backups',
      (route) =>
        route.fulfill({
          json: {
            available: true,
            backups: [],
            lastBackup: null,
            lastTestRestore: null,
            lastRestore: null,
            restoreFiles: [],
            pendingRequests: 0,
            problems: ['BACKUP_MISSING'],
          },
        }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sprava');
    await expect(
      page.getByRole('region', { name: 'Co potřebuje vaši pozornost' }).getByRole('alert'),
    ).toHaveCount(2);
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Menu správy' }).click();
    await expect(
      page
        .getByRole('navigation', { name: 'Správa' })
        .getByRole('link', { name: 'Přehled', exact: true }),
    ).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator sets up the monthly report, then the page, its form and the sending confirmation break no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/donations/report',
      (route) =>
        route.fulfill({
          json: {
            settings: {
              recipients: ['info@nfnn.cz', 'pavel@example.cz'],
              sendDay: 5,
              sendHour: 7,
              sections: {
                donors: true,
                donations: true,
                unpairedPayments: false,
                bankImport: true,
              },
              changedAt: '2026-10-05T07:00:00Z',
            },
            sentReports: [{ month: '2026-09', sentAt: '2026-10-05T05:00:00Z' }],
            nextReport: { month: '2026-10', dueOn: '2026-11-05' },
            lastEndedMonth: '2026-10',
          },
        }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));

    await page.goto('/sprava/prehledy');
    await expect(page.getByRole('heading', { level: 1, name: 'Měsíční e-mail' })).toBeFocused();
    await page.getByLabel('Příjemci').fill('pavel');
    await page.getByRole('button', { name: 'Uložit nastavení' }).click();
    await expect(page.getByLabel('Příjemci')).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Poslat přehled', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Poslat přehled?' })).toBeVisible();

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

    await page
      .locator('tbody tr')
      .nth(1)
      .getByRole('button', { name: 'Odebrat roli správce' })
      .click();
    await expect(page.locator('tbody tr').nth(1)).toContainText('Odebrat roli správce?');
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
    await expect(
      page.getByRole('heading', { level: 1, name: 'Odpovědi o starších symbolech' }),
    ).toBeFocused();
    await expect(page.locator('tbody tr')).toHaveCount(2);

    expect(await violations(page)).toEqual([]);

    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Vrátit přiřazení darů' })
      .click();
    await expect(page.locator('tbody tr').first()).toContainText('odpověď se změní na Ne');

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator finds a donor and opens the card, then the search, the card and its confirmations break no rule', async ({
    page,
  }) => {
    const petrId = '019a1c00-0000-7000-8000-00000000a002';
    const petr = {
      donorId: petrId,
      type: 'PERSON',
      name: 'Petr Svoboda',
      companyIdentifier: null,
      address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
      email: 'petr@example.cz',
      variableSymbol: '7310945528',
      preferredLocale: 'cs',
      registeredAt: '2026-10-17T10:00:00Z',
      emailVerified: false,
      administrator: false,
      secondFactorEnabled: true,
      passkeys: 2,
    };
    await page.route(
      (url) => url.pathname === '/api/admin/donors',
      (route) =>
        route.fulfill({
          json: {
            items: [
              petr,
              {
                ...petr,
                donorId: administrator.id,
                name: 'Jana Nováková',
                administrator: true,
                emailVerified: true,
              },
            ],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === `/api/admin/donors/${petrId}`,
      (route) => route.fulfill({ json: petr }),
    );
    await page.route(
      (url) => url.pathname === `/api/admin/donations/donors/${petrId}`,
      (route) =>
        route.fulfill({
          json: {
            donor: {
              donorId: petrId,
              name: 'Petr Svoboda',
              type: 'PERSON',
              variableSymbol: '7310945528',
              companyIdentifier: null,
              address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
              preferredLocale: 'cs',
              registeredAt: '2026-10-17T10:00:00Z',
            },
            bankAccounts: [
              bankAccountItem({
                donationCount: 2,
                totalAmountMinor: 50000,
                lastDonationOn: '2026-10-12',
                shared: true,
              }),
              bankAccountItem({
                id: '0192f0c4-0000-7000-8000-000000000002',
                accountNumber: '1234567/0800',
                status: 'DISCONNECTED',
                disconnectedOn: '2026-10-20',
                confirmedSymbols: ['6123456789'],
              }),
            ],
            donations: {
              items: [
                donationItem({
                  receivedAt: '2026-10-12',
                  amountMinor: 30000,
                  pairedBy: 'SENDER_ACCOUNT',
                  senderAccount: '2900233333/2010',
                }),
                donationItem({
                  id: '0192f0f1-0000-7000-8000-000000000002',
                  receivedAt: '2026-10-10',
                  receiptNumber: '2026-000001',
                  status: 'REFUNDED',
                }),
              ],
              totalAmountMinor: 80000,
              currency: 'CZK',
              count: 2,
            },
            receipts: [
              {
                id: '019a1c00-0000-7000-8000-00000000f001',
                number: '2026-000001',
                kind: 'SINGLE',
                donationId: '0192f0f1-0000-7000-8000-000000000002',
                donationReceivedOn: '2026-10-10',
                year: null,
                issuedOn: '2026-10-17',
                issuedAt: '2026-10-17T09:00:00Z',
                locale: 'cs',
                active: false,
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
    await page.goto('/sprava/darci');
    await expect(page.getByRole('heading', { level: 1, name: 'Dárci' })).toBeFocused();
    expect(await violations(page)).toEqual([]);

    await page.getByLabel('Jméno, e-mail nebo variabilní symbol').fill('sv');
    await expect(page.locator('tbody tr')).toHaveCount(2);
    expect(await violations(page)).toEqual([]);

    await page.getByRole('link', { name: 'Petr Svoboda' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Petr Svoboda' })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Vydaná potvrzení' })).toContainText(
      '2026-000001',
    );
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }).click();
    await page.getByRole('button', { name: 'Odebrat účet' }).first().click();
    await expect(page.getByRole('group', { name: 'Odebrat účet?' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Odebrat přístupové klíče' }).click();
    await expect(page.getByRole('group', { name: 'Odebrat přístupové klíče?' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Vymazat osobní údaje' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Vymazat osobní údaje: Petr Svoboda' }),
    ).toBeVisible();
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
                donorId: administrator.id,
                summary: 'Platba 500 Kč ze dne 10. 10. 2026 ručně přiřazena dárci Jana Nováková.',
                details: 'Platba 1001 ručně přiřazena dárci',
                performedAt: '2026-10-22T10:00:00Z',
              },
              {
                id: '019a1c00-0000-7000-8000-00000000e002',
                adminId: '019a1c00-0000-7000-8000-00000000a009',
                adminName: null,
                adminEmail: null,
                action: 'REVOKE_ADMINISTRATION',
                subjectId: null,
                donorId: null,
                summary: 'Role správce odebrána dárci (účet už neexistuje).',
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
    await expect(page.getByRole('heading', { level: 1, name: 'Historie změn' })).toBeFocused();
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Načíst starší' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator watches the backups, then the page with its problems and busy action breaks no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/operations/backups',
      (route) =>
        route.fulfill({
          json: {
            available: true,
            backups: [
              {
                fileName: 'nfnn-2026-10-23_0300.dump.age',
                kind: 'DAILY',
                sizeBytes: 1590,
                createdAt: '2026-10-23T01:00:03Z',
              },
            ],
            lastBackup: {
              outcome: 'FAILED',
              startedAt: '2026-10-24T01:00:00Z',
              finishedAt: '2026-10-24T01:00:01Z',
              fileName: 'nfnn-2026-10-24_0300.dump.age',
              sizeBytes: null,
              tables: null,
              requestId: null,
              error: 'pg_dump: error: connection to server failed',
            },
            lastTestRestore: null,
            lastRestore: null,
            restoreFiles: [
              {
                fileName: 'nfnn-2026-10-20_0300.dump.age.skipped',
                state: 'SKIPPED',
                changedAt: '2026-10-21T06:00:00Z',
              },
            ],
            pendingRequests: 2,
            restorePending: false,
            problems: ['BACKUP_FAILED', 'TEST_RESTORE_MISSING'],
            schedule: {
              backupTime: '02:30',
              testRestoreDay: 6,
              testRestoreTime: '05:15',
              applied: { backupTime: '03:00', testRestoreDay: 7, testRestoreTime: '04:00' },
            },
            key: { available: true, confirmed: false, confirmedAt: null },
          },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/backups/key/reveal',
      (route) =>
        route.fulfill({
          json: {
            key: 'AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH',
            checkPositions: [2, 13, 24],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/backups/requests',
      (route) =>
        route.fulfill({
          status: 202,
          json: { requestId: 'req-1', kind: 'BACKUP', requestedAt: '2026-10-24T08:00:00Z' },
        }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/zalohy');
    await expect(page.getByRole('heading', { level: 1, name: 'Zálohy' })).toBeFocused();
    await expect(page.locator('.problems > ul > li')).toHaveCount(2);
    await expect(page.getByRole('heading', { level: 2, name: 'Plán záloh' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Zobrazit klíč…' }).click();
    await page.locator('#backup-key-code').fill('123456');
    await page.getByRole('button', { name: 'Zobrazit klíč', exact: true }).click();
    await expect(page.locator('.backup-key')).toBeVisible();
    await page.getByRole('button', { name: 'Potvrdit uložení' }).click();
    await expect(page.locator('#backup-key-word-2-error')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page
      .getByRole('button', { name: 'Obnovit databázi ze zálohy nfnn-2026-10-23_0300.dump.age' })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: 'Zrušit' }).click();

    await page.getByRole('button', { name: 'Zálohovat teď' }).click();
    await expect(page.getByRole('button', { name: 'Zálohujeme…' })).toBeDisabled();
    expect(await violations(page)).toEqual([]);
  });

  test('when the site is set up for the first time, then the code step and the form with its errors break no rule', async ({
    page,
  }) => {
    let unlocked = false;
    await page.route(
      (url) => url.pathname === '/api/operations/setup',
      (route) => route.fulfill({ json: { required: true, codeRequired: true } }),
    );
    await page.route(
      (url) => url.pathname === '/api/operations/setup/restore',
      (route) =>
        route.fulfill(
          problem(
            400,
            'operations/not-a-backup',
            'Tohle není záloha webu',
            'Vyberte prosím soubor zálohy s příponou .dump, jak ho stáhnete ve Správě na stránce Zálohy.',
          ),
        ),
    );
    await page.route(
      (url) => url.pathname === '/api/operations/setup/unlock',
      (route) => {
        unlocked = true;
        return route.fulfill({ status: 204, body: '' });
      },
    );
    await page.route(
      (url) => url.pathname === '/api/operations/setup/backup-key',
      (route) =>
        route.fulfill({
          json: {
            key: 'AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH',
            checkPositions: [2, 13, 24],
          },
        }),
    );
    await page.goto('/prvni-nastaveni');
    await expect(
      page.getByRole('heading', { level: 1, name: 'První nastavení webu' }),
    ).toBeFocused();
    expect(await violations(page)).toEqual([]);

    await page.locator('#setup-code').fill('K7QM-2XPA-9TRD');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.locator('#setup-admin-email')).toBeVisible();
    expect(unlocked).toBe(true);
    await page.getByRole('button', { name: 'Uložit a spustit' }).click();
    await expect(page.locator('#setup-admin-email')).toBeFocused();
    expect(await violations(page)).toEqual([]);
    await page.locator('#setup-mail-username').fill('abc@smtp-brevo.com');
    await page.locator('#setup-mail-password').fill('xsmtpsib-key');
    await page.locator('#setup-admin-email').fill('spravce@example.cz');
    await expect(page.locator('.backup-key')).toBeVisible();
    await page.locator('#setup-backup-key-word-2').fill('komora');
    await page.locator('#setup-backup-key-word-13').fill('motivace');
    await page.locator('#setup-backup-key-word-24').fill('studna');
    await page.getByRole('button', { name: 'Uložit a spustit' }).click();
    await expect(page.locator('.mail-unverified')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Obnovit ze zálohy' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Obnovit web ze zálohy' }),
    ).toBeFocused();
    await page.getByLabel('Soubor zálohy').setInputFiles({
      name: 'fotka.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('JPEG'),
    });
    await expect(page.getByRole('alert')).toContainText('není soubor zálohy');
    await expect(page.getByRole('button', { name: 'Nahrát a obnovit' })).toBeDisabled();
    expect(await violations(page)).toEqual([]);
    await page.getByLabel('Soubor zálohy').setInputFiles({
      name: 'nfnn-2026-10-22_0300.dump.age',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('age-encryption.org/v1'),
    });
    await page.getByRole('button', { name: 'Nahrát a obnovit' }).click();
    await expect(page.locator('#setup-restore-key-error')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator changes the settings, then the page, its confirmation and a refused test e-mail break no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings/test-email',
      (route) =>
        route.fulfill({
          json: { outcome: 'SIGN_IN_REFUSED', sent: false, recipient: 'jana@example.cz' },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/donations/receipt-signature',
      (route) => route.fulfill({ json: uploadedSignature }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/nastaveni');
    await expect(page.getByRole('heading', { level: 1, name: 'Nastavení' })).toBeFocused();
    expect(await violations(page)).toEqual([]);

    await page.locator('#setting-RECEIPT_FIRST_YEAR').fill('2025');
    await page.getByRole('button', { name: 'Uložit nastavení' }).click();
    await expect(page.getByRole('button', { name: 'Uložit a restartovat' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByText('Adresa webu, server pro odesílání e-mailů a napojení na banku').click();
    await page.getByRole('button', { name: 'Poslat zkušební e-mail na moji adresu' }).click();
    await expect(page.locator('.test-row').getByRole('alert')).toContainText('odmítl přihlášení');
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Odebrat podpis' }).click();
    await expect(page.getByRole('group', { name: 'Odebrat podpis?' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator reads the logs, searches, raises a level and opens the thread dump, then the page breaks no rule', async ({
    page,
  }) => {
    await routeLogsApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/logy');
    await expect(page.getByRole('heading', { level: 1, name: 'Logy a diagnostika' })).toBeFocused();
    await expect(page.locator('.log-text').first()).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByLabel('Hledat', { exact: true }).fill('fio');
    await page.getByRole('button', { name: 'Hledat', exact: true }).click();
    await expect(page.locator('.match')).toHaveCount(2);
    await page.getByLabel('Logger').fill('not a logger!');
    await page.getByRole('button', { name: 'Nastavit' }).click();
    await expect(page.getByLabel('Logger')).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Zobrazit výpis vláken' }).click();
    await expect(page.locator('#logs-threads .log-text')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator writes a news article, then the list, the editor with its errors, its preview and the deletion confirmation break no rule', async ({
    page,
  }) => {
    const articleId = '0199f3e0-0000-7000-8000-00000000c001';
    const imageId = '0199f3e0-0000-7000-8000-00000000a001';
    const article = {
      id: articleId,
      slug: 'zahrada-pro-deti',
      title: 'Zahrada pro děti',
      tag: 'Projekt',
      perex: 'Stavíme zahradu, kde si děti budou hrát.',
      body: 'První odstavec.\n\nDruhý odstavec.',
      coverImage: { id: imageId, url: `/api/content/media/${imageId}`, alt: null },
      publishedOn: '2026-10-20',
      live: true,
      createdAt: '2026-10-19T09:00:00Z',
      updatedAt: '2026-10-20T07:30:00Z',
    };
    await page.route(
      (url) => url.pathname === '/api/admin/content/news',
      (route) =>
        route.fulfill({
          json: {
            items: [
              article,
              {
                ...article,
                id: 'x',
                slug: 'koncept',
                title: 'Koncept',
                tag: null,
                coverImage: null,
                publishedOn: null,
                live: false,
              },
              { ...article, id: 'y', slug: 'pozdeji', publishedOn: '2026-12-01', live: false },
            ],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === `/api/admin/content/news/${articleId}`,
      (route) => route.fulfill({ json: article }),
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/content/media/'),
      (route) =>
        route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(samplePngBase64, 'base64'),
        }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));

    await page.goto('/sprava/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: 'Aktuality' })).toBeFocused();
    await expect(page.locator('tbody tr')).toHaveCount(3);

    expect(await violations(page)).toEqual([]);

    await page.goto('/sprava/aktuality/nova');
    await expect(page.getByRole('heading', { level: 1, name: 'Nová aktualita' })).toBeFocused();
    await page.getByRole('button', { name: 'Uložit koncept' }).click();
    await expect(page.getByLabel('Titulek')).toHaveAttribute('aria-invalid', 'true');

    expect(await violations(page)).toEqual([]);

    await page.goto(`/sprava/aktuality/${articleId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Úprava aktuality' })).toBeFocused();
    await expect(page.locator('.image-preview')).toBeVisible();
    await page.getByRole('button', { name: 'Náhled', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Stránka aktuality' })).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Upravit', exact: true }).click();
    await page.getByRole('button', { name: 'Smazat aktualitu' }).click();
    await expect(page.getByRole('group', { name: 'Smazat aktualitu?' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator writes a project, then the list, the editor with its errors, its preview and the deletion confirmation break no rule', async ({
    page,
  }) => {
    const projectId = '0199f3e0-0000-7000-8000-00000000c001';
    const imageId = '0199f3e0-0000-7000-8000-00000000a001';
    const project = {
      id: projectId,
      slug: 'zahrada-pro-deti',
      title: 'Zahrada pro děti',
      year: 2024,
      tag: 'Kompenzační pomůcky',
      perex: 'Stavíme zahradu, kde si děti budou hrát.',
      body: 'První odstavec.\n\nDruhý odstavec.',
      coverImage: { id: imageId, url: `/api/content/media/${imageId}`, alt: null },
      publishedOn: '2026-10-20',
      createdAt: '2026-10-19T09:00:00Z',
      updatedAt: '2026-10-20T07:30:00Z',
    };
    await page.route(
      (url) => url.pathname === '/api/admin/content/projects',
      (route) =>
        route.fulfill({
          json: {
            items: [
              project,
              {
                ...project,
                id: 'x',
                slug: 'koncept',
                title: 'Koncept',
                year: 2026,
                tag: null,
                coverImage: null,
                publishedOn: null,
                live: false,
              },
              { ...project, id: 'y', slug: 'pozdeji', publishedOn: '2026-12-01', live: false },
            ],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === `/api/admin/content/projects/${projectId}`,
      (route) => route.fulfill({ json: project }),
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/content/media/'),
      (route) =>
        route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(samplePngBase64, 'base64'),
        }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));

    await page.goto('/sprava/projekty');
    await expect(page.getByRole('heading', { level: 1, name: 'Projekty' })).toBeFocused();
    await expect(page.locator('tbody tr')).toHaveCount(3);

    expect(await violations(page)).toEqual([]);

    await page.goto('/sprava/projekty/nova');
    await expect(page.getByRole('heading', { level: 1, name: 'Nový projekt' })).toBeFocused();
    await page.getByLabel('Rok').fill('2004');
    await page.getByRole('button', { name: 'Uložit koncept' }).click();
    await expect(page.getByLabel('Titulek')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Rok')).toHaveAttribute('aria-invalid', 'true');

    expect(await violations(page)).toEqual([]);

    await page.goto(`/sprava/projekty/${projectId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Úprava projektu' })).toBeFocused();
    await expect(page.locator('.image-preview')).toBeVisible();
    await page.getByRole('button', { name: 'Náhled', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Stránka projektu' })).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Upravit', exact: true }).click();
    await page.getByRole('button', { name: 'Smazat projekt' }).click();
    await expect(page.getByRole('group', { name: 'Smazat projekt?' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor edits their data, then the form breaks no rule either', async ({
    page,
  }) => {
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Upravit údaje' }).click();
    await page.getByLabel('Město').fill('');
    await page.getByRole('button', { name: 'Uložit údaje' }).click();
    await expect(page.getByLabel('Město')).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor opens the e-mail and password forms, then neither breaks a rule, with errors shown either', async ({
    page,
  }) => {
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
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

  test('when a signed-in donor has an e-mail change waiting and its re-send is refused, then the row breaks no rule', async ({
    page,
  }) => {
    await page.route('**/api/donors/me/email-change/resend', (route) =>
      route.fulfill(
        problem(429, 'donors/rate-limited', 'Příliš mnoho požadavků', 'Zkuste to později.'),
      ),
    );
    await signIn(page, {
      ...donor,
      pendingEmailChange: { newEmail: 'jana.nova@example.cz', expiresAt: '2026-10-25T10:00:00Z' },
    });
    await openDonorSection(page, 'Údaje a zabezpečení');
    await expect(page.locator('.account-pending-address')).toHaveText(
      'Čeká na potvrzení: jana.nova@example.cz',
    );
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Poslat znovu potvrzovací odkaz' }).click();
    await expect(page.locator('.account-pending').getByRole('alert')).toContainText(
      'Příliš mnoho požadavků',
    );
    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor sets up the second factor, then the QR step breaks no rule, with its error shown either', async ({
    page,
  }) => {
    await page.route('**/api/donors/me/second-factor/setup', (route) =>
      route.fulfill({ json: secondFactorEnrolment }),
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Zapnout dvoufaktorové ověření' }).click();
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();

    expect(await violations(page)).toEqual([]);

    await page.getByLabel('Kód z aplikace').fill('12345');
    await page.getByRole('button', { name: 'Zapnout kód z aplikace' }).click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor adds a passkey with a wrong password, renames and removes one, then the card breaks no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/donors/me/passkeys',
      (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id: '019a1b2c-3d4e-7f00-8000-000000000001',
                name: 'iPhone',
                createdAt: '2026-10-17T10:00:00Z',
                lastUsedAt: '2026-10-22T09:00:00Z',
              },
            ],
          },
        }),
    );
    await page.route('**/api/donors/me/passkeys/options', (route) =>
      route.fulfill(
        problem(400, 'donors/wrong-password', 'Nesprávné heslo', 'Zkuste to prosím znovu.'),
      ),
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Spravovat přístupové klíče' }).click();
    const card = page.getByRole('region', { name: 'Přístupové klíče' });
    await expect(card.locator('.passkey-name')).toHaveText(['iPhone']);
    expect(await violations(page)).toEqual([]);

    await card.getByRole('button', { name: 'Přidat přístupový klíč' }).click();
    await card.getByLabel('Současné heslo').fill('wrong horse battery');
    await card.getByRole('button', { name: 'Vytvořit klíč' }).click();
    await expect(card.getByRole('alert')).toContainText('Nesprávné heslo');
    expect(await violations(page)).toEqual([]);

    await card.getByRole('button', { name: 'Odebrat', exact: true }).click();
    await expect(card).toContainText('Odebrat klíč iPhone?');
    expect(await violations(page)).toEqual([]);

    await card.getByRole('button', { name: 'Ponechat' }).click();
    await card.getByRole('button', { name: 'Přejmenovat' }).click();
    await card.getByLabel('Nový název klíče').fill('');
    await card.getByRole('button', { name: 'Uložit název' }).click();
    await expect(card.getByText('Pojmenujte prosím klíč.')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('when a donor without a password and without a passkey opens the account details, then the warnings and the passkey form break no rule', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await signIn(page, { ...donor, hasPassword: false });
    await openDonorSection(page, 'Údaje a zabezpečení');
    const account = page.getByRole('region', { name: 'Přihlášení a zabezpečení' });
    await expect(account.locator('.account-no-method')).toBeVisible();
    await expect(account.getByRole('button', { name: 'Nastavit heslo' })).toHaveCount(0);
    expect(await violations(page)).toEqual([]);

    await account.getByRole('button', { name: 'Vytvořit přístupový klíč' }).click();
    const card = page.getByRole('region', { name: 'Přístupové klíče' });
    await expect(card.locator('.passkeys-warning')).toBeVisible();
    await expect(card.getByLabel('Název klíče')).toBeFocused();
    expect(await violations(page)).toEqual([]);
  });

  test('when a donor with a passkey opens the removal of the password, then the form breaks no rule', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donors/me/passkeys',
      (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id: '019a1b2c-3d4e-7f00-8000-000000000001',
                name: 'iPhone',
                createdAt: '2026-10-17T10:00:00Z',
                lastUsedAt: null,
              },
            ],
          },
        }),
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    const account = page.getByRole('region', { name: 'Přihlášení a zabezpečení' });
    await account.getByRole('button', { name: 'Odebrat heslo' }).click();
    await expect(account.getByLabel('Současné heslo')).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when a donor with the second factor on signs in, then the code step breaks no rule', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when a donor who lost the phone asks to recover access by payment, then the instructions break no rule', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    await page.route('**/api/donors/auth/login/second-factor/recovery', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(secondFactorRecovery),
      }),
    );
    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await page.getByRole('button', { name: 'Obnovit přístup platbou' }).click();
    await expect(page.getByRole('heading', { name: 'Obnova přístupu platbou' })).toBeFocused();

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
    await openDonorSection(page, 'Bankovní účty');
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
    await openDonorSection(page, 'Bankovní účty');
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
