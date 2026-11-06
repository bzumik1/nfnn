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
import { ADMINISTRATION_UNLOCK_PATH } from '../fixtures';
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
const LOCK_PANEL = { css: '.lock-panel h1' };
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

const signer = {
  id: 'signer',
  name: 'Petr Vzorový',
  role: 'Předseda správní rady',
  portrait: null,
};
const FEED_NEWS = Array.from({ length: 10 }, (_, index) => ({
  ...article,
  id: `feed-${index}`,
  slug: `zprava-${index}`,
  title: index === 0 ? 'Ohlédnutí za rokem 2025' : `Ohlédnutí za rokem ${2025 - index}`,
  signer,
}));
const FEED_STORIES = [
  'Děti s rakovinou na Ukrajině',
  'Bezbariérový přístup do školy',
  'Rehabilitace po úrazu',
  'Sofinka',
  'Miki a jeho první krůčky',
  'Kompenzační pomůcky pro Nelinku',
].map((title, index) => ({
  ...project,
  id: `story-${index}`,
  slug: `pribeh-${index}`,
  year: 2025,
  title,
}));

async function newsFeed(ui: Ui): Promise<void> {
  await mockDonorApi(ui.routes);
  await mockPublicContent(ui.routes);
  await ui.routes.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({ json: { items: FEED_NEWS, page: 0, size: 10, total: 23, hasMore: true } }),
  );
  await ui.routes.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({
        json: {
          items: FEED_STORIES,
          page: 0,
          size: 50,
          total: FEED_STORIES.length,
          hasMore: false,
        },
      }),
  );
  await visit(ui, '/aktuality');
  await ui.waitVisible({ css: '.story' });
}

async function donorPage(ui: Ui, path: string): Promise<void> {
  await mockDonorApi(ui.routes, donorWithDonations);
  await rememberedSession(ui, donor);
  await visit(ui, path);
}

async function lockedAdministration(ui: Ui, path: string): Promise<void> {
  await mockDonorApi(ui.routes, donorWithDonations);
  await mockAdministration(ui.routes);
  await ui.routes.route(
    (url) => url.pathname === ADMINISTRATION_UNLOCK_PATH,
    (route) => route.fulfill({ status: 204 }),
  );
  await rememberedSession(ui, administrator);
  await ui.goto(path);
  await ui.waitVisible(LOCK_PANEL);
}

async function adminPage(ui: Ui, path: string): Promise<void> {
  await lockedAdministration(ui, path);
  await ui.click({ css: 'button.lock-use-password' });
  await ui.fill({ css: '#zamek-heslo' }, 'correct horse battery');
  await ui.fill({ css: '#zamek-kod' }, '123456');
  await ui.click({ css: 'button.lock-unlock' });
  await ui.waitVisible({ css: '.admin-page h1' });
}

async function openSignInDialog(ui: Ui): Promise<void> {
  await mockDonorApi(ui.routes);
  await ui.goto('/');
  await ui.click({ css: 'header button.sign-in' });
  await ui.waitVisible(DIALOG);
}

export const STEPS: Step[] = [
  { id: 'home', title: 'the home page', open: (ui) => publicPage(ui, '/') },
  { id: 'about', title: 'the About tab', open: (ui) => publicPage(ui, '/o-nas') },
  {
    id: 'donate',
    title: 'the Přispět tab with 1 000 Kč chosen',
    open: async (ui) => {
      await servePaymentDetails(ui.routes);
      await publicPage(ui, '/prispet');
      await ui.scrollToTop({ css: '#prispet' });
      await ui.click({ css: '#prispet button', text: '1 000 Kč' });
      if (await ui.isVisible(OTHER_DEVICE)) {
        await ui.waitVisible({ css: '#prispet .bank-app-open:not([disabled])' });
      } else {
        await ui.waitVisible(DONATE_QR);
      }
    },
  },
  {
    id: 'home-donate-other-device',
    title: 'the Přispět section with the QR code unfolded for another device',
    open: async (ui) => {
      await servePaymentDetails(ui.routes);
      await publicPage(ui, '/prispet');
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
      await publicPage(ui, '/prispet');
      if (await ui.isVisible(OTHER_DEVICE)) {
        await ui.click(OTHER_DEVICE);
      }
      await ui.click({ css: '#prispet button.zoomable' });
      await ui.waitVisible({ css: 'dialog[open] .zoom-qr [role="img"]' });
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
    id: 'projects',
    title: 'the Pomáháme tab on its newest year',
    open: (ui) => publicPage(ui, '/projekty'),
  },
  {
    id: 'projects-all',
    title: 'the Pomáháme tab with every year as a strip',
    open: async (ui) => {
      await publicPage(ui, '/projekty?rok=vse');
      await ui.waitVisible({ css: 'a.strip-all' });
    },
  },
  {
    id: 'news-feed',
    title: 'the news feed with signers, the stories of the year and paging',
    open: newsFeed,
  },
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
    id: 'donor-device-data-delete',
    title: 'the dialog that deletes the data on this device',
    open: async (ui) => {
      await donorPage(ui, '/darce/udaje');
      await ui.click({ css: 'app-device-data-card button', text: 'Smazat data z tohoto zařízení' });
      await ui.waitVisible({ css: 'dialog[open] h2', text: 'Smazat data z tohoto zařízení?' });
    },
  },
  {
    id: 'account-sheet',
    title: "the donor's account sheet",
    open: async (ui) => {
      await donorPage(ui, '/darce/prehled');
      await ui.click({ css: 'header button.account-button' });
      await ui.waitVisible({ css: 'dialog[open] a' });
    },
  },
  {
    id: 'admin-lock',
    title: 'the locked administration',
    open: (ui) => lockedAdministration(ui, '/sprava'),
  },
  {
    id: 'admin-unlock-password',
    title: 'the password and code that unlock the administration',
    open: async (ui) => {
      await lockedAdministration(ui, '/sprava');
      await ui.click({ css: 'button.lock-use-password' });
      await ui.waitVisible({ css: '#zamek-heslo' });
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
    id: 'admin-alerts',
    title: 'the push alerts in the administration',
    open: (ui) => adminPage(ui, '/sprava/upozorneni'),
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
    id: 'admin-changed-meanwhile',
    title: 'the sheet of a write refused because someone else saved meanwhile',
    open: async (ui) => {
      await adminPage(ui, '/sprava/prehledy');
      await ui.routes.route(
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
              current: { recipients: ['info@nfnn.cz'], changedAt: '2026-10-20T08:15:00Z' },
            },
          }),
      );
      await ui.click({ css: 'form.settings-form button[type="submit"]' });
      await ui.waitVisible(DIALOG);
    },
  },
  {
    id: 'admin-settings',
    title: 'the settings in the administration',
    open: (ui) => adminPage(ui, '/sprava/nastaveni'),
  },
  {
    id: 'admin-more',
    title: 'the occasional and technical sections of the administration',
    open: (ui) => adminPage(ui, '/sprava/vice'),
  },
];
