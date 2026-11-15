import type { Locator } from '@playwright/test';
import {
  administrator,
  mockDonorApi,
  openAccountItem,
  session,
  whenAdministrationCopied,
} from './donor-session';
import { expect, test } from './fixtures';

const LIST_TITLE = 'Co je u nás nového';
const article = {
  id: '0199f3e0-0000-7000-8000-00000000c021',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec.',
  coverImage: null,
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

const STATUS_BARS = [
  { where: 'in Safari', statusBar: 0 },
  { where: 'in the app on the home screen of an iPhone 18 Pro', statusBar: 78 },
];

interface SheetParts {
  sheet: Locator;
  back: Locator;
  title: Locator;
  close: Locator;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function sheetGeometry(parts: SheetParts) {
  await expect(parts.title).toBeVisible();
  const boxOf = async (locator: Locator): Promise<Box> => {
    const box = await locator.boundingBox();
    expect(box, 'the part is laid out').not.toBeNull();
    return {
      x: Math.round(box!.x),
      y: Math.round(box!.y),
      width: Math.round(box!.width),
      height: Math.round(box!.height),
    };
  };
  await expect
    .poll(
      () =>
        parts.sheet.evaluate(
          (sheet) =>
            [...sheet.getAnimations(), ...(sheet.closest('dialog')?.getAnimations() ?? [])].filter(
              (animation) => animation.playState === 'running',
            ).length,
        ),
      { message: 'the sheet has settled' },
    )
    .toBe(0);
  const sheet = await boxOf(parts.sheet);
  const title = await boxOf(parts.title);
  return {
    sheet: { x: sheet.x, y: sheet.y, width: sheet.width },
    back: await boxOf(parts.back),
    titleTop: title.y,
    close: await boxOf(parts.close),
  };
}

test.describe('Given an administrator on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) =>
        route.fulfill({ json: { items: [article], page: 0, size: 10, total: 1, hasMore: false } }),
    );
    await page.addInitScript(() => localStorage.setItem('nfnn.donor-session', '1'));
  });

  test('when they open Správa from the account sheet over the news, go a section deeper and press Zavřít, then the news is back', async ({
    page,
  }) => {
    const copied = whenAdministrationCopied(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
    await openAccountItem(page, 'Správa');
    await expect(page).toHaveURL(/\/sprava$/);
    await copied();

    const head = page.getByRole('banner');
    await expect(head.getByRole('button', { name: 'Zpět' })).toBeVisible();
    await expect(head.getByRole('button', { name: 'Účet' })).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Sekce správy' })
      .getByRole('link', { name: /Lidé fondu, správci, zálohy/ })
      .click();
    await expect(page).toHaveURL(/\/sprava\/vice$/);

    await head.getByRole('button', { name: 'Zavřít' }).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeFocused();
  });

  test('when they reload a page deeper in Správa opened over the news and press Zavřít, then the news is still where it leads', async ({
    page,
  }) => {
    const copied = whenAdministrationCopied(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
    await openAccountItem(page, 'Správa');
    await copied();
    await page
      .getByRole('navigation', { name: 'Sekce správy' })
      .getByRole('link', { name: /Lidé fondu, správci, zálohy/ })
      .click();
    await expect(page).toHaveURL(/\/sprava\/vice$/);

    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Občas a pro technika' }),
    ).toBeVisible();
    await page.getByRole('banner').getByRole('button', { name: 'Zavřít' }).click();

    await expect(page).toHaveURL('/aktuality');
  });

  for (const { where, statusBar } of STATUS_BARS) {
    test(`when they open Můj přehled and then Správa from the account sheet ${where}, then both stand in the same sheet under the same head`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/aktuality');
      await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
      await page.addStyleTag({ content: `:root { --safe-area-top: ${statusBar}px; }` });

      await openAccountItem(page, 'Můj přehled');
      const section = page.getByRole('dialog', { name: 'Můj přehled' });
      const inSection = await sheetGeometry({
        sheet: section.locator('.dialog-panel'),
        back: section.getByRole('button', { name: 'Zpět' }),
        title: section.getByRole('heading', { level: 2, name: 'Můj přehled' }),
        close: section.getByRole('button', { name: 'Zavřít' }),
      });
      await section.getByRole('button', { name: 'Zpět' }).click();
      const copied = whenAdministrationCopied(page);
      await page
        .getByRole('dialog', { name: 'Účet' })
        .getByRole('link', { name: /^Správa/ })
        .click();
      await expect(page).toHaveURL(/\/sprava$/);
      await copied();

      const head = page.getByRole('banner');
      const inAdministration = await sheetGeometry({
        sheet: page.locator('.admin-sheet'),
        back: head.getByRole('button', { name: 'Zpět' }),
        title: head.getByText('Správa', { exact: true }),
        close: head.getByRole('button', { name: 'Zavřít' }),
      });

      expect(inSection.sheet.y).toBeCloseTo(statusBar, 0);
      expect(inAdministration).toEqual(inSection);
      const pageTitle = page.getByRole('heading', { level: 1, name: 'Správa' });
      await expect(pageTitle).toHaveCount(1);
      expect((await pageTitle.boundingBox())?.height ?? 0).toBeLessThanOrEqual(1);
    });
  }

  test('when Správa scrolls in the app on the home screen, then the head stays at the top edge of the sheet and nothing of the page shows under the status bar', async ({
    page,
  }) => {
    const copied = whenAdministrationCopied(page);
    await page.goto('/sprava');
    await copied();
    await page.addStyleTag({ content: ':root { --safe-area-top: 78px; }' });
    const head = page.getByRole('banner');
    const before = (await head.boundingBox())!;

    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    expect((await head.boundingBox())!.y).toBe(before.y);
    const underStatusBar = await page.evaluate(() =>
      [20, 60, 195, 330, 370].map(
        (x) => document.elementFromPoint(x, 39)?.closest('.admin-page, app-side-nav') !== null,
      ),
    );
    expect(underStatusBar).toEqual([false, false, false, false, false]);
  });

  test('when Správa opened by its address and they press Zavřít, then the site opens at home', async ({
    page,
  }) => {
    await page.goto('/sprava/vice');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Občas a pro technika' }),
    ).toBeVisible();

    await page.getByRole('banner').getByRole('button', { name: 'Zavřít' }).click();

    await expect(page).toHaveURL('/');
  });
});
