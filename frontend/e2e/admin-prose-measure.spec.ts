import type { Locator, Page } from '@playwright/test';
import {
  donorWithDonations,
  mockAdministration,
  rememberedSession,
  serveEmptyAdministrationCopy,
} from './baseline/screen-mocks';
import { mockDonorApi, whenAdministrationCopied } from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

const COMPUTER_WIDTHS = [1280, 1920];
const MOST_CHARACTERS_A_LINE = 80;

const PROSE = [
  { name: 'the page intro of Zálohy', path: '/sprava/zalohy', selector: 'main .ui-page-intro' },
  { name: 'the card intro of Správci', path: '/sprava/spravci', selector: 'main .grant-intro' },
  { name: 'the hint of the founders’ note', path: '/sprava/lide', selector: '#founders-note-hint' },
  {
    name: 'the row description of the overview',
    path: '/sprava',
    selector: '#admin-overview-hint',
  },
] as const;

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

async function charactersPerLine(prose: Locator): Promise<number[]> {
  return prose.evaluate((element) => {
    const lines: number[] = [];
    let lineTop: number | null = null;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      for (let index = 0; index < text.length; index++) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const box = range.getClientRects()[0];
        if (box === undefined || box.width === 0) {
          continue;
        }
        if (lineTop === null || Math.abs(box.top - lineTop) > box.height / 2) {
          lines.push(0);
          lineTop = box.top;
        }
        lines[lines.length - 1]++;
      }
    }
    return lines;
  });
}

for (const width of COMPUTER_WIDTHS) {
  test.describe(`Given an administrator in the administration in a window ${width} px wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    for (const { name, path, selector } of PROSE) {
      test(`when ${name} is shown, then none of its lines runs over ${MOST_CHARACTERS_A_LINE} characters`, async ({
        page,
      }) => {
        await openUnlocked(page, path);
        const prose = page.locator(selector).first();
        await expect(prose).toBeVisible();

        const lines = await charactersPerLine(prose);

        expect(lines.length).toBeGreaterThan(1);
        expect(Math.max(...lines), `characters a line: ${lines.join(', ')}`).toBeLessThanOrEqual(
          MOST_CHARACTERS_A_LINE,
        );
      });
    }
  });
}
