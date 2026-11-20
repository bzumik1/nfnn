import type { Page } from '@playwright/test';
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
const WIDTHS = [900, 1000, 1280] as const;
const TOLERANCE = 0.5;

interface TablePage {
  readonly name: string;
  readonly path: string;
  readonly administration: boolean;
  readonly open?: (page: Page) => Promise<void>;
}

const PAGES: readonly TablePage[] = [
  { name: 'Platby', path: '/sprava/platby', administration: true },
  {
    name: 'Přiřazené platby',
    path: '/sprava/platby',
    administration: true,
    open: (page) => page.getByRole('button', { name: 'Přiřazené', exact: true }).click(),
  },
  { name: 'Dárci', path: '/sprava/darci', administration: true },
  { name: 'karta dárce', path: PETR_DETAIL_PATH, administration: true },
  { name: 'Starší symboly', path: '/sprava/starsi-symboly', administration: true },
  { name: 'Historie', path: '/sprava/historie', administration: true },
  { name: 'přehled', path: '/sprava', administration: true },
  { name: 'Projekty', path: '/sprava/projekty', administration: true },
  { name: 'Aktuality', path: '/sprava/aktuality', administration: true },
  { name: 'Můj přehled', path: '/darce/prehled', administration: false },
  { name: 'Moje dary', path: '/darce/dary', administration: false },
  { name: 'Potvrzení o daru', path: '/darce/potvrzeni', administration: false },
];

interface Overflow {
  readonly what: string;
  readonly by: number;
}

async function openPage(page: Page, target: TablePage): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await rememberedSession(page);
  if (target.administration) {
    await mockAdministration(page);
    await serveEmptyAdministrationCopy(page);
    const copied = whenAdministrationCopied(page);
    await page.goto(target.path);
    await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
    await copied();
  } else {
    await page.goto(target.path);
  }
  await target.open?.(page);
  await expect(page.locator('main table').first()).toBeVisible();
}

async function overflowsOfTheirCards(page: Page): Promise<Overflow[]> {
  return page.locator('main').evaluate((main, tolerance) => {
    const found: { what: string; by: number }[] = [];
    for (const table of Array.from(main.querySelectorAll('table'))) {
      const card = table.closest('.ui-card');
      if (card === null) {
        continue;
      }
      const edge = card.getBoundingClientRect();
      const inner = {
        left: edge.left + card.clientLeft,
        right: edge.left + card.clientLeft + card.clientWidth,
      };
      const measured = [
        { what: 'table', box: table.getBoundingClientRect() },
        ...Array.from(table.querySelectorAll('button, a')).map((control) => ({
          what: `${control.tagName.toLowerCase()} "${(control.textContent ?? '').trim()}"`,
          box: control.getBoundingClientRect(),
        })),
      ];
      for (const { what, box } of measured) {
        if (box.width === 0) {
          continue;
        }
        const by = Math.max(inner.left - box.left, box.right - inner.right);
        if (by > tolerance) {
          found.push({ what, by: Math.round(by * 10) / 10 });
        }
      }
    }
    return found;
  }, TOLERANCE);
}

async function pansSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Given a page whose table sits in a card on a computer', () => {
  for (const target of PAGES) {
    test(`when ${target.name} opens at 900, 1000 and 1280 px, then its table and every action stay wholly inside the card`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: WIDTHS[WIDTHS.length - 1], height: HEIGHT });
      await openPage(page, target);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        await expect
          .poll(() => overflowsOfTheirCards(page), { message: `${width} px` })
          .toEqual([]);
        expect(await pansSideways(page)).toBe(false);
      }
    });
  }

  test('when the older symbols open at 1280 px with 200 % text, then the answers and their actions stay inside the card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: HEIGHT });
    await openPage(
      page,
      PAGES.find(({ path }) => path === '/sprava/starsi-symboly')!,
    );
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

    await expect.poll(() => overflowsOfTheirCards(page)).toEqual([]);
    expect(await pansSideways(page)).toBe(false);
  });

  test('when the older symbols fold into cards at 900 px, then a screen reader still finds a table with its cells', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: HEIGHT });
    await openPage(
      page,
      PAGES.find(({ path }) => path === '/sprava/starsi-symboly')!,
    );

    const table = page.getByRole('main').getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead')).toHaveCSS('position', 'absolute');
    await expect(table.getByRole('cell').first()).toBeVisible();
    await expect(table.getByRole('row')).not.toHaveCount(0);
  });
});
