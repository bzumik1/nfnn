import {
  article,
  donorWithDonations,
  mockAdministration,
  mockPublicContent,
  PETR_DETAIL_PATH,
  project,
  servePaymentDetails,
} from '../baseline/screen-mocks';
import { administrator, donor, mockDonorApi, session } from '../donor-session';
import { serveReceiptKeys, serveReceiptStatus, SINGLE_RECEIPT } from '../receipt-verification';
import { FOUR_DONORS, mockYearlyReceipts } from '../yearly-receipts';
import type { Ui } from './ui';

export interface Step {
  id: string;
  title: string;
  open: (ui: Ui) => Promise<string | void>;
}

export const NOT_ON_THIS_DEVICE = 'not on this device';

const DIALOG = { css: 'dialog' };
const OTHER_DEVICE = { css: '#prispet button.other-device' };
const DONATE_QR = { css: '#prispet .qr-code [role="img"]' };

async function rememberedSession(ui: Ui, user: typeof donor): Promise<void> {
  await ui.routes.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200, user)));
  await ui.rememberSession();
}

async function visit(ui: Ui, path: string): Promise<void> {
  await ui.goto(path);
  await ui.waitVisible({ css: 'h1' });
}

async function publicPage(ui: Ui, path: string): Promise<void> {
  await mockDonorApi(ui.routes);
  await mockPublicContent(ui.routes);
  await visit(ui, path);
}

async function donorPage(ui: Ui, path: string): Promise<void> {
  await mockDonorApi(ui.routes, donorWithDonations);
  await rememberedSession(ui, donor);
  await visit(ui, path);
}

async function adminPage(ui: Ui, path: string): Promise<void> {
  await mockDonorApi(ui.routes, donorWithDonations);
  await mockAdministration(ui.routes);
  await rememberedSession(ui, administrator);
  await visit(ui, path);
}

async function openSignInDialog(ui: Ui): Promise<void> {
  await mockDonorApi(ui.routes);
  await ui.goto('/');
  const header = { css: '.nav-login' };
  const menu = { css: '.mobile-menu-btn' };
  await ui.waitVisible({ css: `${header.css}, ${menu.css}` });
  if (await ui.isVisible(header)) {
    await ui.click(header);
  } else {
    await ui.click(menu);
    await ui.click({ css: '.mobile-login' });
  }
  await ui.waitVisible(DIALOG);
}

async function openSideMenu(ui: Ui): Promise<string | void> {
  const toggle = { css: '.side-nav-toggle' };
  if (!(await ui.isVisible(toggle))) {
    return NOT_ON_THIS_DEVICE;
  }
  await ui.click(toggle);
  await ui.waitAttribute(toggle, 'aria-expanded', 'true');
}

export const STEPS: Step[] = [
  { id: 'home', title: 'the home page', open: (ui) => publicPage(ui, '/') },
  {
    id: 'home-donate',
    title: 'the Přispět section with 1 000 Kč chosen',
    open: async (ui) => {
      await servePaymentDetails(ui.routes);
      await publicPage(ui, '/#prispet');
      await ui.click({ css: '#prispet button', text: '1 000 Kč' });
      if (await ui.isVisible(OTHER_DEVICE)) {
        await ui.waitVisible({ css: '#prispet .bank-app-open:not([disabled])' });
      } else {
        await ui.waitVisible(DONATE_QR);
      }
      await ui.scrollToTop({ css: '#prispet' });
    },
  },
  {
    id: 'home-donate-other-device',
    title: 'the Přispět section with the QR code unfolded for another device',
    open: async (ui) => {
      await servePaymentDetails(ui.routes);
      await publicPage(ui, '/#prispet');
      if (!(await ui.isVisible(OTHER_DEVICE))) {
        return NOT_ON_THIS_DEVICE;
      }
      await ui.click(OTHER_DEVICE);
      await ui.waitVisible(DONATE_QR);
      await ui.scrollToTop(OTHER_DEVICE);
    },
  },
  {
    id: 'qr-viewer',
    title: 'the Přispět QR code opened large',
    open: async (ui) => {
      await servePaymentDetails(ui.routes);
      await publicPage(ui, '/#prispet');
      if (await ui.isVisible(OTHER_DEVICE)) {
        await ui.click(OTHER_DEVICE);
      }
      await ui.click({ css: '#prispet button.zoomable' });
      await ui.waitVisible({ css: 'dialog[open] .zoom-qr [role="img"]' });
    },
  },
  {
    id: 'site-menu',
    title: 'the site menu',
    open: async (ui) => {
      await publicPage(ui, '/');
      const button = { css: '.mobile-menu-btn' };
      if (!(await ui.isVisible(button))) {
        return NOT_ON_THIS_DEVICE;
      }
      await ui.click(button);
      await ui.waitVisible({ css: '#mobile-menu' });
    },
  },
  { id: 'sign-in', title: 'the sign-in dialog', open: openSignInDialog },
  {
    id: 'registration',
    title: 'the registration dialog',
    open: async (ui) => {
      await openSignInDialog(ui);
      await ui.click({ css: 'dialog button', text: 'Registrace' });
      await ui.waitVisible({ css: 'dialog input' });
    },
  },
  { id: 'news', title: 'the news list', open: (ui) => publicPage(ui, '/aktuality') },
  {
    id: 'news-article',
    title: 'a news article',
    open: (ui) => publicPage(ui, `/aktuality/${article.slug}`),
  },
  {
    id: 'photo-viewer',
    title: 'the photo of a news article opened large',
    open: async (ui) => {
      await publicPage(ui, `/aktuality/${article.slug}`);
      await ui.click({ css: '.photo-zoom button.zoomable' });
      await ui.waitVisible({ css: 'dialog[open] img.zoom-photo' });
    },
  },
  {
    id: 'project',
    title: 'a project',
    open: (ui) => publicPage(ui, `/projekty/${project.slug}`),
  },
  {
    id: 'verify-receipt',
    title: 'the verification of a scanned receipt',
    open: async (ui) => {
      await mockDonorApi(ui.routes);
      await serveReceiptKeys(ui.routes);
      await serveReceiptStatus(ui.routes, 'active');
      await ui.goto(`/overit#${SINGLE_RECEIPT.fragment}`);
      await ui.waitVisible({ css: 'main', text: 'Fond toto potvrzení vede jako platné.' });
    },
  },
  { id: 'not-found', title: 'a missing page', open: (ui) => publicPage(ui, '/neexistuje') },
  {
    id: 'donor-overview',
    title: "the donor's overview",
    open: (ui) => donorPage(ui, '/darce/prehled'),
  },
  {
    id: 'donor-donations',
    title: "the donor's gifts",
    open: (ui) => donorPage(ui, '/darce/dary'),
  },
  {
    id: 'donor-receipts',
    title: "the donor's receipts",
    open: (ui) => donorPage(ui, '/darce/potvrzeni'),
  },
  {
    id: 'donor-details',
    title: "the donor's details",
    open: (ui) => donorPage(ui, '/darce/udaje'),
  },
  {
    id: 'donor-menu',
    title: "the donor's account menu",
    open: async (ui) => {
      await donorPage(ui, '/darce/prehled');
      return openSideMenu(ui);
    },
  },
  { id: 'admin-home', title: 'the administration', open: (ui) => adminPage(ui, '/sprava') },
  {
    id: 'admin-payments',
    title: 'the payments in the administration',
    open: (ui) => adminPage(ui, '/sprava/platby'),
  },
  {
    id: 'admin-donors',
    title: 'the donors in the administration',
    open: (ui) => adminPage(ui, '/sprava/darci'),
  },
  {
    id: 'admin-donor-detail',
    title: "a donor's card in the administration",
    open: (ui) => adminPage(ui, PETR_DETAIL_PATH),
  },
  {
    id: 'admin-yearly-receipts',
    title: 'the bulk receipts in the administration',
    open: async (ui) => {
      await mockYearlyReceipts(ui.routes, { donors: FOUR_DONORS, erasedDonors: 1 });
      await adminPage(ui, '/sprava/hromadna-potvrzeni');
      await ui.waitVisible({ css: '.donors-table tbody tr' });
    },
  },
  {
    id: 'admin-settings',
    title: 'the settings in the administration',
    open: (ui) => adminPage(ui, '/sprava/nastaveni'),
  },
  {
    id: 'admin-menu',
    title: 'the administration menu',
    open: async (ui) => {
      await adminPage(ui, '/sprava');
      return openSideMenu(ui);
    },
  },
];
