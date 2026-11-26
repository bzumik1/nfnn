import { CDPSession, Locator, Page } from '@playwright/test';
import {
  administrationCopyGift,
  administrator,
  mockDonorApi,
  serveAdministrationCopy,
  session,
  whenAdministrationCopied,
} from './donor-session';
import { expect, test } from './fixtures';

const FINGER_Y = 420;
const FLICK_REST_MS = 100;
const DONOR_ID = '019a1c00-0000-7000-8000-00000000b001';
const DONOR_CARD = `/sprava/darci/${DONOR_ID}`;

const donorRow = {
  donorId: DONOR_ID,
  type: 'PERSON',
  name: 'Petr Svoboda',
  companyIdentifier: null,
  address: { street: 'Krátká 3', city: 'Děčín', postalCode: '405 02' },
  email: 'petr@example.cz',
  variableSymbol: '2234567890',
  preferredLocale: 'cs',
};

const OTHER_DONOR_ID = '0199f3e0-0000-7000-8000-00000000d002';

const pairedPayment = {
  id: '019a1c00-0000-7000-8000-000000001001',
  version: '3f2a9c4e1b7d6085',
  bankTransactionId: 1001,
  bookedOn: '2026-10-10',
  amountMinor: 50000,
  currency: 'CZK',
  variableSymbol: '1111111111',
  counterpartyAccount: '2900233333/2010',
  counterpartyName: 'Nováková Jana',
  messageForRecipient: 'Dar pro fond',
  importedAt: '2026-10-17T10:00:00Z',
  unpairedByAdminAt: null,
  accountVerification: false,
};

const otherPayments = Array.from({ length: 12 }, (_, index) => ({
  ...pairedPayment,
  id: `019a1c00-0000-7000-8000-0000000020${String(index).padStart(2, '0')}`,
  bankTransactionId: 2000 + index,
  bookedOn: `2026-10-${String(30 - index).padStart(2, '0')}`,
  variableSymbol: '2222222222',
  counterpartyName: 'Dvořák Petr',
}));

function donorRecord(donorId: string, name: string, variableSymbol: string) {
  return {
    donorId,
    name,
    type: 'PERSON',
    variableSymbol,
    companyIdentifier: null,
    address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
    preferredLocale: 'cs',
    registeredAt: '2026-01-15T10:00:00Z',
    erasedAt: null,
  };
}

function pairedByHand(payment: typeof pairedPayment, donorId: string) {
  return {
    ...administrationCopyGift(payment.id, donorId, payment.bookedOn, payment.amountMinor),
    pairedBy: 'MANUAL',
  };
}

type Way = 'back-button' | 'swipe';

const WAY_NAMES: Record<Way, string> = {
  'back-button': 'they tap ‹',
  swipe: 'a finger takes the screen back past half',
};

interface Section {
  readonly name: string;
  readonly open: (page: Page) => Promise<void>;
  readonly returned: RegExp;
  readonly row: (page: Page) => Locator;
}

const SECTIONS: readonly Section[] = [
  {
    name: 'the donor card opened from Dárci',
    open: async (page) => {
      await follow(page, page.locator('.admin-frame a[href="/sprava/darci"]').first());
      await follow(page, donorLink(page));
    },
    returned: /\/sprava\/darci$/,
    row: donorLink,
  },
  {
    name: "a paired payment's donor card opened from Platby",
    open: async (page) => {
      await follow(page, page.locator('.admin-frame a[href="/sprava/platby"]').first());
      await page.getByRole('button', { name: 'Přiřazené', exact: true }).click();
      await paymentRow(page).click();
      await page
        .getByRole('dialog', { name: 'Přiřazená platba' })
        .getByRole('link', { name: 'Jana Nováková' })
        .click();
      await expect(page).toHaveURL(new RegExp(`/sprava/darci/${administrator.id}$`));
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('.page-transition')).toHaveCount(0);
    },
    returned: /\/sprava\/platby\?stav=prirazene$/,
    row: paymentRow,
  },
  {
    name: 'Nastavení opened from Občas a pro technika',
    open: async (page) => {
      await follow(page, page.locator('.admin-frame a[href="/sprava/vice"]').first());
      await follow(page, settingsLink(page));
    },
    returned: /\/sprava\/vice$/,
    row: settingsLink,
  },
];

function donorLink(page: Page): Locator {
  return page.locator(`app-root .admin-page a[href="${DONOR_CARD}"]`).first();
}

function paymentRow(page: Page): Locator {
  return page.getByRole('button', { name: /^Nováková Jana 10\. 10\. 2026/ });
}

function settingsLink(page: Page): Locator {
  return page.locator('app-root .admin-page a[href="/sprava/nastaveni"]').first();
}

function back(page: Page): Locator {
  return page.getByRole('banner').getByRole('button', { name: 'Zpět' });
}

async function follow(page: Page, link: Locator): Promise<void> {
  const href = (await link.getAttribute('href'))!;
  await link.click();
  await expect(page).toHaveURL((url) => url.pathname === href);
  await expect(page.locator('.page-transition')).toHaveCount(0);
}

async function restLongerThanAFlick(page: Page): Promise<void> {
  const restStartedAt = await page.evaluate(() => performance.now());
  await expect
    .poll(() => page.evaluate(() => performance.now()))
    .toBeGreaterThan(restStartedAt + FLICK_REST_MS);
}

async function swipeBack(page: Page): Promise<void> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const touch = (type: string, x?: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: x === undefined ? [] : [{ x, y: FINGER_Y }],
    });
  await touch('touchStart', 30);
  for (let step = 1; step <= 10; step++) {
    await touch('touchMove', 30 + 22 * step);
  }
  await restLongerThanAFlick(page);
  await touch('touchEnd');
}

function focusRingShows(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement?.matches(':focus-visible') ?? false);
}

test.describe('Given an administrator in the app on the home screen of a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
      localStorage.setItem('nfnn.donor-session-app', '1');
    });
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await serveAdministrationCopy(page, {
      donations: {
        'payments:2026-10': [...otherPayments, pairedPayment],
        'donations:2026-10': [
          administrationCopyGift(
            '0192f0f1-0000-7000-8000-0000000000b1',
            DONOR_ID,
            '2026-10-25',
            50000,
          ),
          ...otherPayments.map((payment) => pairedByHand(payment, OTHER_DONOR_ID)),
          pairedByHand(pairedPayment, administrator.id),
        ],
        'donor-records:2026-01': [
          donorRecord(administrator.id, 'Jana Nováková', '1111111111'),
          donorRecord(OTHER_DONOR_ID, 'Petr Dvořák', '2222222222'),
        ],
      },
      donors: { 'accounts:2026-10': [donorRow] },
    });
    await page.route(
      (url) => url.pathname === `/api/admin/donors/${DONOR_ID}`,
      (route) => route.fulfill({ json: donorRow }),
    );
    const copied = whenAdministrationCopied(page);
    await page.goto('/sprava');
    await copied();
  });

  for (const section of SECTIONS) {
    for (const way of ['back-button', 'swipe'] as const) {
      test(`when ${WAY_NAMES[way]} on ${section.name}, then the row they left takes the focus back from the heading, without a ring after the touch`, async ({
        page,
      }) => {
        await section.open(page);

        if (way === 'back-button') {
          await back(page).tap();
        } else {
          await swipeBack(page);
        }

        await expect(page).toHaveURL(section.returned);
        await expect(section.row(page)).toBeFocused();
        await expect(page.locator('.page-transition')).toHaveCount(0);
        expect(await focusRingShows(page), 'the focus ring showed after a touch').toBe(false);
      });
    }

    test(`when they press ‹ by keyboard on ${section.name}, then the row they left takes the focus with its ring`, async ({
      page,
    }) => {
      await section.open(page);

      await back(page).focus();
      await page.keyboard.press('Enter');

      await expect(page).toHaveURL(section.returned);
      await expect(section.row(page)).toBeFocused();
      await expect.poll(() => focusRingShows(page)).toBe(true);
    });
  }
});
