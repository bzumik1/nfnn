import { Page } from '@playwright/test';
import {
  donorWithDonations,
  mockAdministration,
  rememberedSession,
  serveRecentDonors,
} from './baseline/screen-mocks';
import { mockDonorApi, whenAdministrationCopied } from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

const LARGEST_SYSTEM_TEXT_PX = 53;
const NARROW_PHONE = { width: 375, height: 667 };

interface RowShape {
  name: string;
  noteBesideFigures: boolean;
  dateLikeNote: boolean;
  outsideTheCard: string[];
}

async function openRecentDonors(page: Page): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await serveRecentDonors(page);
  await rememberedSession(page);
  const copied = whenAdministrationCopied(page);
  await page.goto('/sprava/darci');
  await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
  await copied();
  await expect(page.locator('.donor-rows .ui-list__row').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

function rowShapes(page: Page): Promise<RowShape[]> {
  return page.locator('.donor-rows').evaluate((list) => {
    const card = list.closest('.ui-card')!.getBoundingClientRect();
    return [...list.querySelectorAll<HTMLElement>('.ui-list__row')].map((row) => {
      const part = (name: string) => row.querySelector<HTMLElement>(`.ui-list__${name}`);
      const title = part('title')!;
      const meta = part('meta')!;
      const value = part('value');
      const state = part('state');
      const besideIt = (element: HTMLElement | null) => {
        if (!element) {
          return false;
        }
        const box = element.getBoundingClientRect();
        return [title, meta].some((text) => {
          const own = text.getBoundingClientRect();
          return own.right > box.left && own.left < box.right;
        });
      };
      const outsideTheCard = [...row.querySelectorAll<HTMLElement>('*')]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 1 && (box.left < card.left - 0.5 || box.right > card.right + 0.5);
        })
        .map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim());
      const noteStyle = getComputedStyle(meta);
      const dateStyle = state ? getComputedStyle(state) : noteStyle;
      return {
        name: title.textContent!.trim(),
        noteBesideFigures: besideIt(value) || besideIt(state),
        dateLikeNote:
          dateStyle.fontSize === noteStyle.fontSize && dateStyle.color === noteStyle.color,
        outsideTheCard,
      };
    });
  });
}

test.describe(`Given an administrator on an iPhone ${NARROW_PHONE.width} pt wide looking at the donors who gave last`, () => {
  test.use({ viewport: NARROW_PHONE });

  test('when the text is at its default size, then the name and the note take whole lines above the amount and the date, and the date reads as a note', async ({
    page,
  }) => {
    await openRecentDonors(page);

    const rows = await rowShapes(page);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row, row.name).toMatchObject({ noteBesideFigures: false, dateLikeNote: true });
    }
  });

  test('when the installed app shows the largest accessibility text, then nothing of a row, its e-mail and its tags reaches past the card', async ({
    page,
  }) => {
    await page.addInitScript((px) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = `html { font-size: ${px}px; }`;
        document.head.append(style);
      });
    }, LARGEST_SYSTEM_TEXT_PX);
    await openRecentDonors(page);

    const rows = await rowShapes(page);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row, row.name).toMatchObject({ noteBesideFigures: false, outsideTheCard: [] });
    }
  });
});
