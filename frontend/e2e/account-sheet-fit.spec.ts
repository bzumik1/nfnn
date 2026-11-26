import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  bankAccountItem,
  mockDonorApi,
  openAccountItem,
  showAccountList,
  signIn,
} from './donor-session';

const FACTS_MAXIMUM_HEIGHT = 300;
const SHORT_PHONE_HEIGHT = 420;

async function signInOnPhone(page: Page, width: number, height = 800): Promise<void> {
  await mockDonorApi(page);
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-accounts',
    (route) => route.fulfill({ json: { items: [bankAccountItem()] } }),
  );
  await signIn(page);
  await page.setViewportSize({ width, height });
}

test.describe('Given a signed-in donor adding a bank account on a phone', () => {
  for (const width of [375, 390]) {
    test(`when Přidat bankovní účet opens ${width} px wide, then the payment facts keep their natural height with no gap between them wider than the facts' own`, async ({
      page,
    }) => {
      await signInOnPhone(page, width);
      await openAccountItem(page, 'Bankovní účty');
      await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();

      const facts = page
        .getByRole('dialog', { name: 'Přidat bankovní účet' })
        .locator('.add-account-bank');
      await expect(facts.locator('.add-account-row')).toHaveCount(4);
      const measured = await facts.evaluate((list) => {
        const rows = Array.from(list.querySelectorAll('.add-account-row'));
        const valueTop = (row: Element) => {
          const range = document.createRange();
          range.selectNodeContents(row.querySelector('.bank-value')!);
          return Math.min(...Array.from(range.getClientRects(), (rect) => rect.top));
        };
        const lineCount = (row: Element) => {
          const range = document.createRange();
          range.selectNodeContents(row.querySelector('.bank-value')!);
          return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
        };
        return {
          oneLineValueHeights: rows
            .filter((row) => lineCount(row) === 1)
            .map((row) => row.querySelector('dd')!.getBoundingClientRect().height),
          height: list.getBoundingClientRect().height,
          allowedGap: parseFloat(getComputedStyle(list).rowGap),
          labelToValue: rows.map(
            (row) => valueTop(row) - row.querySelector('dt')!.getBoundingClientRect().bottom,
          ),
          gaps: rows
            .slice(1)
            .map(
              (row, index) =>
                row.querySelector('dt')!.getBoundingClientRect().top -
                rows[index].getBoundingClientRect().bottom,
            ),
        };
      });

      expect(measured.height).toBeLessThanOrEqual(FACTS_MAXIMUM_HEIGHT);
      expect(measured.oneLineValueHeights.length).toBeGreaterThan(1);
      expect(
        Math.max(...measured.oneLineValueHeights) - Math.min(...measured.oneLineValueHeights),
      ).toBeLessThanOrEqual(1);
      for (const gap of measured.labelToValue) {
        expect(Math.abs(gap - measured.labelToValue[0])).toBeLessThanOrEqual(1);
        expect(gap).toBeLessThanOrEqual(measured.allowedGap + 1);
      }
      for (const gap of measured.gaps) {
        expect(gap).toBeLessThanOrEqual(measured.allowedGap + 1);
      }
    });
  }
});

test.describe('Given a signed-in donor on a phone whose home-screen app sets a 17 px root', () => {
  test('when Údaje a zabezpečení opens in the account sheet 375 px wide, then every row title of Přihlášení a zabezpečení keeps to one line beside its button', async ({
    page,
  }) => {
    await signInOnPhone(page, 375);
    await page.addStyleTag({ content: 'html { font-size: 17px; }' });
    await openAccountItem(page, 'Údaje a zabezpečení');

    const titles = page.locator('.account-row dt');
    await expect(titles).toHaveText([
      'E-mail',
      'Heslo',
      'Dvoufaktorové ověření',
      'Přístupové klíče',
    ]);
    const lines = await titles.evaluateAll((found) =>
      found.map((title) => {
        const range = document.createRange();
        range.selectNodeContents(title);
        return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
      }),
    );
    expect(lines).toEqual([1, 1, 1, 1]);
  });
});

function scrollTopAfterTwoFrames(panel: Locator): Promise<number> {
  return panel.evaluate(
    (element) =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(element.scrollTop))),
      ),
  );
}

const LARGEST_SYSTEM_TEXT_PX = 53;
const SCROLLED_TO = 1500;
const UNDER_THE_HEAD = 20;

async function showLargestSystemText(page: Page): Promise<void> {
  await page.addInitScript((px) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `html { font-size: ${px}px; }`;
      document.head.append(style);
    });
  }, LARGEST_SYSTEM_TEXT_PX);
}

test.describe('Given a signed-in donor whose phone shows the largest accessibility text and who has scrolled Údaje a zabezpečení in the account sheet 390 px wide', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await showLargestSystemText(page);
    await mockDonorApi(page);
    await signIn(page);
    await openAccountItem(page, 'Údaje a zabezpečení');
    await expect(page.locator('.first-sync')).toHaveCount(0, { timeout: 10_000 });
  });

  const sheetOf = (page: Page) => page.getByRole('dialog', { name: 'Údaje a zabezpečení' });
  const panelOf = (page: Page) => sheetOf(page).locator(':scope > .dialog-panel');

  async function scrollTo(panel: Locator, top: number): Promise<void> {
    await expect(async () => {
      await panel.evaluate((element, to) => element.scrollTo(0, to), top);
      expect(await scrollTopAfterTwoFrames(panel)).toBe(top);
    }).toPass();
  }

  test('when each control of the sheet head takes the focus through focus(), then the sheet stays where it was scrolled', async ({
    page,
  }) => {
    const head = sheetOf(page).locator('app-sheet-head');
    const panel = panelOf(page);
    await expect(head).toBeVisible();
    await scrollTo(panel, SCROLLED_TO);

    for (const control of [
      head.getByRole('button', { name: 'Zpět', exact: true }),
      head.getByRole('heading', { level: 2 }),
      head.getByRole('button', { name: 'Zavřít', exact: true }),
    ]) {
      await control.evaluate((element: HTMLElement) => element.focus());
      await expect(control).toBeFocused();
      expect(await scrollTopAfterTwoFrames(panel)).toBe(SCROLLED_TO);
    }
  });

  test('when a control 20 px under the head takes the focus through focus(), as a hardware keyboard moves it, then it ends below the head', async ({
    page,
  }) => {
    const panel = panelOf(page);
    await expect(sheetOf(page).locator('app-sheet-head')).toBeVisible();
    await scrollTo(panel, SCROLLED_TO);
    const marked = await panel.evaluate((element, under) => {
      const headBottom = element.querySelector('app-sheet-head')!.getBoundingClientRect().bottom;
      const panelBottom = element.getBoundingClientRect().bottom;
      const control = Array.from(element.querySelectorAll<HTMLElement>('button, a[href]')).find(
        (candidate) => {
          const box = candidate.getBoundingClientRect();
          return (
            candidate.closest('app-sheet-head') === null &&
            box.height > 0 &&
            box.top > headBottom &&
            box.bottom < panelBottom
          );
        },
      );
      if (control === undefined) {
        return false;
      }
      element.scrollBy(0, control.getBoundingClientRect().top - (headBottom - under));
      control.setAttribute('data-under-head', '');
      return true;
    }, UNDER_THE_HEAD);
    expect(marked).toBe(true);
    const control = panel.locator('[data-under-head]');
    await scrollTopAfterTwoFrames(panel);

    await control.evaluate((element: HTMLElement) => element.focus());

    await expect(control).toBeFocused();
    await expect(async () => {
      const place = await panel.evaluate((element) => ({
        top: element.querySelector('[data-under-head]')!.getBoundingClientRect().top,
        headBottom: element.querySelector('app-sheet-head')!.getBoundingClientRect().bottom,
      }));
      expect(place.top).toBeGreaterThanOrEqual(place.headBottom);
    }).toPass();
  });
});

test.describe('Given a signed-in donor with the account sheet open on a phone', () => {
  test('when the list shows, then the name row with the avatar sets its avatar and chevron on the edges of the rows under it', async ({
    page,
  }) => {
    await signInOnPhone(page, 390);
    const sheet = await showAccountList(page);

    const edges = await sheet.evaluate((element) => {
      const box = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
      return {
        avatar: box('.account-profile .account-initials').left,
        chevron: box('.account-profile .ui-list__chevron').right,
        title: box('.account-nav .ui-list__title').left,
        rowChevron: box('.account-nav .ui-list__chevron').right,
      };
    });

    expect(Math.abs(edges.avatar - edges.title)).toBeLessThanOrEqual(1);
    expect(Math.abs(edges.chevron - edges.rowChevron)).toBeLessThanOrEqual(1);
  });

  test('when each section, taller than the sheet on a short phone, is scrolled to its end, then every section leaves the same space under its last card', async ({
    page,
  }) => {
    await signInOnPhone(page, 390, SHORT_PHONE_HEIGHT);
    const spaces: Record<string, number> = {};

    for (const section of [
      'Můj přehled',
      'Moje dary',
      'Potvrzení o daru',
      'Bankovní účty',
      'Údaje a zabezpečení',
    ]) {
      await openAccountItem(page, section);
      const panel = page.getByRole('dialog', { name: section }).locator(':scope > .dialog-panel');
      await expect(panel.locator('.account-section-body .ui-card').first()).toBeVisible();
      const measured = await panel.evaluate((element) => {
        element.scrollTo(0, element.scrollHeight);
        const cards = Array.from(
          element.querySelectorAll('.account-section-body .ui-card'),
          (card) => card.getBoundingClientRect(),
        ).filter((box) => box.height > 0);
        const lastCardBottom = Math.max(...cards.map((box) => box.bottom));
        const contentEnd =
          element.getBoundingClientRect().top +
          element.clientTop +
          element.scrollHeight -
          element.scrollTop;
        return {
          overflow: element.scrollHeight - element.clientHeight,
          space: Math.round(contentEnd - lastCardBottom),
        };
      });
      expect(measured.overflow, `${section} overflows the sheet`).toBeGreaterThan(0);
      spaces[section] = measured.space;
    }

    const first = spaces['Můj přehled'];
    for (const [section, space] of Object.entries(spaces)) {
      expect(Math.abs(space - first), `${section}: ${space} against ${first}`).toBeLessThanOrEqual(
        1,
      );
    }
  });
});
