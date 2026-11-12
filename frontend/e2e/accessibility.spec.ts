import AxeBuilder from '@axe-core/playwright';
import { routeLogsApi } from './admin-logs-api';
import { LOGO_IMAGE_ID, mockBankLogos } from './bank-logos';
import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  donorWithDonations,
  mockAdministration,
  PETR_DETAIL_PATH,
  rememberedSession,
  serveRecentDonors,
} from './baseline/screen-mocks';
import { rawDevice } from './raw-device';
import { giftArrivesAfterSavingQr } from './gift-arrival';
import { fakeCameraShowing, pdfWithLink, pngDataUrl, qrCodePng } from './receipt-code-files';
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
  noDonations,
  openAccountItem,
  openDonorSection,
  openSignInDialog,
  problem,
  serveAdministrationCopy,
  receiptSigningKeys,
  samplePngBase64,
  secondFactorEnrolment,
  secondFactorRecovery,
  secondFactorRequired,
  longUnusedDevices,
  signedInDevices,
  signIn,
  session,
} from './donor-session';
import {
  chunkLoadNotice,
  chunkLoadPageHeading,
  openAboutThenLoseNewChunks,
  openPolicyFromFooter,
  withoutSessionStorage,
} from './lost-chunks';
import { serveNewerApiGeneration, updateNotice } from './app-update';
import { fakePushDevice } from './push-device';
import {
  CHANGED_AMOUNT,
  forgetKeyList,
  keepKeyListNow,
  KEY_LIST,
  LIST_WITHOUT_THE_KEY,
  type ReceiptApi,
  REVOKED_KEY_LIST,
  scanFragment,
  breakSha256,
  serveReceiptApi,
  SINGLE_RECEIPT,
  YEARLY_RECEIPT,
} from './receipt-verification';
import {
  donations as receiptDonations,
  ISSUING,
  openReceiptsAfterSignIn,
  pretendIphoneThatShares,
  yearlyButton,
  yearlyLine,
} from './receipt-donations';
import { answerReceiptIssuing, RECEIPT_ISSUING_URL } from './receipt-issuing';
import { FOUR_DONORS, mockYearlyReceipts } from './yearly-receipts';
import {
  noSignatory,
  refusedVector,
  SIGNATORY_ID,
  signatory,
  vectorSignature,
} from './signature-image';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PAGE_PINCH_STOPPED_JAKUB_2026_10_31 = 'meta-viewport';

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
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_AA)
    .disableRules([PAGE_PINCH_STOPPED_JAKUB_2026_10_31])
    .analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
}

const FEED_SIGNER = {
  id: 'signer',
  name: 'Petr Vzorový',
  role: 'Předseda správní rady',
  portrait: null,
};

test.describe('Given a visitor who relies on WCAG 2.2 AA', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they open the home page, then nothing on it breaks the rules', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they open the About and Přispět tabs, then nothing on them breaks the rules', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    await expect(page.getByRole('heading', { level: 1, name: 'Vznik a poslání' })).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page
      .getByRole('navigation', { name: 'Hlavní sekce' })
      .getByRole('link', { name: 'Přispět' })
      .click();
    await expect(page.locator('.qr-code svg')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they pay from a phone and unfold the QR code for another device, then nothing in Přispět breaks the rules', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/prispet');
    await expect(page.getByRole('button', { name: 'Otevřít v aplikaci banky' })).toBeEnabled();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: /Platíte z jiného zařízení\?/ }).click();
    await expect(page.locator('#prispet .qr-code svg')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they pay from a phone and close the bank offer without a bank, then the line on how to pay without it breaks no rule', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', {
        value: () => Promise.reject(new DOMException('Share canceled', 'AbortError')),
        configurable: true,
      });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/prispet');
    await page.getByRole('button', { name: 'Otevřít v aplikaci banky' }).click();
    await expect(page.locator('#prispet .bank-app-hint')).toContainText(
      'Nenašli jste v nabídce svou banku?',
    );

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor pays from Přispět and the gift arrives, then the thanks with the link to the overview break no rule', async ({
    page,
  }) => {
    await giftArrivesAfterSavingQr(page);

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor opens the account sheet on a phone, then the sheet breaks no rule and Esc returns the focus to the account button', async ({
    page,
  }) => {
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const account = page.getByRole('banner').getByRole('button', { name: 'Účet' });

    await account.click();

    const sheet = page.getByRole('dialog', { name: 'Účet' });
    await expect(sheet).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.keyboard.press('Escape');

    await expect(sheet).toHaveCount(0);
    await expect(account).toBeFocused();
  });

  test('when a signed-in donor opens each section inside the account sheet on a phone, then the sheet breaks no rule and Esc closes it with the focus back on the account button', async ({
    page,
  }) => {
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('navigation', { name: 'Hlavní sekce' })
      .getByRole('link', { name: 'O nás' })
      .click();
    await expect(page).toHaveURL('/o-nas');
    const account = page.getByRole('banner').getByRole('button', { name: 'Účet' });

    for (const name of [
      'Můj přehled',
      'Moje dary',
      'Potvrzení o daru',
      'Bankovní účty',
      'Údaje a zabezpečení',
    ]) {
      await openAccountItem(page, name);
      const sheet = page.getByRole('dialog', { name });
      await expect(sheet).toBeVisible();
      expect(await violations(page), name).toEqual([]);
    }

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(account).toBeFocused();
  });

  test('when published news and projects are listed and they open both pages, then nothing breaks the rules', async ({
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

    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) =>
        route.fulfill({
          json: {
            items: [
              { ...article, signer: FEED_SIGNER },
              {
                ...article,
                id: 'older',
                slug: 'starsi',
                title: 'Starší zpráva',
                signer: FEED_SIGNER,
              },
            ],
            page: 0,
            size: 10,
            total: 2,
            hasMore: false,
          },
        }),
      { times: 1 },
    );
    await page.route(
      (url) => url.pathname === '/api/content/projects',
      (route) =>
        route.fulfill({ json: { items: [project], page: 0, size: 10, total: 1, hasMore: false } }),
      { times: 2 },
    );

    await page.goto('/aktuality');
    await expect(page.locator('.featured')).toHaveCount(1);
    await expect(page.locator('.news-card')).toHaveCount(1);
    await expect(page.locator('.story')).toHaveCount(1);

    expect(await violations(page)).toEqual([]);
    await expect(page.locator('.featured .signer-name')).toHaveText('Petr Vzorový');

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const featured = page.locator('.featured');
    await featured.getByRole('button', { name: /^Kopírovat odkaz/ }).click();
    await expect(featured.getByRole('button', { name: 'Zkopírováno' })).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) => route.fulfill({ status: 503, body: '' }),
      { times: 1 },
    );
    await page.goto('/aktuality?strana=2');
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
      'Aktuality se nepodařilo načíst.',
    );

    expect(await violations(page)).toEqual([]);

    await page.goto('/projekty');
    await expect(page.locator('app-story-tile')).toHaveCount(1);

    expect(await violations(page)).toEqual([]);

    await page.getByRole('navigation', { name: 'Roky' }).getByRole('link', { name: 'Vše' }).click();
    await expect(page.locator('a.strip-all')).toHaveCount(1);

    expect(await violations(page)).toEqual([]);

    await page.goto('/prispet');
    await page.getByRole('button', { name: /^Zvětšit: QR platba/ }).click();
    await expect(page.getByRole('dialog', { name: 'Zvětšený QR kód' })).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.goto('/aktuality/zahrada-pro-deti');
    await expect(page.getByRole('heading', { level: 1, name: 'Zahrada pro děti' })).toBeFocused();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Zvětšit fotku' }).click();
    await expect(page.getByRole('dialog', { name: 'Zvětšená fotka' })).toBeVisible();

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
    await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeFocused();
    await expect(page.getByText('Strana 2 z 3')).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.goto('/projekty');
    await expect(page.getByText('Zatím tu žádný příběh není.')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when their browser can share but refuses to and they press Sdílet on a news article, then neither the button nor the offer to copy the link breaks the rules', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', {
        value: () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')),
        configurable: true,
      });
    });
    await page.route(
      (url) => url.pathname === '/api/content/news/zahrada-pro-deti',
      (route) =>
        route.fulfill({
          json: {
            id: '0199f3e0-0000-7000-8000-00000000c001',
            slug: 'zahrada-pro-deti',
            title: 'Zahrada pro děti',
            tag: 'Projekt',
            perex: 'Stavíme zahradu, kde si děti budou hrát.',
            body: 'První odstavec.',
            coverImage: null,
            publishedOn: '2026-10-20',
            createdAt: '2026-10-19T09:00:00Z',
            updatedAt: '2026-10-20T07:30:00Z',
          },
        }),
    );
    await page.goto('/aktuality/zahrada-pro-deti');
    await expect(page.getByRole('heading', { level: 1, name: 'Zahrada pro děti' })).toBeFocused();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Sdílet' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
      'Sdílení se nepodařilo. Odkaz na stránku si můžete zkopírovat.',
    );
    await expect(page.getByRole('button', { name: 'Kopírovat odkaz' })).toBeVisible();

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
    await openAboutThenLoseNewChunks(page);
    await openPolicyFromFooter(page);
    await expect(chunkLoadNotice(page)).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when the server speaks a newer API and the bar asks to load the new version, then nothing breaks the rules', async ({
    page,
  }) => {
    await serveNewerApiGeneration(page);
    await page.goto('/o-nas');
    await expect(updateNotice(page)).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when the first page cannot be loaded and its own page offers a reload, then nothing breaks the rules', async ({
    page,
  }) => {
    await openAboutThenLoseNewChunks(page);
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

  test.describe('when they verify receipt codes', () => {
    async function openVerification(page: Page, api: ReceiptApi): Promise<Locator> {
      await serveReceiptApi(page, api);
      const heading = page.getByRole('heading', { level: 1 });
      await page.goto('/overit');
      await expect(heading).toHaveText('Ověření potvrzení o daru');
      return heading;
    }

    async function scanAndCheck(
      page: Page,
      heading: Locator,
      fragment: string,
      title: string,
    ): Promise<void> {
      await scanFragment(page, fragment);
      await expect(heading).toHaveText(title);
      expect(await violations(page)).toEqual([]);
    }

    test('then the camera preview while scanning and a refused file break no rule', async ({
      page,
    }) => {
      await page.addInitScript(
        fakeCameraShowing,
        pngDataUrl(qrCodePng('https://example.org/jiny-kod')),
      );
      await openVerification(page, { keys: KEY_LIST, status: 'active' });

      await page.getByRole('button', { name: 'Naskenovat QR kód' }).click();
      await expect(page.locator('video')).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await page.getByRole('button', { name: 'Zastavit skenování' }).click();
      await page.getByLabel('Nahrát PDF nebo fotku').setInputFiles({
        name: 'poznamka.pdf',
        mimeType: 'application/pdf',
        buffer: pdfWithLink('https://example.org'),
      });
      await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('PDF');
      await page.getByRole('button', { name: 'Ověřit odkaz' }).click();
      await expect(page.locator('#proof-link-error')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('then the explanation, the check under way and every answer of the fund break no rule', async ({
      page,
    }) => {
      const api: ReceiptApi = { keys: KEY_LIST, status: 'never' };
      const heading = await openVerification(page, api);
      expect(await violations(page)).toEqual([]);

      await scanFragment(page, SINGLE_RECEIPT.fragment);
      await expect(page.getByText('Podpis sedí, ptáme se fondu na stav potvrzení…')).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await expect(heading).toHaveText('Podpis sedí, ale fond teď neodpověděl, zda potvrzení vede');
      expect(await violations(page)).toEqual([]);

      const answers: readonly [string, string, string][] = [
        ['active', YEARLY_RECEIPT.fragment, 'Podepsáno fondem Nová naděje'],
        ['replaced', SINGLE_RECEIPT.fragment, 'Fond toto potvrzení nahradil novějším'],
        ['withdrawn', YEARLY_RECEIPT.fragment, 'Fond toto potvrzení zrušil'],
        ['unknown', SINGLE_RECEIPT.fragment, 'Fond toto potvrzení ve své evidenci nevede'],
        ['outdated', YEARLY_RECEIPT.fragment, 'Potvrzení platilo ke dni vystavení'],
      ];
      for (const [status, fragment, title] of answers) {
        api.status = status;
        await scanAndCheck(page, heading, fragment, title);
      }
    });

    test('then every code or key list the page refuses breaks no rule', async ({ page }) => {
      const api: ReceiptApi = { keys: KEY_LIST, status: 'active' };
      const heading = await openVerification(page, api);

      const refusals: readonly [object, string, string][] = [
        [KEY_LIST, CHANGED_AMOUNT.fragment, 'Neověřeno: podpis neodpovídá údajům'],
        [
          LIST_WITHOUT_THE_KEY,
          YEARLY_RECEIPT.fragment,
          'Neověřeno: kód podepsal klíč, který fond nezveřejnil',
        ],
        [REVOKED_KEY_LIST, SINGLE_RECEIPT.fragment, 'Neověřeno: fond tento klíč zneplatnil'],
        [KEY_LIST, SINGLE_RECEIPT.fragment.slice(0, 60), 'Odkaz je neúplný'],
        [KEY_LIST, `2${SINGLE_RECEIPT.fragment.slice(1)}`, 'Tento kód je novější než stránka'],
        [
          { foundation: { companyIdentifier: '27278794' }, keys: 'none' },
          CHANGED_AMOUNT.fragment,
          'Neověřeno: seznam klíčů fondu teď nejde použít',
        ],
      ];
      for (const [keys, fragment, title] of refusals) {
        api.keys = keys;
        await scanAndCheck(page, heading, fragment, title);
      }
    });

    test('then every result without an answer, without a connection or with a failed check breaks no rule', async ({
      page,
      context,
    }) => {
      const heading = await openVerification(page, { keys: 503, status: 'active' });

      await scanAndCheck(page, heading, SINGLE_RECEIPT.fragment, 'Ověření teď nejde dokončit');

      await keepKeyListNow(page, LIST_WITHOUT_THE_KEY);
      await scanAndCheck(
        page,
        heading,
        YEARLY_RECEIPT.fragment,
        'Neověřeno: tento podpis zatím neumíme ověřit',
      );

      await context.setOffline(true);
      await scanFragment(page, SINGLE_RECEIPT.fragment);
      await expect(
        page.getByText(
          'Kód podepsal klíč, který tato stránka zatím nezná. Připojte se k internetu a zkuste to znovu.',
        ),
      ).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await keepKeyListNow(page, KEY_LIST);
      await scanFragment(page, YEARLY_RECEIPT.fragment);
      await expect(heading).toHaveText('Podepsáno fondem Nová naděje');
      await expect(
        page.getByText(
          'Bez připojení nelze zjistit, zda fond potvrzení později nenahradil novějším nebo nezrušil.',
        ),
      ).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await forgetKeyList(page);
      await scanAndCheck(page, heading, SINGLE_RECEIPT.fragment, 'Nelze ověřit bez připojení');

      await keepKeyListNow(page, KEY_LIST);
      await breakSha256(page);
      await scanAndCheck(page, heading, YEARLY_RECEIPT.fragment, 'Ověření se nepodařilo');
    });
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

  test('when they open the sign-in dialog without a connection, then what it says instead of the forms breaks no rule', async ({
    page,
    context,
  }) => {
    await openSignInDialog(page);
    await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
    await context.setOffline(true);
    await expect(
      page.getByRole('dialog').getByRole('heading', { level: 3, name: 'Jste offline' }),
    ).toBeVisible();

    expect(await violations(page)).toEqual([]);
    await context.setOffline(false);
  });

  test('when they open the sign-in dialog and its company registration, then nothing in it breaks the rules', async ({
    page,
  }) => {
    await openSignInDialog(page);
    expect(await violations(page)).toEqual([]);

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cizí počítač?' }).click();
    await expect(
      dialog.getByRole('checkbox', { name: 'Cizí počítač, nic neukládat' }),
    ).toBeFocused();
    expect(await violations(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Zpět', exact: true }).click();

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

  test('when the connection is gone, then the offline label, Přispět from the kept details, the send button that waits for the connection and the offline sheet break no rule', async ({
    page,
  }) => {
    await page.goto('/prispet');
    await expect(page.locator('#prispet .qr-code svg')).toBeVisible();
    await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
    await page.reload();
    const label = page.getByRole('button', { name: /^Offline/ });
    await expect(label).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#prispet .bank [role="note"]')).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('link', { name: 'O nás' }).first().click();
    await expect(page.getByRole('button', { name: /^Odeslat zprávu/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    expect(await violations(page)).toEqual([]);

    await label.click();
    await expect(page.getByRole('dialog', { name: 'Jste offline' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they send the contact form empty, then its error messages break no rule either', async ({
    page,
  }) => {
    await page.goto('/o-nas');
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

  test('when signing out the other devices fails and a signed-in donor then signs out one, then the device card with its alert and its status breaks no rule', async ({
    page,
  }) => {
    await mockDonorApi(page);
    let listed = signedInDevices;
    await page.route(
      (url) => url.pathname === '/api/donors/me/devices',
      async (route) => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill(
            problem(500, 'about:blank', 'Chyba serveru', 'Zkuste to prosím za chvíli znovu.'),
          );
          return;
        }
        await route.fulfill({ json: { items: listed } });
      },
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/donors/me/devices/'),
      async (route) => {
        listed = signedInDevices.filter((device) => device.current);
        await route.fulfill({ status: 204 });
      },
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    const devices = page.locator('.devices');
    await expect(devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' })).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await devices.getByRole('button', { name: 'Odhlásit všechna ostatní zařízení' }).click();
    await expect(devices.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click();
    await expect(devices.getByRole('status').filter({ hasText: /\S/ })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor opens the older sign-ins, then the device card with the folded and the opened rows breaks no rule', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donors/me/devices',
      (route) => route.fulfill({ json: { items: [...signedInDevices, ...longUnusedDevices] } }),
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    const older = page.locator('.devices').getByRole('button', { name: /Starší \(2\)/ });
    await expect(older).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await older.click();
    await expect(older).toHaveAttribute('aria-expanded', 'true');

    expect(await violations(page)).toEqual([]);
  });

  test('when the browser of a signed-in donor offers the app and they decline it, then the offer and the closing line break no rule', async ({
    page,
  }) => {
    await signIn(page);
    await page.evaluate(() => {
      const offer = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(offer, {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      });
      window.dispatchEvent(offer);
    });
    const offer = page.getByRole('region', { name: 'Nová naděje jako aplikace' });
    await expect(offer).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await offer.getByRole('button', { name: 'Teď ne' }).click();
    await expect(
      page.locator('p', { hasText: 'Dobře, nabídku na tři měsíce skryjeme.' }),
    ).toBeFocused();

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
            historyImport: null,
            defaultHistoryFrom: '2026-01-01',
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
    await serveAdministrationCopy(page, { donations: {}, donors: {} });
    await signIn(page, administrator);
    await page.getByRole('link', { name: 'Správa' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Správa' })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Od minulé návštěvy' })).toContainText(
      'Na tomto zařízení zatím není s čím porovnat.',
    );
    await expect(page.getByRole('region', { name: 'Co potřebuje vaši pozornost' })).toContainText(
      'Platby z banky se nestahují',
    );
    await expect(page.locator('.overview-table tbody tr')).toHaveCount(2);
    await expect(page.getByText('Zálohování je v pořádku.')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  for (const [name, run, expected] of [
    [
      'queued',
      { status: 'QUEUED', failure: null, finishedAt: null },
      'Fio přijímá jeden dotaz za 30 sekund.',
    ],
    [
      'locked',
      { status: 'HISTORY_LOCKED', failure: 'HISTORY_LOCKED', finishedAt: '2026-11-05T10:00:30Z' },
      'historie ve Fio byla zamčená',
    ],
  ] as const) {
    test(`when an administrator opens the administration with a ${name} run of older payments, then the part for older payments breaks no rule`, async ({
      page,
    }) => {
      await page.clock.install({ time: new Date('2026-11-05T10:00:05Z') });
      await page.route(
        (url) => url.pathname === '/api/admin/donations/import-state',
        (route) =>
          route.fulfill({
            json: {
              coveredFrom: '2026-08-08',
              coveredTo: '2026-11-05',
              lastAttemptedAt: '2026-11-05T09:00:00Z',
              lastSucceededAt: '2026-11-05T09:00:00Z',
              lastFailure: null,
              consecutiveFailures: 0,
              reportedOutage: null,
              historyImport: {
                from: '2026-01-01',
                to: '2026-11-05',
                needsUnlockedHistory: true,
                requestedAt: '2026-11-05T10:00:00Z',
                startsAt: '2026-11-05T10:00:20Z',
                added: null,
                ...run,
              },
              defaultHistoryFrom: '2026-01-01',
            },
          }),
      );
      await signIn(page, administrator);
      await page.getByRole('link', { name: 'Správa' }).click();
      const part = page.getByRole('region', { name: 'Starší platby z banky' });
      await expect(part).toContainText(expected);

      expect(await violations(page)).toEqual([]);
    });
  }

  test('when an administrator opens the administration on a phone, then its overview with the section rows and the page of further sections break no rule', async ({
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
            historyImport: null,
            defaultHistoryFrom: '2026-01-01',
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
    await page
      .getByRole('navigation', { name: 'Sekce správy' })
      .getByRole('link', { name: /Lidé fondu, správci, zálohy/ })
      .click();
    await expect(
      page
        .getByRole('navigation', { name: 'Další sekce správy' })
        .getByRole('link', { name: 'Zálohy' }),
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
              version: '0d7e5b2c84a1f936',
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

    await page.route(
      (url) => url.pathname === '/api/admin/donations/report/settings',
      (route) =>
        route.fulfill({
          status: 409,
          contentType: 'application/problem+json',
          json: {
            type: 'https://nfnn.cz/problems/donations/changed-meanwhile',
            title: 'Mezitím se to změnilo',
            detail: 'Nastavení mezitím změnil někdo jiný.',
            status: 409,
            version: '9e4b2d7c1a0f6358',
            current: { recipients: ['eva@example.cz'], changedAt: '2026-11-05T15:21:00Z' },
          },
        }),
    );
    await page.getByLabel('Příjemci').fill('pavel@example.cz');
    await page.getByRole('button', { name: 'Uložit nastavení' }).click();
    const sheet = page.getByRole('dialog', { name: 'Mezitím se to změnilo' });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Uložit svou verzi místo novější' }),
    ).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Mezitím se to změnilo' })).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator opens a sent monthly report, then its sendings break no rule', async ({
    page,
  }) => {
    await mockAdministration(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));

    await page.goto('/sprava/prehledy/2026-09');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Přehled za září 2026' }),
    ).toBeFocused();
    await expect(page.getByRole('heading', { level: 3, name: 'Banka' })).toHaveCount(2);

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
                version: '3f2a9c4e1b7d6085',
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

    await page.route(
      (url) => url.pathname.endsWith('/pair'),
      (route) =>
        route.fulfill({
          status: 409,
          contentType: 'application/problem+json',
          json: {
            type: 'https://nfnn.cz/problems/donations/changed-meanwhile',
            title: 'Mezitím se to změnilo',
            detail: 'Platbu mezitím změnil někdo jiný.',
            status: 409,
            version: '1b2c3d4e5f607182',
            current: { id: '019a1c00-0000-7000-8000-000000001001' },
          },
        }),
    );
    await page
      .getByRole('dialog')
      .getByRole('radio', { name: /Jana Nováková/ })
      .check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Přiřadit dárci Jana/ })
      .click();
    await expect(page.getByRole('dialog', { name: 'Mezitím se to změnilo' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator on a phone opens the payments, a paired payment, the history, the donors and a donor card part by part, then the rows, the sheet and the parts break no rule', async ({
    page,
  }) => {
    await mockDonorApi(page, donorWithDonations);
    await mockAdministration(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await rememberedSession(page);

    await page.goto('/sprava/platby?stav=prirazene');
    const row = page.locator('button.payment-row').first();
    await expect(row).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await row.click();
    const sheet = page.getByRole('dialog', { name: 'Přiřazená platba' });
    await expect(sheet).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(row).toBeFocused();

    await page.goto('/sprava/historie');
    await expect(page.locator('.action-rows > li').first()).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await serveRecentDonors(page);
    await page.goto('/sprava/darci');
    await expect(page.locator('.donor-rows a.ui-list__row').first()).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('searchbox', { name: 'Jméno, e-mail nebo variabilní symbol' }).fill('Svo');
    await expect(page.locator('.donor-rows a.ui-list__row').first()).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.goto(PETR_DETAIL_PATH);
    const parts = page.getByRole('navigation', { name: 'Části karty dárce' });
    await expect(parts.getByRole('link', { name: /^Dary/ })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await parts.getByRole('link', { name: /^Dary/ }).click();
    await expect(page).toHaveURL(new RegExp(`${PETR_DETAIL_PATH}/dary$`));
    await expect(page.getByRole('heading', { level: 2, name: 'Dary' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();
    await expect(page).toHaveURL(new RegExp(`${PETR_DETAIL_PATH}$`));
    await expect(parts).toBeVisible();

    await page.goto(`${PETR_DETAIL_PATH}/potvrzeni`);
    await expect(page.getByRole('heading', { level: 2, name: 'Potvrzení' })).toBeVisible();
    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();
    await expect(page).toHaveURL(new RegExp(`${PETR_DETAIL_PATH}$`));
    await expect(parts).toBeVisible();
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
    await expect(page.locator('.administrator-row')).toHaveCount(2);

    expect(await violations(page)).toEqual([]);

    await page
      .locator('.administrator-row')
      .nth(1)
      .getByRole('button', { name: 'Odebrat roli správce' })
      .click();
    await expect(page.locator('.administrator-row').nth(1)).toContainText('Odebrat roli správce?');
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

  test('when an administrator opens the bank logos and asks to remove one, then the page and the dialog break no rule', async ({
    page,
  }) => {
    await mockBankLogos(page, [{ code: '0800', imageId: LOGO_IMAGE_ID }]);
    await page.route(
      (url) => url.pathname === '/api/admin/donations/bank-logos',
      (route) =>
        route.fulfill({
          json: {
            items: [
              {
                code: '0800',
                bankName: 'Česká spořitelna, a.s.',
                sourceUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Purple/csas/512x512bb.jpg',
                sourceAllowed: true,
                version: '5e1c0a9f3b7d2486',
                imageId: LOGO_IMAGE_ID,
                imageSha256: 'a'.repeat(64),
                fetchedAt: '2026-11-11T04:50:03Z',
                checkedAt: '2026-11-11T04:50:03Z',
                lastFailure: null,
              },
              {
                code: '4000',
                bankName: null,
                sourceUrl: 'https://www.example.cz/logo.png',
                sourceAllowed: false,
                version: '2c3d4e5f60718293',
                imageId: null,
                imageSha256: null,
                fetchedAt: null,
                checkedAt: null,
                lastFailure: 'timeout',
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
    await page.goto('/sprava/loga-bank');
    await expect(page.getByRole('heading', { level: 1, name: 'Loga bank' })).toBeFocused();
    await expect(page.locator('[data-code]')).toHaveCount(2);

    expect(await violations(page)).toEqual([]);

    await page.locator('[data-code="0800"]').getByRole('button', { name: 'Odebrat' }).click();
    await expect(page.getByRole('dialog', { name: 'Odebrat logo banky 0800?' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator prints the yearly receipts in bulk, then the page, the list and the result break no rule', async ({
    page,
  }) => {
    await mockYearlyReceipts(page, { donors: FOUR_DONORS, erasedDonors: 1 });
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/hromadna-potvrzeni');
    await expect(page.getByRole('heading', { level: 1, name: 'Hromadná potvrzení' })).toBeFocused();
    await expect(page.locator('.donors-table tbody tr')).toHaveCount(4);

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Vystavit a připravit PDF k tisku' }).click();
    await expect(page.locator('app-live-notice').getByRole('status')).toHaveText(
      'PDF k tisku je připravené: obsahuje 3 potvrzení.',
    );

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
            yearlyReceiptsAvailableThrough: 2025,
            receiptsAvailableFrom: 2026,
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
                id: '019a1c00-0000-7000-8000-00000000f002',
                number: '2027-000001',
                kind: 'YEARLY',
                donationId: null,
                donationReceivedOn: null,
                year: 2026,
                issuedOn: '2027-01-15',
                issuedAt: '2027-01-15T09:00:00Z',
                locale: 'cs',
                active: true,
              },
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

    await page.getByRole('button', { name: 'Stáhnout PDF potvrzení 2027-000001' }).click();
    await expect(
      page
        .getByRole('region', { name: 'Vydaná potvrzení' })
        .getByRole('alert')
        .filter({ hasText: /\S/ }),
    ).toBeVisible();
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
    await expect(page.locator('.backup-key-word-list')).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Mám uloženo, ověřit' }).click();
    await page.getByRole('button', { name: 'Potvrdit uložení' }).click();
    await expect(page.locator('#backup-key-word-2-error')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: /^Nejnovější záloha/ }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Obnovit web z této zálohy…' }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Obnovit databázi ze zálohy?' }),
    ).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: 'Zrušit' }).click();

    await page.getByRole('button', { name: 'Zálohovat teď' }).click();
    await expect(page.getByRole('button', { name: 'Zálohujeme…' })).toBeDisabled();
    expect(await violations(page)).toEqual([]);

    await page.goto('/sprava/zalohy/historie');
    await expect(page.getByRole('heading', { level: 1, name: 'Všechny zálohy' })).toBeFocused();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: /^3:00/ }).first().click();
    await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('when the installed app offers an administrator to turn the alerts on, then the sheet and its outcome break no rule', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }),
    );
    await fakePushDevice(page, { permission: 'default', permissionAnswer: 'granted' });
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname.startsWith('/api/admin/operations/push'),
      (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/subscriptions')) {
          return route.fulfill({
            status: 201,
            json: {
              id: 'push-this-phone',
              service: 'apple',
              alerts: { bankImport: true, backups: true, mail: true },
              createdAt: '2026-11-10T09:00:00Z',
              lastDeliveredAt: null,
              failuresInARow: 0,
              current: true,
            },
          });
        }
        if (path.endsWith('/test')) {
          return route.fulfill({ json: { delivered: 1, failed: 0, removed: 0 } });
        }
        return route.fulfill({
          json: {
            publicKey: `B${'E'.repeat(86)}`,
            deviceSession: true,
            subscriptions: [],
            openAlerts: [],
          },
        });
      },
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session-app', '1'));
    await page.goto('/sprava/vice');

    const offer = page.getByRole('dialog', { name: 'Zapnout upozornění?' });
    await expect(offer).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await offer.getByRole('button', { name: 'Zapnout' }).click();
    await expect(page.getByRole('dialog', { name: 'Upozornění jsou zapnutá' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator manages the alerts of their devices, then the page with this device subscribed and another listed breaks no rule', async ({
    page,
  }) => {
    await fakePushDevice(page, { subscribedWith: `B${'E'.repeat(86)}` });
    await mockDonorApi(page);
    const device = {
      service: 'google',
      alerts: { bankImport: true, backups: true, mail: true },
      createdAt: '2026-11-01T09:00:00Z',
      lastDeliveredAt: '2026-11-03T09:05:00Z',
      failuresInARow: 0,
    };
    await page.route(
      (url) => url.pathname === '/api/admin/operations/push',
      (route) =>
        route.fulfill({
          json: {
            publicKey: `B${'E'.repeat(86)}`,
            deviceSession: true,
            subscriptions: [
              { ...device, id: 'push-phone', service: 'apple', current: false, failuresInARow: 2 },
              { ...device, id: 'push-this-device', current: true },
            ],
            openAlerts: [{ area: 'backups', since: '2026-11-04T05:15:00Z' }],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/push/test',
      (route) => route.fulfill({ json: { delivered: 2, failed: 0, removed: 0 } }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/upozorneni');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Upozornění', exact: true }),
    ).toBeFocused();
    await expect(page.getByRole('switch')).toHaveCount(3);
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: /^Apple, zapnuto/ }).click();
    const sheet = page.getByRole('dialog', { name: /^Apple, zapnuto/ });
    await expect(sheet.getByRole('switch')).toHaveCount(3);
    expect(await violations(page)).toEqual([]);
    await sheet.press('Escape');
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: 'Poslat zkušební upozornění' }).click();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      /^Zkušební upozornění jsme předali k doručení na 2 zařízení\./,
    );
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
    await expect(page.locator('.backup-key-word-list')).toBeVisible();
    await page.getByRole('button', { name: 'Mám uloženo, ověřit' }).click();
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
      (url) => url.pathname === '/api/admin/donations/receipt-signatory',
      (route) =>
        route.fulfill({
          json: {
            ...signatory({ portrait: true, signature: true }),
            signatures: [
              {
                personId: SIGNATORY_ID,
                kind: 'VECTOR',
                width: 1200,
                height: 400,
                uploadedAt: '2026-10-23T19:30:00Z',
              },
            ],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === `/api/admin/donations/receipt-signatures/${SIGNATORY_ID}`,
      (route) => route.fulfill({ json: vectorSignature }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/content/people',
      (route) =>
        route.fulfill({
          json: {
            members: [
              {
                id: SIGNATORY_ID,
                name: 'Petr Vzorový',
                role: null,
                position: 0,
                onBoard: true,
                boardNote: null,
                featured: false,
                portrait: {
                  id: '0199f3e0-0000-7000-8000-00000000c101',
                  url: '/api/content/media/0199f3e0-0000-7000-8000-00000000c101',
                  width: 640,
                  height: 640,
                },
                webSignature: null,
                personalEmail: null,
                fundEmail: null,
              },
            ],
            note: null,
          },
        }),
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

    await expect(page.getByRole('figure', { name: 'Náhled podpisu na potvrzení' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('when nobody signs the receipts, then the red row on the home page and the warning in the settings break no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/donations/receipt-signatory',
      (route) => route.fulfill({ json: noSignatory }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava');
    await expect(page.locator('.attention-signatory')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.goto('/sprava/nastaveni');
    await expect(page.getByRole('heading', { level: 1, name: 'Nastavení' })).toBeFocused();
    await expect(page.locator('.signatory-missing')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator sees a vector receipt signature of a person and an SVG is refused, then the people page breaks no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/content/people',
      (route) =>
        route.fulfill({
          json: {
            members: [
              {
                id: SIGNATORY_ID,
                name: 'Petr Vzorový',
                role: null,
                position: 0,
                onBoard: true,
                boardNote: null,
                featured: false,
                portrait: null,
                webSignature: null,
                personalEmail: null,
                fundEmail: null,
              },
            ],
            note: null,
          },
        }),
    );
    await page.route(
      (url) => url.pathname === `/api/admin/donations/receipt-signatures/${SIGNATORY_ID}`,
      (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({
              status: 400,
              contentType: 'application/problem+json',
              body: JSON.stringify(refusedVector),
            })
          : route.fulfill({ json: vectorSignature }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/donations/receipt-signatory',
      (route) =>
        route.fulfill({
          json: {
            ...signatory({ signature: true }),
            signatures: [
              {
                personId: SIGNATORY_ID,
                kind: 'VECTOR',
                width: 300,
                height: 100,
                uploadedAt: '2026-10-23T19:30:00Z',
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
    await page.goto('/sprava/lide-fondu');
    await expect(
      page
        .locator('.ui-person-list')
        .getByRole('img', { name: 'Podpis na potvrzení: Petr Vzorový' }),
    ).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Upravit: Petr Vzorový' }).click();
    const card = page.locator('app-receipt-signature');
    await expect(card.getByRole('img', { name: 'Nahraný podpis' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await card.getByRole('button', { name: 'Odebrat podpis z potvrzení' }).click();
    await expect(card.getByRole('group', { name: 'Odebrat podpis z potvrzení?' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await card.getByRole('button', { name: 'Zrušit' }).click();

    await card.getByLabel('Nahrát jiný podpis na potvrzení').setInputFiles({
      name: 'podpis.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg/>'),
    });
    await expect(card.getByRole('alert').filter({ hasText: /\S/ })).toContainText(
      'nepovolený prvek',
    );
    expect(await violations(page)).toEqual([]);
  });

  test('when the receipt signing key of the server is not published, then the red row on the home page and the alert on the key card break no rule', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/donations/receipt-signing-keys',
      (route) =>
        route.fulfill({
          json: {
            currentKeyId: '21fe31df',
            currentKeyPublished: false,
            keys: [],
            auditMismatches: [],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava');
    await expect(page.locator('.attention-signing-key')).toContainText(
      'Klíč 21fe31df není zveřejněný',
    );
    expect(await violations(page)).toEqual([]);

    await page.goto('/sprava/nastaveni');
    const card = page.getByRole('region', { name: 'Klíč k ověřovacím QR kódům' });
    await expect(card.getByRole('alert').filter({ hasText: /\S/ })).toContainText(
      'Klíč 21fe31df není zveřejněný',
    );
    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator withdraws the receipt signing key of the server, then the dialog and the line that waits for the restart break no rule', async ({
    page,
  }) => {
    const withdrawn = {
      ...receiptSigningKeys,
      keys: receiptSigningKeys.keys.map((key) => ({ ...key, status: 'revoked' })),
      restarting: true,
    };
    await page.route(
      (url) => url.pathname === '/api/admin/donations/receipt-signing-keys/21fe31df/withdrawal',
      (route) => route.fulfill({ json: withdrawn }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/nastaveni');
    await page.getByRole('button', { name: 'Zneplatnit klíč serveru…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Zneplatnit klíč 21fe31df?' });
    await expect(dialog).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await dialog.getByRole('button', { name: 'Zneplatnit klíč', exact: true }).click();
    await expect(dialog.getByText('Opište prosím kód z aplikace.')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await dialog.getByLabel('Kód z aplikace').fill('123456');
    await dialog.getByRole('button', { name: 'Zneplatnit klíč', exact: true }).click();
    const card = page.getByRole('region', { name: 'Klíč k ověřovacím QR kódům' });
    await expect(card.getByRole('status').filter({ hasText: /\S/ })).toContainText(
      'Web se restartuje',
    );
    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator walks the logs hub, a file, its search, the levels, the server state and the thread dump, then no page breaks a rule', async ({
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
    await expect(page.getByRole('link', { name: /Bez poruchy/ })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.goto('/sprava/logy/soubory');
    await expect(page.getByRole('heading', { level: 2, name: 'Aplikace' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.goto('/sprava/logy/soubor?nazev=backend.log');
    await expect(page.locator('.entry').first()).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.getByLabel('Hledat v souboru').fill('fio');
    await page.getByRole('button', { name: 'Hledat', exact: true }).click();
    await expect(page.locator('.entry')).toHaveCount(2);
    await page.locator('.entry').first().click();
    await expect(page.getByRole('dialog', { name: 'Chyba v 10:00:38' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.goto('/sprava/logy/urovne');
    await page.getByRole('button', { name: 'Jiný logger…' }).click();
    await page.getByLabel('Logger', { exact: true }).fill('not a logger!');
    await page.getByRole('button', { name: 'Nastavit na 30 min' }).click();
    await expect(page.getByLabel('Logger', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(await violations(page)).toEqual([]);

    await page.goto('/sprava/logy/stav');
    await expect(page.getByRole('heading', { level: 2, name: 'Bez poruchy' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.goto('/sprava/logy/vlakna');
    await expect(page.locator('.dump')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator sets the About photo and the About page shows it, then the page, its removal confirmation and the section break no rule', async ({
    page,
  }) => {
    const photoId = '0199f3e0-0000-7000-8000-00000000b001';
    const photo = {
      id: photoId,
      url: `/api/content/media/${photoId}`,
      width: 1413,
      height: 1884,
      alt: 'Malý chlapec v náručí dvou dospělých',
      caption: 'Kde to všechno začalo',
    };
    await page.route(
      (url) => url.pathname === '/api/admin/content/about',
      (route) => route.fulfill({ json: { photo } }),
    );
    await page.route(
      (url) => url.pathname === '/api/content/home',
      (route) => route.fulfill({ json: { news: [], projects: [], about: { photo } } }),
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
    await page.goto('/o-nas');
    await page.locator('#o-nas figcaption').scrollIntoViewIfNeeded();
    await expect(page.locator('#o-nas figcaption')).toHaveText('Kde to všechno začalo');

    expect(await violations(page)).toEqual([]);

    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/o-nas');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Fotka v sekci O nás' }),
    ).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Fotka, klepnutím nastavíte bod výřezu' }),
    ).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Odebrat fotku z webu' }).click();
    await expect(page.getByRole('group', { name: 'Odebrat fotku?' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator sets the photo of the Přispět band and the About page ends with it, then the band, the page and its removal confirmation break no rule', async ({
    page,
  }) => {
    const photoId = '0199f3e0-0000-7000-8000-00000000b101';
    const photo = {
      id: photoId,
      url: `/api/content/media/${photoId}`,
      width: 1600,
      height: 1067,
      alt: 'Usměvavá dívka na zahradě',
      focalPoint: null,
    };
    await page.route(
      (url) => url.pathname === '/api/admin/content/donate-band',
      (route) => route.fulfill({ json: { photo } }),
    );
    await page.route(
      (url) => url.pathname === '/api/content/home',
      (route) => route.fulfill({ json: { news: [], projects: [], donateBand: { photo } } }),
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
    await page.goto('/o-nas');
    const band = page.getByRole('region', { name: 'Pomozte nám napsat další příběh' });
    await band.scrollIntoViewIfNeeded();
    await expect(band.getByRole('img', { name: 'Usměvavá dívka na zahradě' })).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/pruh-prispet');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Fotka v pruhu Přispět' }),
    ).toBeFocused();
    await expect(page.locator('figure.preview figcaption')).toHaveText([
      'Na počítači',
      'Na telefonu',
    ]);

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Odebrat fotku z webu' }).click();
    await expect(page.getByRole('group', { name: 'Odebrat fotku?' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when an administrator keeps the people of the foundation and the About page shows them, then the section, the page, the editor and the removal confirmation break no rule', async ({
    page,
  }) => {
    const personId = '0199f3e0-0000-7000-8000-00000000c001';
    const portraitId = '0199f3e0-0000-7000-8000-00000000c101';
    const signatureId = '0199f3e0-0000-7000-8000-00000000c201';
    const image = (id: string, width: number, height: number) => ({
      id,
      url: `/api/content/media/${id}`,
      width,
      height,
    });
    await page.route(
      (url) => url.pathname === '/api/admin/content/people',
      (route) =>
        route.fulfill({
          json: {
            members: [
              {
                id: personId,
                name: 'Eva Vzorová',
                role: 'Zakladatelka',
                position: 0,
                onBoard: true,
                boardNote: 'předsedkyně',
                featured: true,
                portrait: image(portraitId, 640, 640),
                webSignature: image(signatureId, 600, 180),
                personalEmail: 'eva@example.org',
                fundEmail: 'eva@nfnn.cz',
              },
            ],
            note: 'Děkujeme všem, kdo pomáhají s námi.',
          },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/content/home',
      (route) =>
        route.fulfill({
          json: {
            news: [],
            projects: [],
            about: { photo: null },
            people: {
              featured: [
                {
                  name: 'Eva Vzorová',
                  role: 'Zakladatelka',
                  portrait: image(portraitId, 640, 640),
                },
                { name: 'Adam Vzor', role: null, portrait: null },
              ],
              board: [{ name: 'Eva Vzorová', note: 'předsedkyně' }],
              note: {
                text: 'Děkujeme všem, kdo pomáhají s námi.',
                signatures: [{ ...image(signatureId, 600, 180), name: 'Eva Vzorová' }],
              },
            },
          },
        }),
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
    await page.goto('/o-nas');
    await expect(page.locator('#o-nas .signer-name')).toHaveText(['Eva Vzorová']);
    await page.locator('#o-nas .signers').scrollIntoViewIfNeeded();

    expect(await violations(page)).toEqual([]);

    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/lide-fondu');
    await expect(page.getByRole('heading', { level: 1, name: 'Lidé fondu' })).toBeFocused();
    await expect(page.locator('.person-name')).toHaveText('Eva Vzorová');

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Upravit: Eva Vzorová' }).click();
    await expect(page.getByLabel('E-mail ve fondu (nepovinné)')).toHaveValue('eva@nfnn.cz');
    await page.getByLabel('Osobní e-mail (nepovinné)').fill('eva');
    await page.getByRole('button', { name: 'Uložit a ukázat na webu' }).click();
    await expect(page.getByText('Zadejte e-mail ve tvaru jana@example.cz.')).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('checkbox', { name: 'Podepisuje potvrzení' }).check();
    await expect(page.getByLabel('Funkce na potvrzení')).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Odebrat osobu z webu' }).click();
    await expect(page.getByRole('group', { name: 'Odebrat osobu?' })).toBeVisible();

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
    await expect(
      page.getByRole('button', { name: 'Fotka, klepnutím nastavíte bod výřezu' }),
    ).toBeVisible();
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
      (url) => url.pathname === '/api/admin/content/project-order',
      (route) => route.fulfill({ json: { order: 'YEAR_THEN_CATEGORY' } }),
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
    await expect(page.getByRole('heading', { level: 1, name: 'Pomáháme' })).toBeFocused();
    await expect(page.locator('tbody tr')).toHaveCount(3);
    await expect(page.getByRole('radio', { name: 'Podle roku', exact: true })).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.goto('/sprava/projekty/nova');
    await expect(page.getByRole('heading', { level: 1, name: 'Nový příběh' })).toBeFocused();
    await page.getByLabel('Rok').fill('2004');
    await page.getByRole('button', { name: 'Uložit koncept' }).click();
    await expect(page.getByLabel('Titulek')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Rok')).toHaveAttribute('aria-invalid', 'true');

    expect(await violations(page)).toEqual([]);

    await page.goto(`/sprava/projekty/${projectId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Úprava příběhu' })).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Fotka, klepnutím nastavíte bod výřezu' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Náhled', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Stránka příběhu' })).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Upravit', exact: true }).click();
    await page.getByRole('button', { name: 'Smazat příběh' }).click();
    await expect(page.getByRole('group', { name: 'Smazat příběh?' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor waits for a receipt PDF, then its progress line, bar and cancel button break no rule', async ({
    page,
  }) => {
    await mockDonorApi(page, receiptDonations);
    await page.clock.install();
    await page.route(
      (url) => url.pathname === RECEIPT_ISSUING_URL,
      () => new Promise<void>(() => undefined),
    );
    await openReceiptsAfterSignIn(page);
    await yearlyButton(page).click();
    await expect(yearlyLine(page)).toHaveText('Připravujeme údaje potvrzení…');
    await page.clock.fastForward(8000);
    await expect(page.getByRole('button', { name: 'Zrušit' })).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor on an iPhone has a receipt PDF ready for the second tap, then it breaks no rule', async ({
    page,
  }) => {
    await pretendIphoneThatShares(page);
    await mockDonorApi(page, receiptDonations);
    await page.route(
      (url) => url.pathname === RECEIPT_ISSUING_URL,
      (route) => answerReceiptIssuing(route, ISSUING),
    );
    await openReceiptsAfterSignIn(page);
    await yearlyButton(page).click();
    await expect(page.getByRole('button', { name: 'Otevřít potvrzení' })).toBeVisible();

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

  test('when a signed-in donor reads the data on this device, loads them again and opens the deletion, then the card and its dialog break no rule', async ({
    page,
  }) => {
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();
    await page.getByRole('button', { name: 'Načíst data znovu' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Data jsou načtená znovu.' }),
    ).toBeVisible();

    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Smazat data z tohoto zařízení' }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Smazat data z tohoto zařízení?' }),
    ).toBeFocused();

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
    await page.goto('/o-nas');
    const signInButton = page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' });
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

    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(360);
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
    await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();

    const panel = page.locator('.dialog-panel');
    await expect(panel).toBeVisible();
    expect((await panel.boundingBox())?.width).toBe(390);
    expect(await violations(page)).toEqual([]);
  });
});

test.describe('Given an administrator whose administration is locked on this device', () => {
  test.use({ unlocksAdministration: false });

  test('when the lock panel and its password view are shown, at 390 and 1280 px, then they break no rule', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/sprava');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Správa je zamčená' }),
      ).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.getByRole('button', { name: 'Použít heslo' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Odemknout heslem' })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    }
  });
});

test.describe('Given a donor whose unsaved edit of the data on the receipt is kept on this device', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, noDonations);
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Upravit údaje' }).click();
    await page.getByLabel('Ulice a číslo').fill('Krátká 3');
    await expect.poll(async () => (await rawDevice(page)).drafts).toBe(1);
  });

  test('when the page is loaded again and the edit is offered back, then the offer has no violations', async ({
    page,
  }) => {
    await page.reload();

    await expect(page.locator('app-draft-offer')).toContainText('Máte tu rozepsané úpravy');
    expect(await violations(page)).toEqual([]);
  });

  test('when the data were saved differently since and she saves the edit she continued, then the warning in the form has no violations', async ({
    page,
  }) => {
    await page.unroute('**/api/donors/auth/refresh');
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, { ...donor, address: { ...donor.address, city: 'Děčín' } })),
    );
    await page.reload();
    const offer = page.locator('app-draft-offer');
    await expect(offer).toContainText('Uložená verze se od té doby změnila');
    await offer.getByRole('button', { name: 'Pokračovat v rozepsaném' }).click();

    await page.getByRole('button', { name: 'Uložit údaje' }).click();

    await expect(page.locator('.profile-stale')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});
