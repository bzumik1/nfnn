import { Page } from '@playwright/test';
import {
  article,
  donorWithDonations,
  mockAdministration,
  project,
  rememberedSession,
  serveEmptyAdministrationCopy,
} from './baseline/screen-mocks';
import { mockDonorApi, whenAdministrationCopied } from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

async function openEditor(page: Page, path: string, width: number): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await serveEmptyAdministrationCopy(page);
  await rememberedSession(page);
  await page.setViewportSize({ width, height: 800 });
  const copied = whenAdministrationCopied(page);
  await page.goto(path);
  await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
  await copied();
}

const EDITORS = [
  { name: 'the news editor', path: `/sprava/aktuality/${article.id}` },
  { name: 'the project editor', path: `/sprava/projekty/${project.id}` },
];

test.describe('Given an administrator editing saved content', () => {
  for (const editor of EDITORS) {
    for (const width of [390, 1280]) {
      test(`when ${editor.name} is scrolled to its end ${width} px wide, then Smazání follows the content card at the card spacing and the save bar stands after it`, async ({
        page,
      }) => {
        await openEditor(page, editor.path, width);
        const deleteCard = page.locator('.delete-card');
        await expect(deleteCard).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

        await expect
          .poll(() =>
            page.evaluate(() => {
              const card = document.querySelector('form > .ui-card')!;
              const content = card.getBoundingClientRect();
              const remove = document.querySelector('.delete-card')!.getBoundingClientRect();
              const bar = document.querySelector('.editor-bar')!.getBoundingClientRect();
              return {
                gapIsTheCardSpacing:
                  Math.abs(
                    remove.top - content.bottom - parseFloat(getComputedStyle(card).marginBottom),
                  ) < 0.5,
                barAfterDeleteCard: bar.top >= remove.bottom,
              };
            }),
          )
          .toEqual({ gapIsTheCardSpacing: true, barAfterDeleteCard: true });
      });
    }
  }
});
