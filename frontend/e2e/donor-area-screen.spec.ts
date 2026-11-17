import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, noDonations, rememberedDonorSession } from './donor-session';

const SAFARI_TOOLBAR_HEIGHT = 100;

const TALL_SCREENS = [
  { name: 'an iPad Pro 11 upright', width: 834, height: 1194 },
  { name: 'a computer', width: 1280, height: 1000 },
];

const ISLAND_INSET = 62;
const HOME_INDICATOR_INSET = 21;

const PHONES_ON_THEIR_SIDE = [
  { name: 'an iPhone 17 Pro on its side', width: 874, height: 402 },
  { name: 'an iPhone 17 Pro Max on its side', width: 956, height: 440 },
];

async function openBankAccounts(page: Page): Promise<void> {
  await mockDonorApi(page, noDonations);
  await rememberedDonorSession(page);
  await page.goto('/darce/ucty');
  await expect(page.getByRole('heading', { level: 1, name: 'Bankovní účty' })).toBeVisible();
}

async function heightOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((element) => element.getBoundingClientRect().height);
}

async function horizontalEdges(locator: Locator): Promise<{ left: number; right: number }> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const box = range.getBoundingClientRect();
    return { left: box.left, right: box.right };
  });
}

test.describe('Given a signed-in donor on a short portal page in a browser whose screen shows less than 100vh, as Safari does above its toolbar', () => {
  for (const screen of TALL_SCREENS) {
    test(`when it opens on ${screen.name}, then the portal ends where the screen ends, so the page cannot scroll`, async ({
      page,
    }) => {
      const visible = screen.height - SAFARI_TOOLBAR_HEIGHT;
      await page.setViewportSize({ width: screen.width, height: screen.height });
      await openBankAccounts(page);
      await page.addStyleTag({ content: `:root { --full-screen-height: ${visible}px; }` });

      await expect.poll(() => heightOf(page, 'app-donor-shell')).toBeCloseTo(visible, 0);
      expect(await heightOf(page, 'app-donor-area')).toBeCloseTo(visible, 0);
    });
  }
});

test.describe('Given a signed-in donor on an iPhone held on its side, with the Dynamic Island at one edge', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'only Chromium emulates the safe-area insets; the Safari device runs show the real Dynamic Island',
  );

  for (const phone of PHONES_ON_THEIR_SIDE) {
    test(`when the portal opens on ${phone.name}, then its text and navigation stay inside the safe area`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: phone.width, height: phone.height });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', {
        insets: { left: ISLAND_INSET, right: ISLAND_INSET, bottom: HOME_INDICATOR_INSET },
      });

      await openBankAccounts(page);

      const main = page.locator('main#obsah');
      const texts = [
        main.getByRole('heading', { level: 1, name: 'Bankovní účty' }),
        main.locator('.contact-line'),
        ...(await page.getByRole('navigation', { name: 'Můj účet' }).getByRole('link').all()),
      ];
      for (const text of texts) {
        const edges = await horizontalEdges(text);
        expect(edges.left).toBeGreaterThanOrEqual(ISLAND_INSET);
        expect(edges.right).toBeLessThanOrEqual(phone.width - ISLAND_INSET);
      }
    });
  }
});
