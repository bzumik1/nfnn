import { Page } from '@playwright/test';
import { mockPublicContent, servePaymentDetails } from './baseline/screen-mocks';
import { expect, test } from './fixtures';

const LARGEST_SYSTEM_TEXT_PX = 53;
const PHONES = [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 320, height: 568 },
];

interface LabelPlace {
  label: string;
  insideItsTab: boolean;
  insideTheBar: boolean;
}

function labelPlaces(page: Page): Promise<LabelPlace[]> {
  return page.getByRole('navigation', { name: 'Hlavní sekce' }).evaluate((nav) => {
    const bar = nav.getBoundingClientRect();
    return [...nav.querySelectorAll<HTMLElement>('.tab')].map((tab) => {
      const box = tab.getBoundingClientRect();
      const label = tab.querySelector<HTMLElement>('.tab-label')!;
      const range = document.createRange();
      range.selectNodeContents(label.firstChild ?? label);
      const text = range.getBoundingClientRect();
      return {
        label: label.textContent!.replace(/\s+/g, ' ').trim(),
        insideItsTab: text.left >= box.left - 0.5 && text.right <= box.right + 0.5,
        insideTheBar: text.left >= bar.left - 0.5 && text.right <= bar.right + 0.5,
      };
    });
  });
}

for (const phone of PHONES) {
  test.describe(`Given a visitor on a ${phone.width} pt phone whose installed app shows the largest accessibility text`, () => {
    test.use({ viewport: phone, hasTouch: true, isMobile: true });

    test.beforeEach(async ({ page }) => {
      await mockPublicContent(page);
      await servePaymentDetails(page);
    });

    test('when they look at the tab bar, then every tab label is whole inside its tab and inside the bar', async ({
      page,
    }) => {
      await page.goto('/prispet');
      await page.addStyleTag({
        content: `html { font-size: ${LARGEST_SYSTEM_TEXT_PX}px !important; }`,
      });
      await page.evaluate(() => document.fonts.ready);

      const tabs = page.getByRole('navigation', { name: 'Hlavní sekce' }).getByRole('link');
      await expect(tabs).toHaveText(['O nás', 'Aktuality', 'Pomáháme', 'Přispět']);

      await expect
        .poll(() => labelPlaces(page))
        .toEqual(
          ['O nás', 'Aktuality', 'Pomáháme', 'Přispět'].map((label) => ({
            label,
            insideItsTab: true,
            insideTheBar: true,
          })),
        );
    });
  });
}
