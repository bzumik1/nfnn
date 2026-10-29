import { Page } from '@playwright/test';
import {
  connectionRequest,
  donor,
  mockConnectApi,
  mockDonorApi,
  openSignInDialog,
  problem,
} from '../donor-session';
import { expect, test } from '../fixtures';
import {
  article,
  donorWithDonations,
  FIXED_TIME,
  mockAdministration,
  mockPublicContent,
  noDonations,
  PETR_DETAIL_PATH,
  project,
  rememberedSession,
} from './screen-mocks';

interface Screen {
  name: string;
  open: (page: Page, width: number) => Promise<void>;
  viewportOnly?: boolean;
}

const WIDTHS = [390, 1280];
const HEIGHT = 900;
const DIALOG_OPENING_WIDTH = 1280;
const SEARCH_PAUSE_MS = 5_000;

function publicPage(name: string, path: string): Screen {
  return {
    name,
    open: async (page) => {
      await mockDonorApi(page);
      await mockPublicContent(page);
      await page.goto(path);
    },
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

function adminPage(name: string, path: string): Screen {
  return {
    name,
    open: async (page) => {
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await rememberedSession(page);
      await page.goto(path);
    },
  };
}

async function openDialogAt(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width: DIALOG_OPENING_WIDTH, height: HEIGHT });
  await openSignInDialog(page);
  await page.setViewportSize({ width, height: HEIGHT });
}

const SCREENS: Screen[] = [
  publicPage('home', '/'),
  publicPage('news', '/aktuality'),
  publicPage('news-article', `/aktuality/${article.slug}`),
  publicPage('projects', '/projekty'),
  publicPage('project', `/projekty/${project.slug}`),
  publicPage('privacy-policy', '/zasady-ochrany-osobnich-udaju'),
  publicPage('not-found', '/neexistuje'),
  publicPage('password-reset-without-link', '/obnova-hesla'),
  publicPage('email-verification-without-link', '/potvrzeni-emailu'),
  {
    name: 'connect-app-signed-out',
    open: async (page) => {
      await mockDonorApi(page);
      await mockConnectApi(page);
      await page.goto(connectionRequest);
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
  adminPage('admin-older-symbols', '/sprava/starsi-symboly'),
  adminPage('admin-reports', '/sprava/prehledy'),
  adminPage('admin-news', '/sprava/aktuality'),
  adminPage('admin-news-new', '/sprava/aktuality/nova'),
  adminPage('admin-projects', '/sprava/projekty'),
  adminPage('admin-projects-new', '/sprava/projekty/nova'),
  adminPage('admin-backups', '/sprava/zalohy'),
  adminPage('admin-logs', '/sprava/logy'),
  adminPage('admin-settings', '/sprava/nastaveni'),
  adminPage('admin-history', '/sprava/historie'),
];

async function settle(page: Page): Promise<void> {
  await expect(page.locator('h1').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
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

test.describe('Given the v2 baseline screens', () => {
  test.skip(!process.env.BASELINE_SCREENS, 'records the v2 baseline screens (BASELINE_SCREENS)');
  test.use({ reducedMotion: 'reduce', locale: 'cs-CZ', timezoneId: 'Europe/Prague' });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
  });

  for (const screen of SCREENS) {
    for (const width of WIDTHS) {
      test(`when ${screen.name} is shown ${width} px wide, then it looks as recorded`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: HEIGHT });
        await screen.open(page, width);
        await settle(page);

        await expect(page).toHaveScreenshot(`${screen.name}-${width}.png`, {
          fullPage: !screen.viewportOnly,
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.002,
        });
      });
    }
  }
});
