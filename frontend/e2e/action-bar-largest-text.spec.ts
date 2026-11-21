import { Locator, Page } from '@playwright/test';
import {
  donorWithDonations,
  mockAdministration,
  rememberedSession,
  serveEmptyAdministrationCopy,
} from './baseline/screen-mocks';
import { mockDonorApi, whenAdministrationCopied } from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

const LARGEST_SYSTEM_TEXT_PX = 53;
const NARROW_PHONE = { width: 375, height: 667 };
const LARGEST_SHARE_OF_THE_SCREEN = 0.5;

async function showLargestSystemText(page: Page): Promise<void> {
  await page.addInitScript((px) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `html { font-size: ${px}px; }`;
      document.head.append(style);
    });
  }, LARGEST_SYSTEM_TEXT_PX);
}

async function openUnlockedAdministration(page: Page, path: string): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await serveEmptyAdministrationCopy(page);
  await rememberedSession(page);
  const copied = whenAdministrationCopied(page);
  await page.goto(path);
  await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
  await copied();
}

function labelsOutsideTheirButton(bar: Locator): Promise<string[]> {
  return bar.evaluate((element) =>
    [...element.querySelectorAll<HTMLElement>('.ui-button')].flatMap((button) => {
      const box = button.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(button);
      const outside = [...range.getClientRects()].some(
        (line) =>
          line.width > 0 &&
          (line.left < box.left - 0.5 ||
            line.right > box.right + 0.5 ||
            line.top < box.top - 0.5 ||
            line.bottom > box.bottom + 0.5),
      );
      return outside ? [button.textContent!.trim()] : [];
    }),
  );
}

test.describe(`Given an administrator on an iPhone ${NARROW_PHONE.width} pt wide whose installed app shows the largest accessibility text`, () => {
  test.use({ viewport: NARROW_PHONE });

  test.beforeEach(async ({ page }) => {
    await showLargestSystemText(page);
  });

  test('when they start a new article, then the sticky action bar takes at most half of the screen and every button keeps its label inside it', async ({
    page,
  }) => {
    await openUnlockedAdministration(page, '/sprava/aktuality/nova');
    const bar = page.locator('.ui-action-bar');
    await expect(bar.getByRole('button', { name: 'Uložit koncept' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Uložit a zveřejnit' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(NARROW_PHONE.height * LARGEST_SHARE_OF_THE_SCREEN);
    expect(await labelsOutsideTheirButton(bar)).toEqual([]);
  });
});
