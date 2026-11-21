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

interface Prose {
  readonly name: string;
  readonly path: string;
  readonly selector: string;
  readonly openedBy?: string;
}

const PROSE: readonly Prose[] = [
  { name: 'the page intro of Zálohy', path: '/sprava/zalohy', selector: 'main .ui-page-intro' },
  { name: 'the card intro of Správci', path: '/sprava/spravci', selector: 'main .grant-intro' },
  {
    name: 'the hint of the founders’ note',
    path: '/sprava/lide-fondu',
    selector: '#founders-note-hint',
  },
  {
    name: 'the hand-written hint of the e-mails only for the administration',
    path: '/sprava/lide-fondu',
    selector: '.emails .field-hint',
    openedBy: 'Přidat osobu',
  },
  {
    name: 'the row description of the overview',
    path: '/sprava',
    selector: '#admin-overview-hint',
  },
];

async function servePeopleOfTheFoundation(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/admin/content/people',
    (route) =>
      route.fulfill({
        json: {
          members: [],
          note: null,
          footnote: null,
          noteVersion: '6a0c1e3f9b2d4875',
          footnoteVersion: '1f8e2d7c4b6a9035',
        },
      }),
  );
}

async function openUnlocked(page: Page, path: string): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await servePeopleOfTheFoundation(page);
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

    for (const { name, path, selector, openedBy } of PROSE) {
      test(`when ${name} is shown, then none of its lines runs over ${MOST_CHARACTERS_A_LINE} characters`, async ({
        page,
      }) => {
        await openUnlocked(page, path);
        if (openedBy !== undefined) {
          await page.getByRole('button', { name: openedBy }).click();
        }
        const prose = page.locator(selector).first();
        await expect(prose).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        const lines = await charactersPerLine(prose);

        expect(lines.length).toBeGreaterThan(1);
        expect(Math.max(...lines), `characters a line: ${lines.join(', ')}`).toBeLessThanOrEqual(
          MOST_CHARACTERS_A_LINE,
        );
      });
    }

    test('when the news editor refuses a photo, then its error stays within the measure', async ({
      page,
    }) => {
      await openUnlocked(page, '/sprava/aktuality/nova');
      await page.getByLabel('Nahrát fotku').setInputFiles({
        name: 'koncert.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('not a photo'),
      });
      const error = page.locator('#news-image-error');
      await expect(error).toHaveText('Vyberte prosím fotku ve formátu JPEG, PNG nebo WebP.');
      await page.evaluate(() => document.fonts.ready);

      const { width, measure } = await error.evaluate((element) => {
        const probe = document.createElement('span');
        probe.style.display = 'block';
        probe.style.inlineSize = 'var(--measure-prose)';
        element.append(probe);
        const measured = {
          width: element.getBoundingClientRect().width,
          measure: probe.getBoundingClientRect().width,
        };
        probe.remove();
        return measured;
      });
      const lines = await charactersPerLine(error);

      expect(width).toBeLessThanOrEqual(measure + 0.5);
      expect(Math.max(...lines), `characters a line: ${lines.join(', ')}`).toBeLessThanOrEqual(
        MOST_CHARACTERS_A_LINE,
      );
    });
  });
}
