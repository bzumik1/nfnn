import { Page } from '@playwright/test';
import {
  article,
  donorWithDonations,
  mockAdministration,
  mockPublicContent,
  PETR_DETAIL_PATH,
  project,
  servePaymentDetails,
} from '../baseline/screen-mocks';
import { administrator, donor, mockDonorApi, openSignInDialog, session } from '../donor-session';
import { expect } from '../fixtures';
import { serveReceiptKeys, serveReceiptStatus, SINGLE_RECEIPT } from '../receipt-verification';

export interface Step {
  id: string;
  title: string;
  open: (page: Page) => Promise<string | void>;
}

export const NOT_ON_THIS_DEVICE = 'not on this device';

async function rememberedSession(page: Page, user: typeof donor): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200, user)));
  await page.addInitScript(() => localStorage.setItem('nfnn.donor-session', '1'));
}

async function heading(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
}

async function publicPage(page: Page, path: string): Promise<void> {
  await mockDonorApi(page);
  await mockPublicContent(page);
  await page.goto(path);
  await heading(page);
}

async function donorPage(page: Page, path: string): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await rememberedSession(page, donor);
  await page.goto(path);
  await heading(page);
}

async function adminPage(page: Page, path: string): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await rememberedSession(page, administrator);
  await page.goto(path);
  await heading(page);
}

async function openSideMenu(page: Page): Promise<string | void> {
  const toggle = page.locator('.side-nav-toggle');
  if (!(await toggle.isVisible())) {
    return NOT_ON_THIS_DEVICE;
  }
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

export const STEPS: Step[] = [
  { id: 'home', title: 'the home page', open: (page) => publicPage(page, '/') },
  {
    id: 'home-donate',
    title: 'the Přispět section with 1 000 Kč chosen',
    open: async (page) => {
      await servePaymentDetails(page);
      await publicPage(page, '/#prispet');
      await page.locator('#prispet').getByRole('button', { name: '1 000 Kč' }).click();
      await expect(page.locator('#prispet .qr-code').getByRole('img')).toBeVisible();
      await page
        .locator('#prispet')
        .evaluate((section) => section.scrollIntoView({ behavior: 'instant' }));
    },
  },
  {
    id: 'site-menu',
    title: 'the site menu',
    open: async (page) => {
      await publicPage(page, '/');
      const button = page.locator('.mobile-menu-btn');
      if (!(await button.isVisible())) {
        return NOT_ON_THIS_DEVICE;
      }
      await button.click();
      await expect(page.locator('#mobile-menu')).toBeVisible();
    },
  },
  {
    id: 'sign-in',
    title: 'the sign-in dialog',
    open: async (page) => {
      await mockDonorApi(page);
      await openSignInDialog(page);
    },
  },
  {
    id: 'registration',
    title: 'the registration dialog',
    open: async (page) => {
      await mockDonorApi(page);
      await openSignInDialog(page);
      await page.getByRole('dialog').getByRole('button', { name: 'Registrace' }).click();
      await expect(page.getByRole('dialog').locator('input').first()).toBeVisible();
    },
  },
  { id: 'news', title: 'the news list', open: (page) => publicPage(page, '/aktuality') },
  {
    id: 'news-article',
    title: 'a news article',
    open: (page) => publicPage(page, `/aktuality/${article.slug}`),
  },
  {
    id: 'project',
    title: 'a project',
    open: (page) => publicPage(page, `/projekty/${project.slug}`),
  },
  {
    id: 'verify-receipt',
    title: 'the verification of a scanned receipt',
    open: async (page) => {
      await mockDonorApi(page);
      await serveReceiptKeys(page);
      await serveReceiptStatus(page, 'active');
      await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);
      await expect(page.getByText('Fond toto potvrzení vede jako platné.')).toBeVisible();
    },
  },
  { id: 'not-found', title: 'a missing page', open: (page) => publicPage(page, '/neexistuje') },
  {
    id: 'donor-overview',
    title: "the donor's overview",
    open: (page) => donorPage(page, '/darce/prehled'),
  },
  {
    id: 'donor-donations',
    title: "the donor's gifts",
    open: (page) => donorPage(page, '/darce/dary'),
  },
  {
    id: 'donor-receipts',
    title: "the donor's receipts",
    open: (page) => donorPage(page, '/darce/potvrzeni'),
  },
  {
    id: 'donor-details',
    title: "the donor's details",
    open: (page) => donorPage(page, '/darce/udaje'),
  },
  {
    id: 'donor-menu',
    title: "the donor's account menu",
    open: async (page) => {
      await donorPage(page, '/darce/prehled');
      return openSideMenu(page);
    },
  },
  { id: 'admin-home', title: 'the administration', open: (page) => adminPage(page, '/sprava') },
  {
    id: 'admin-payments',
    title: 'the payments in the administration',
    open: (page) => adminPage(page, '/sprava/platby'),
  },
  {
    id: 'admin-donors',
    title: 'the donors in the administration',
    open: (page) => adminPage(page, '/sprava/darci'),
  },
  {
    id: 'admin-donor-detail',
    title: "a donor's card in the administration",
    open: (page) => adminPage(page, PETR_DETAIL_PATH),
  },
  {
    id: 'admin-settings',
    title: 'the settings in the administration',
    open: (page) => adminPage(page, '/sprava/nastaveni'),
  },
  {
    id: 'admin-menu',
    title: 'the administration menu',
    open: async (page) => {
      await adminPage(page, '/sprava');
      return openSideMenu(page);
    },
  },
];
