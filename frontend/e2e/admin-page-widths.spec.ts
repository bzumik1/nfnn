import type { Locator, Page } from '@playwright/test';
import {
  donorWithDonations,
  mockAdministration,
  PETR_DETAIL_PATH,
  rememberedSession,
  serveEmptyAdministrationCopy,
} from './baseline/screen-mocks';
import { mockDonorApi, whenAdministrationCopied } from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

const HEIGHT = 900;
const WHERE_THE_FULL_WIDTH_REACHES_THE_AVATAR = 1280;
const WHERE_THE_FORM_WIDTH_STAYS_NARROWER = 1920;

const FULL_WIDTH_PAGES = [
  '/sprava',
  '/sprava/platby',
  '/sprava/darci',
  PETR_DETAIL_PATH,
  '/sprava/aktuality',
  '/sprava/projekty',
  '/sprava/hromadna-potvrzeni',
  '/sprava/spravci',
  '/sprava/starsi-symboly',
  '/sprava/loga-bank',
  '/sprava/lide-fondu',
  '/sprava/historie',
  '/sprava/zalohy/historie',
  '/sprava/logy/soubor?nazev=backend.log',
] as const;

const FORM_WIDTH_PAGES = [
  '/sprava/nastaveni',
  '/sprava/logy',
  '/sprava/logy/soubory',
  '/sprava/logy/urovne',
  '/sprava/logy/stav',
  '/sprava/logy/vlakna',
  '/sprava/aktuality/nova',
  '/sprava/projekty/nova',
  '/sprava/o-nas',
  '/sprava/pruh-prispet',
  '/sprava/prehledy',
  '/sprava/zalohy',
  '/sprava/upozorneni',
  '/sprava/overit',
] as const;

interface Edges {
  readonly left: number;
  readonly contentRight: number;
  readonly widestCardRight: number;
  readonly avatarRight: number;
  readonly pansSideways: boolean;
}

async function openUnlocked(page: Page, path: string): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await serveEmptyAdministrationCopy(page);
  await rememberedSession(page);
  const copied = whenAdministrationCopied(page);
  await page.goto(path);
  await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
  await copied();
}

function pageBox(page: Page): Locator {
  return page.locator('.admin-page .container').first();
}

async function edgesAt(page: Page, width: number): Promise<Edges> {
  await page.setViewportSize({ width, height: HEIGHT });
  await expect(pageBox(page)).toBeVisible();
  const avatar = await page
    .getByRole('banner')
    .getByRole('button', { name: /^Účet/ })
    .boundingBox();
  expect(avatar).not.toBeNull();
  const edges = await pageBox(page).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const paddingRight = parseFloat(getComputedStyle(element).paddingRight);
    const cards = Array.from(element.querySelectorAll('.ui-card')).map(
      (card) => card.getBoundingClientRect().right,
    );
    return {
      left: box.left,
      contentRight: box.right - paddingRight,
      widestCardRight: Math.max(box.left, ...cards),
      pansSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  return { ...edges, avatarRight: avatar!.x + avatar!.width };
}

function expectWithinTheAvatar(edges: Edges): void {
  expect(edges.contentRight).toBeLessThanOrEqual(edges.avatarRight + 0.5);
  expect(edges.widestCardRight).toBeLessThanOrEqual(edges.avatarRight + 0.5);
  expect(edges.pansSideways).toBe(false);
}

test.describe('Given an administrator on a computer', () => {
  for (const path of FULL_WIDTH_PAGES) {
    test(`when ${path} opens at 1280 and 1920 px, then it takes the full width and ends on the avatar's axis`, async ({
      page,
    }) => {
      await openUnlocked(page, path);

      const narrow = await edgesAt(page, WHERE_THE_FULL_WIDTH_REACHES_THE_AVATAR);
      expectWithinTheAvatar(narrow);
      expect(narrow.contentRight).toBeCloseTo(narrow.avatarRight, 0);

      const wide = await edgesAt(page, WHERE_THE_FORM_WIDTH_STAYS_NARROWER);
      expectWithinTheAvatar(wide);
      expect(wide.contentRight).toBeCloseTo(wide.avatarRight, 0);
    });
  }

  for (const path of FORM_WIDTH_PAGES) {
    test(`when ${path} opens at 1280 and 1920 px, then it takes the form width and stays inside the avatar's axis`, async ({
      page,
    }) => {
      await openUnlocked(page, path);

      const narrow = await edgesAt(page, WHERE_THE_FULL_WIDTH_REACHES_THE_AVATAR);
      expectWithinTheAvatar(narrow);

      const wide = await edgesAt(page, WHERE_THE_FORM_WIDTH_STAYS_NARROWER);
      expectWithinTheAvatar(wide);
      expect(wide.contentRight).toBeLessThan(wide.avatarRight - 1);
      expect(wide.contentRight - wide.left).toBeCloseTo(narrow.contentRight - narrow.left, 0);
    });
  }
});

test.describe('Given an administrator who opens Občas a pro technika', () => {
  test('when a computer opens its address, then the overview opens in its place and the side navigation does not list it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: HEIGHT });
    await openUnlocked(page, '/sprava/vice');

    await expect(page).toHaveURL(/\/sprava$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Správa', exact: true }),
    ).toBeVisible();
    const sideNav = page.getByRole('navigation', { name: 'Správa' });
    await expect(sideNav.getByRole('link', { name: 'Přehled' })).toBeVisible();
    await expect(sideNav.locator('a[href="/sprava/vice"]')).toHaveCount(0);
  });

  test('when a phone opens it and the window then widens to a computer, then the overview takes its place', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openUnlocked(page, '/sprava/vice');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Občas a pro technika' }),
    ).toBeVisible();

    await page.setViewportSize({ width: 1280, height: HEIGHT });

    await expect(page).toHaveURL(/\/sprava$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Správa', exact: true }),
    ).toBeVisible();
  });
});
