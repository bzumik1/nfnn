import type { Locator, Page } from '@playwright/test';
import { donorWithDonations, mockAdministration, rememberedSession } from './baseline/screen-mocks';
import { mockDonorApi, rememberedDonorSession, whenAdministrationCopied } from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

const WIDTHS = [1280, 1600, 1920];
const WIDTH_WHERE_CONTENT_REACHES_THE_END = 1280;
const HEIGHT = 900;
const LOGO = 'Nová naděje – nadační fond';

interface Area {
  readonly name: string;
  readonly navId: string;
  readonly widthsWhereContentReachesTheEnd: readonly number[];
  open(page: Page): Promise<void>;
}

const AREAS: readonly Area[] = [
  {
    name: 'the donor overview',
    navId: 'donor-nav',
    widthsWhereContentReachesTheEnd: WIDTHS,
    open: async (page) => {
      await mockDonorApi(page, donorWithDonations);
      await rememberedDonorSession(page);
      await page.goto('/darce/prehled');
      await expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Poslední dar', exact: true }),
      ).toBeVisible();
    },
  },
  {
    name: 'the administration overview',
    navId: 'admin-nav',
    widthsWhereContentReachesTheEnd: [WIDTH_WHERE_CONTENT_REACHES_THE_END],
    open: async (page) => {
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await rememberedSession(page);
      const copied = whenAdministrationCopied(page);
      await page.goto('/sprava');
      await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
      await copied();
    },
  },
];

function textLeft(link: Locator): Promise<number> {
  return link.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element.querySelector('span') ?? element);
    return range.getBoundingClientRect().left;
  });
}

async function left(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!.x;
}

async function right(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!.x + box!.width;
}

function widthBesideTheScrollbar(page: Page): Promise<number> {
  return page.evaluate(() => document.body.clientWidth);
}

function logo(page: Page): Locator {
  return page.getByRole('banner').getByRole('img', { name: LOGO });
}

function avatar(page: Page): Locator {
  return page.getByRole('banner').getByRole('button', { name: /^Účet/ });
}

function navLinks(page: Page, area: Area): Locator {
  return page.locator(`#${area.navId}`).getByRole('link');
}

for (const area of AREAS) {
  test.describe(`Given ${area.name} on a computer`, () => {
    for (const width of WIDTHS) {
      test(`when it is ${width} px wide, then the navigation text starts on the logo's left edge and the content ends no further than the avatar`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: HEIGHT });
        await area.open(page);
        const logoLeft = await left(logo(page));
        await expect(navLinks(page, area).first()).toBeVisible();
        for (const link of await navLinks(page, area).all()) {
          expect(await textLeft(link)).toBeCloseTo(logoLeft, 0);
        }
        const contentRight = await right(page.locator('main .ui-card').first());
        expect(contentRight).toBeLessThanOrEqual((await right(avatar(page))) + 0.5);
      });
    }

    for (const width of area.widthsWhereContentReachesTheEnd) {
      test(`when it is ${width} px wide, then the content ends on the avatar's right edge, as the logo starts on the left one`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: HEIGHT });
        await area.open(page);
        const contentRight = await right(page.locator('main .ui-card').first());
        expect(contentRight).toBeCloseTo(await right(avatar(page)), 0);
        expect((await widthBesideTheScrollbar(page)) - contentRight).toBeCloseTo(
          await left(logo(page)),
          0,
        );
      });
    }

    test('when forced colours are on, then the current item marked by its border keeps its text on the same edge as the others', async ({
      page,
    }) => {
      await page.emulateMedia({ forcedColors: 'active' });
      await page.setViewportSize({ width: WIDTH_WHERE_CONTENT_REACHES_THE_END, height: HEIGHT });
      await area.open(page);
      const links = navLinks(page, area);
      const current = links.and(page.locator('[aria-current="page"]'));
      await expect(current).toHaveCount(1);
      const other = links.and(page.locator(':not([aria-current="page"])')).first();
      expect(await textLeft(current)).toBeCloseTo(await textLeft(other), 0);
    });
  });
}

const LARGEST_SYSTEM_TEXT_PX = 53;
const IPAD_ON_ITS_SIDE = { width: 1180, height: 820 };

interface RowFit {
  label: string;
  height: number;
  insideTheColumn: boolean;
}

function rowFits(page: Page): Promise<RowFit[]> {
  return page.locator('#donor-nav').evaluate((nav) => {
    const column = nav.closest('.side-nav')!.getBoundingClientRect();
    return [...nav.querySelectorAll<HTMLElement>('.side-nav-link')].map((link) => {
      const row = link.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(link);
      const lines = [...range.getClientRects()].filter((line) => line.width > 1);
      return {
        label: (link.textContent ?? '').replace(/\s+/g, ' ').trim(),
        height: Math.round(row.height),
        insideTheColumn:
          row.left >= column.left - 0.5 &&
          row.right <= column.right + 0.5 &&
          lines.every((line) => line.left >= row.left - 0.5 && line.right <= row.right + 0.5),
      };
    });
  });
}

test.describe('Given a donor on an iPad on its side whose installed app shows the largest accessibility text', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'A computer-sized layout check');

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(IPAD_ON_ITS_SIDE);
    await page.addInitScript((px) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = `html { font-size: ${px}px; }`;
        document.head.append(style);
      });
    }, LARGEST_SYSTEM_TEXT_PX);
    await mockDonorApi(page, donorWithDonations);
    await rememberedDonorSession(page);
  });

  async function rowsOf(page: Page, path: string): Promise<RowFit[]> {
    await page.goto(path);
    await expect(page.locator('#donor-nav [aria-current="page"]')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    return rowFits(page);
  }

  test('when they look at the side navigation, then every row and its whole label stay inside the column', async ({
    page,
  }) => {
    const rows = await rowsOf(page, '/darce/prehled');

    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.filter((row) => !row.insideTheColumn).map((row) => row.label)).toEqual([]);
  });

  test('when they move from Můj přehled to Bankovní účty, then each row keeps its height whether it is current or not', async ({
    page,
  }) => {
    const onOverview = await rowsOf(page, '/darce/prehled');
    const onAccounts = await rowsOf(page, '/darce/ucty');

    expect(onAccounts.map((row) => row.height)).toEqual(onOverview.map((row) => row.height));
  });
});
