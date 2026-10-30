import { Locator, Page } from '@playwright/test';
import {
  connectionRequest,
  donor,
  mockConnectApi,
  mockDonorApi,
  openSignInDialog,
  problem,
  secondFactorEnrolment,
  secondFactorRecovery,
  secondFactorRequired,
  session,
} from '../donor-session';
import { expect, test } from '../fixtures';
import {
  article,
  donorWithDonations,
  failPaymentQr,
  FIXED_TIME,
  mockAdministration,
  mockPublicContent,
  noDonations,
  PETR_DETAIL_PATH,
  project,
  rememberedSession,
  servePaymentQrCases,
} from './screen-mocks';

interface ElementShot {
  name: string;
  selector: string;
}

interface Screen {
  name: string;
  open: (page: Page, width: number) => Promise<void>;
  viewportOnly?: boolean;
  region?: string;
  elements?: ElementShot[];
  masked?: string[];
  ready?: (page: Page) => Promise<void>;
}

const WIDTHS = [390, 1280];
const HEIGHT = 900;
const DIALOG_OPENING_WIDTH = 1280;
const SEARCH_PAUSE_MS = 5_000;
const PAGE_TOLERANCE = { maxDiffPixelRatio: 0.002 };
const ELEMENT_TOLERANCE = { maxDiffPixels: 0 };
const FIXED_BARS_HIDDEN =
  '.skip-link, app-site-header, app-site-header *, app-dashboard-top-bar, app-dashboard-top-bar * { visibility: hidden !important; }';
const DONATE_QR = '#prispet .qr-code';
const DONATE_BANK = '#prispet .bank';
const SEND_GIFT_QR = '.send-gift .qr-code';
const SEND_GIFT_BANK = '.send-gift .bank';

function element(name: string, selector: string): ElementShot {
  return { name, selector };
}

function publicPage(name: string, path: string, more: Partial<Screen> = {}): Screen {
  return {
    name,
    open: async (page) => {
      await mockDonorApi(page);
      await mockPublicContent(page);
      await page.goto(path);
    },
    ...more,
  };
}

function donorPage(name: string, path: string, donations = donorWithDonations): Screen {
  return {
    name,
    open: async (page) => {
      await mockDonorApi(page, donations);
      await rememberedSession(page, donor);
      await page.goto(path);
    },
  };
}

async function openDonateSection(page: Page, signedIn = false): Promise<void> {
  await mockDonorApi(page);
  await mockPublicContent(page);
  await servePaymentQrCases(page);
  if (signedIn) {
    await rememberedSession(page, donor);
  }
  await page.goto('/');
  await expect(page.locator(DONATE_QR).getByRole('img')).toBeVisible();
}

async function elementsShown(page: Page, elements: string[]): Promise<void> {
  for (const selector of elements) {
    await expect(page.locator(selector)).toBeVisible();
  }
}

function adminPage(name: string, path: string, more: Partial<Screen> = {}): Screen {
  return {
    name,
    open: async (page) => {
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await rememberedSession(page);
      await page.goto(path);
    },
    ...more,
  };
}

async function openDialogAt(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width: DIALOG_OPENING_WIDTH, height: HEIGHT });
  await openSignInDialog(page);
  await page.setViewportSize({ width, height: HEIGHT });
}

const SCREENS: Screen[] = [
  publicPage('home', '/', {
    elements: [element('home--donate-qr', DONATE_QR), element('home--donate-bank', DONATE_BANK)],
  }),
  publicPage('news', '/aktuality'),
  publicPage('news-article', `/aktuality/${article.slug}`),
  publicPage('projects', '/projekty'),
  publicPage('project', `/projekty/${project.slug}`),
  publicPage('privacy-policy', '/zasady-ochrany-osobnich-udaju'),
  publicPage('not-found', '/neexistuje'),
  publicPage('password-reset-without-link', '/obnova-hesla'),
  publicPage('email-verification-without-link', '/potvrzeni-emailu'),
  publicPage('password-reset-with-link', '/obnova-hesla#token=abc'),
  {
    name: 'email-verification-with-link',
    open: async (page) => {
      await mockDonorApi(page);
      await page.route('**/api/donors/auth/email-verification/confirm', (route) =>
        route.fulfill(session(200)),
      );
      await page.goto('/potvrzeni-emailu#token=abc');
      await expect(page.getByRole('heading', { name: 'E-mail je potvrzený' })).toBeVisible();
    },
  },
  {
    name: 'connect-app-signed-out',
    open: async (page) => {
      await mockDonorApi(page);
      await mockConnectApi(page);
      await page.goto(connectionRequest);
    },
  },
  {
    name: 'connect-app-signed-in',
    open: async (page) => {
      await mockDonorApi(page);
      await mockConnectApi(page);
      await rememberedSession(page);
      await page.goto(connectionRequest);
      await expect(page.getByLabel('Kód z aplikace')).toBeVisible();
    },
  },
  {
    name: 'first-setup',
    open: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/operations/setup',
        (route) => route.fulfill({ json: { required: true, codeRequired: true } }),
      );
      await page.goto('/prvni-nastaveni');
    },
  },
  {
    name: 'sign-in-dialog',
    viewportOnly: true,
    open: async (page, width) => {
      await mockDonorApi(page);
      await openDialogAt(page, width);
    },
  },
  {
    name: 'registration-dialog',
    viewportOnly: true,
    open: async (page, width) => {
      await mockDonorApi(page);
      await openDialogAt(page, width);
      await page.getByRole('dialog').getByRole('button', { name: 'Registrace' }).click();
      await expect(page.getByRole('dialog').locator('#register-name')).toBeVisible();
    },
  },
  {
    name: 'sign-in-second-factor',
    viewportOnly: true,
    open: async (page, width) => {
      await mockDonorApi(page);
      await page.route('**/api/donors/auth/login', (route) =>
        route.fulfill(secondFactorRequired()),
      );
      await openDialogAt(page, width);
      await page.locator('#login-email').fill('jana@example.cz');
      await page.locator('#login-password').fill('correct horse battery');
      await page.getByRole('dialog').locator('.ui-button--block').click();
      await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    },
  },
  donorPage('donor-overview', '/darce/prehled'),
  donorPage('donor-overview-empty', '/darce/prehled', noDonations),
  {
    name: 'donor-overview-error',
    open: async (page) => {
      await mockDonorApi(page, donorWithDonations);
      await page.route(
        (url) => url.pathname === '/api/donations/me/summary',
        (route) =>
          route.fulfill(problem(500, 'server-error', 'Chyba serveru', 'Zkuste to prosím znovu.')),
      );
      await rememberedSession(page, donor);
      await page.goto('/darce/prehled');
    },
    ready: async (page) => {
      await expect(page.getByRole('alert').filter({ hasText: /\S/ }).first()).toBeVisible();
    },
  },
  donorPage('donor-donations', '/darce/dary'),
  donorPage('donor-receipts', '/darce/potvrzeni'),
  donorPage('donor-bank-accounts', '/darce/ucty'),
  donorPage('donor-details', '/darce/udaje'),
  adminPage('admin-home', '/sprava'),
  adminPage('admin-payments', '/sprava/platby'),
  {
    name: 'admin-payments-error',
    open: async (page) => {
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await page.route(
        (url) => url.pathname === '/api/admin/donations/payments',
        (route) =>
          route.fulfill(problem(500, 'server-error', 'Chyba serveru', 'Zkuste to prosím znovu.')),
      );
      await rememberedSession(page);
      await page.goto('/sprava/platby');
    },
  },
  adminPage('admin-donors', '/sprava/darci'),
  {
    name: 'admin-donors-search',
    open: async (page, width) => {
      await adminPage('admin-donors', '/sprava/darci').open(page, width);
      await page.locator('#donor-search').fill('Nov');
      await page.clock.setFixedTime(new Date(FIXED_TIME.getTime() + SEARCH_PAUSE_MS));
      await expect(page.getByText('Petr Svoboda').first()).toBeVisible();
    },
  },
  adminPage('admin-donor-detail', PETR_DETAIL_PATH),
  adminPage('admin-administrators', '/sprava/spravci'),
  adminPage('admin-older-symbols', '/sprava/starsi-symboly', {
    ready: async (page) => {
      await expect(page.getByText('6123456789').first()).toBeVisible();
    },
  }),
  adminPage('admin-reports', '/sprava/prehledy'),
  adminPage('admin-news', '/sprava/aktuality'),
  adminPage('admin-news-new', '/sprava/aktuality/nova'),
  adminPage('admin-news-edit', `/sprava/aktuality/${article.id}`),
  adminPage('admin-projects', '/sprava/projekty'),
  adminPage('admin-projects-new', '/sprava/projekty/nova'),
  adminPage('admin-projects-edit', `/sprava/projekty/${project.id}`),
  adminPage('admin-backups', '/sprava/zalohy'),
  adminPage('admin-logs', '/sprava/logy'),
  adminPage('admin-settings', '/sprava/nastaveni'),
  adminPage('admin-history', '/sprava/historie'),
  {
    name: 'home-donate-1000',
    region: '#prispet',
    elements: [
      element('home-donate-1000--qr', DONATE_QR),
      element('home-donate-1000--bank', DONATE_BANK),
    ],
    open: async (page) => {
      await openDonateSection(page);
      await page.getByRole('button', { name: '1 000 Kč' }).click();
      await expect(page.locator(DONATE_BANK)).toContainText('1 000 Kč');
    },
    ready: (page) => elementsShown(page, [DONATE_QR, DONATE_BANK]),
  },
  {
    name: 'home-donate-own-amount',
    region: '#prispet',
    elements: [
      element('home-donate-own-amount--qr', DONATE_QR),
      element('home-donate-own-amount--bank', DONATE_BANK),
    ],
    open: async (page) => {
      await openDonateSection(page);
      await page.getByRole('button', { name: 'Jiná částka' }).click();
      await page.locator('#donate-custom-amount').fill('1 234');
      await expect(page.locator(DONATE_BANK)).toContainText('1 234 Kč');
    },
    ready: (page) => elementsShown(page, [DONATE_QR, DONATE_BANK]),
  },
  {
    name: 'home-donate-signed-in',
    region: '#prispet',
    elements: [
      element('home-donate-signed-in--qr', DONATE_QR),
      element('home-donate-signed-in--bank', DONATE_BANK),
    ],
    open: async (page) => {
      await openDonateSection(page, true);
      await expect(page.locator(DONATE_BANK)).toContainText(donor.variableSymbol);
    },
    ready: (page) => elementsShown(page, [DONATE_QR, DONATE_BANK]),
  },
  {
    name: 'home-donate-qr-error',
    region: '#prispet',
    elements: [element('home-donate-qr-error--qr', '#prispet .qr')],
    open: async (page) => {
      await mockDonorApi(page);
      await mockPublicContent(page);
      await failPaymentQr(page);
      await page.goto('/');
      await expect(page.locator('#prispet .qr-error')).toBeVisible();
    },
    ready: (page) => elementsShown(page, ['#prispet .qr']),
  },
  {
    name: 'donor-details-second-factor-setup',
    elements: [element('donor-details-second-factor-setup--qr', '.account-qr')],
    open: async (page) => {
      await mockDonorApi(page, donorWithDonations);
      await page.route('**/api/donors/me/second-factor/setup', (route) =>
        route.fulfill({ json: secondFactorEnrolment }),
      );
      await rememberedSession(page, donor);
      await page.goto('/darce/udaje');
      await page.getByRole('button', { name: 'Zapnout dvoufaktorové ověření' }).click();
      await page.getByLabel('Současné heslo').fill('correct horse battery');
      await page.getByRole('button', { name: 'Pokračovat' }).click();
      await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    },
    ready: (page) => elementsShown(page, ['.account-qr']),
  },
  {
    name: 'donor-bank-accounts-add',
    viewportOnly: true,
    masked: ['.add-account-text', '.add-account-watch .watch-detail'],
    elements: [
      element('donor-bank-accounts-add--qr', '.add-account-qr'),
      element('donor-bank-accounts-add--bank', '.add-account-bank'),
    ],
    open: async (page) => {
      await mockDonorApi(page, donorWithDonations);
      await servePaymentQrCases(page);
      await rememberedSession(page, donor);
      await page.goto('/darce/ucty');
      await page.getByRole('button', { name: 'Přidat účet' }).click();
      await expect(
        page.getByRole('dialog').locator('.add-account-qr').getByRole('img'),
      ).toBeVisible();
    },
    ready: (page) => elementsShown(page, ['.add-account-qr', '.add-account-bank']),
  },
  {
    name: 'sign-in-recovery-payment',
    viewportOnly: true,
    elements: [
      element('sign-in-recovery-payment--qr', '.recovery-qr'),
      element('sign-in-recovery-payment--details', '.recovery-details'),
    ],
    open: async (page, width) => {
      await mockDonorApi(page);
      await page.route('**/api/donors/auth/login', (route) =>
        route.fulfill(secondFactorRequired()),
      );
      await page.route('**/api/donors/auth/login/second-factor/recovery', (route) =>
        route.fulfill({ json: secondFactorRecovery }),
      );
      await openDialogAt(page, width);
      await page.locator('#login-email').fill('jana@example.cz');
      await page.locator('#login-password').fill('correct horse battery');
      await page.getByRole('dialog').locator('.ui-button--block').click();
      await page.getByRole('button', { name: 'Obnovit přístup platbou' }).click();
      await expect(
        page.getByRole('dialog').getByRole('heading', { name: 'Obnova přístupu platbou' }),
      ).toBeFocused();
    },
    ready: (page) => elementsShown(page, ['.recovery-qr', '.recovery-details']),
  },
];

const SCREENS_SINCE_V2: Screen[] = [
  {
    name: 'donor-overview-send-gift',
    region: '.send-gift',
    elements: [
      element('donor-overview-send-gift--qr', SEND_GIFT_QR),
      element('donor-overview-send-gift--bank', SEND_GIFT_BANK),
    ],
    open: async (page) => {
      await mockDonorApi(page, donorWithDonations);
      await servePaymentQrCases(page);
      await rememberedSession(page, donor);
      await page.goto('/darce/prehled');
      await expect(page.locator(SEND_GIFT_BANK)).toContainText(donor.variableSymbol);
    },
    ready: (page) => elementsShown(page, [SEND_GIFT_QR, SEND_GIFT_BANK]),
  },
];

async function settle(page: Page, screen: Screen): Promise<void> {
  await expect(page.locator('h1').first()).toBeVisible();
  if (screen.ready) {
    await screen.ready(page);
  } else {
    await page.waitForLoadState('networkidle');
  }
  await page.evaluate(async () => {
    document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((image) => {
      image.loading = 'eager';
    });
    await Promise.all(
      Array.from(document.images)
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            }),
        ),
    );
    await document.fonts.ready;
  });
}

async function shootElement(
  target: Locator,
  file: string,
  tolerance: { maxDiffPixels?: number; maxDiffPixelRatio?: number },
): Promise<void> {
  await expect(target).toHaveScreenshot(file, {
    animations: 'disabled',
    caret: 'hide',
    ...tolerance,
  });
}

function shootEach(screens: Screen[]): void {
  for (const screen of screens) {
    for (const width of WIDTHS) {
      test(`when ${screen.name} is shown ${width} px wide, then it looks as recorded`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: HEIGHT });
        await screen.open(page, width);
        await settle(page, screen);

        if (!screen.region) {
          await expect(page).toHaveScreenshot(`${screen.name}-${width}.png`, {
            fullPage: !screen.viewportOnly,
            mask: (screen.masked ?? []).map((selector) => page.locator(selector)),
            animations: 'disabled',
            caret: 'hide',
            ...PAGE_TOLERANCE,
          });
        }
        if (screen.region || screen.elements) {
          await page.addStyleTag({ content: FIXED_BARS_HIDDEN });
        }
        if (screen.region) {
          await page
            .locator(screen.region)
            .evaluate((region) => region.scrollIntoView({ block: 'start', behavior: 'instant' }));
          await shootElement(page.locator(screen.region), `${screen.name}-${width}.png`, {
            ...PAGE_TOLERANCE,
          });
        }
        for (const shot of screen.elements ?? []) {
          await shootElement(page.locator(shot.selector), `${shot.name}-${width}.png`, {
            ...ELEMENT_TOLERANCE,
          });
        }
      });
    }
  }
}

test.describe('Given the v2 baseline screens', () => {
  test.skip(!process.env.BASELINE_SCREENS, 'records the v2 baseline screens (BASELINE_SCREENS)');
  test.use({ reducedMotion: 'reduce', locale: 'cs-CZ', timezoneId: 'Europe/Prague' });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
  });

  shootEach(SCREENS);
});

test.describe('Given the screens added after the v2 baseline', () => {
  test.skip(
    !process.env.BASELINE_SCREENS || process.env.BASELINE_SCREENS === 'v2',
    'v2 has no such screens; they are compared only against the merge base (BASELINE_SCREENS)',
  );
  test.use({ reducedMotion: 'reduce', locale: 'cs-CZ', timezoneId: 'Europe/Prague' });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
  });

  shootEach(SCREENS_SINCE_V2);
});
