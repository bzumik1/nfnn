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

const PAGES_WITH_INTROS = [
  { name: 'Zálohy', path: '/sprava/zalohy', intro: 'Uložení klíče jste potvrdili' },
  { name: 'a donor card', path: PETR_DETAIL_PATH, intro: 'Sloupec Dary přiřazené podle účtu' },
  { name: 'Přehledy', path: '/sprava/prehledy', intro: null },
  { name: 'Správci', path: '/sprava/spravci', intro: 'Zadejte e-mail, kterým je dárce' },
] as const;

interface IntroLooks {
  readonly agreed: string;
  readonly intros: readonly { readonly text: string; readonly look: string }[];
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

function intros(page: Page): Locator {
  return page.locator('main .ui-card .ui-card__intro');
}

async function introLooks(page: Page): Promise<IntroLooks> {
  return page.evaluate(() => {
    const lookOf = (paragraph: Element) => {
      const style = getComputedStyle(paragraph);
      return `${style.fontSize} / ${style.lineHeight} ${style.color} up to ${style.maxInlineSize}`;
    };
    const probe = document.createElement('p');
    probe.style.setProperty('font-size', 'var(--text-md)');
    probe.style.setProperty('line-height', 'var(--leading-relaxed)');
    probe.style.setProperty('color', 'var(--color-text-soft)');
    probe.style.setProperty('max-inline-size', 'var(--measure-prose)');
    document.querySelector('main')!.append(probe);
    const agreed = lookOf(probe);
    probe.remove();
    return {
      agreed,
      intros: [...document.querySelectorAll('main .ui-card .ui-card__intro')].map((paragraph) => ({
        text: (paragraph.textContent ?? '').trim().slice(0, 40),
        look: lookOf(paragraph),
      })),
    };
  });
}

async function measureOf(intro: Locator): Promise<number> {
  return intro.evaluate((paragraph) => parseFloat(getComputedStyle(paragraph).maxInlineSize));
}

test.describe('Given an administrator in the administration on a computer', () => {
  for (const { name, path, intro } of PAGES_WITH_INTROS) {
    test(`when ${name} is shown, then every card intro has the agreed style and measure of the card intro`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await openUnlocked(page, path);
      await expect(intros(page).first()).toBeVisible();
      if (intro !== null) {
        await expect(intros(page).filter({ hasText: intro })).toBeVisible();
      }

      const { agreed, intros: looks } = await introLooks(page);
      expect(agreed).not.toContain('up to none');
      const differing = looks.filter((paragraph) => paragraph.look !== agreed);
      expect(differing, `agreed: ${agreed}`).toEqual([]);
    });
  }

  test('when the text is twice as large, then the measure of a card intro grows with it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openUnlocked(page, '/sprava/zalohy');
    const intro = intros(page).first();
    await expect(intro).toBeVisible();
    const measure = await measureOf(intro);

    await page.addStyleTag({ content: 'html { font-size: 200%; }' });

    await expect.poll(async () => (await measureOf(intro)) / measure).toBeCloseTo(2, 1);
  });
});

test.describe('Given an administrator in the administration on a phone', () => {
  test('when the months of the overview are cards, then no cell is read with its column label', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openUnlocked(page, '/sprava');
    const row = page.locator('.overview-table tbody tr').nth(1);
    await expect(row).toBeVisible();
    await expect(page.locator('.overview-table thead')).toHaveCSS('position', 'absolute');

    const cells = row.locator('td:not(:first-child)');
    await expect(cells.first()).toBeVisible();
    for (const cell of await cells.all()) {
      if (await cell.isVisible()) {
        await expect(cell).toHaveAccessibleName((await cell.innerText()).trim());
      }
    }
  });

  test('when the bank accounts of a donor are cards, then the count of gifts is not read with its column label', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openUnlocked(page, `${PETR_DETAIL_PATH}/bankovni-ucty`);
    const cell = page.locator('.ui-table--stacked tbody tr').first().locator('td').nth(2);
    await expect(cell).toBeVisible();

    await expect(cell).toHaveAccessibleName((await cell.innerText()).trim());
  });
});
