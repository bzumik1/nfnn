import { Locator, Page } from '@playwright/test';
import { mockDonorApi, openDonorSection } from './donor-session';
import { expect, test } from './fixtures';
import {
  ISSUING,
  donations as receiptDonations,
  openReceiptsAfterSignIn,
} from './receipt-donations';
import { answerReceiptIssuing, RECEIPT_ISSUING_URL } from './receipt-issuing';

const LARGEST_ROOT = '53px';

const YEARLY_PLACES = [
  {
    name: 'a year on Moje dary',
    section: 'Moje dary',
    selector: '.gift-year-head',
    row: (page: Page) => page.locator('.gift-year-head').last(),
  },
  {
    name: 'a year on Potvrzení o daru',
    section: 'Potvrzení o daru',
    selector: '.year-row',
    row: (page: Page) => page.locator('.year-row').last(),
  },
];

async function placement(row: Locator, button: Locator): Promise<number[]> {
  const rowBox = (await row.boundingBox())!;
  const buttonBox = (await button.boundingBox())!;
  return [rowBox.height, buttonBox.x, buttonBox.y, buttonBox.width].map((value) =>
    Math.round(value),
  );
}

test.describe('Given a donor on a phone 390 pt wide', () => {
  test.skip(
    ({ browserName }) => browserName !== 'webkit',
    'donor-dashboard.spec.ts runs this pose in Chromium with the other PDF places',
  );

  for (const place of YEARLY_PLACES) {
    test(`when the PDF of ${place.name} takes long to prepare, then its row keeps its height, the button stays put and Tab meets Zrušit after the button`, async ({
      page,
    }) => {
      await mockDonorApi(page, receiptDonations);
      const synced = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/donations/me/sync',
      );
      await page.route(
        (url) => url.pathname === RECEIPT_ISSUING_URL,
        () => new Promise<void>(() => undefined),
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      await openReceiptsAfterSignIn(page);
      await openDonorSection(page, place.section);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('navigation', { name: 'Můj účet' })).toHaveCount(0);
      const row = place.row(page);
      const button = row.locator('.yearly-pdf');
      await expect(button).toBeVisible();
      await synced;
      await expect(page.locator('.first-sync')).toHaveCount(0);
      await expect(page.locator('.page-fade--leaving')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await expect(async () => {
        await button.evaluate((element) => element.scrollIntoView({ block: 'center' }));
        const centred = await page.evaluate(() => window.scrollY);
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        expect(await page.evaluate(() => window.scrollY)).toBe(centred);
      }).toPass();
      await page.clock.install();
      const resting = await placement(row, button);

      await button.click();
      const status = row.getByRole('status');
      await expect(status).toHaveText('Připravujeme údaje potvrzení…');
      expect(await placement(row, button)).toEqual(resting);

      await page.clock.fastForward(8000);
      const cancel = row.getByRole('button', { name: 'Zrušit' });
      await expect(cancel).toBeVisible();
      expect(await placement(row, button)).toEqual(resting);

      await button.focus();
      await page.keyboard.press('Tab');
      await expect(cancel).toBeFocused();
    });
  }
});

async function holdTheIssuing(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => url.pathname === RECEIPT_ISSUING_URL,
    async (route) => {
      await released;
      await answerReceiptIssuing(route, ISSUING);
    },
  );
  return () => release();
}

async function keepStillAndStopTheClock(page: Page, button: Locator): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(async () => {
    await button.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    const centred = await button.evaluate((element) => element.getBoundingClientRect().top);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    expect(await button.evaluate((element) => element.getBoundingClientRect().top)).toBe(centred);
  }).toPass();
  await page.clock.install();
}

async function throughThePreparation(
  page: Page,
  row: Locator,
  release: () => void,
  measure: (state: string) => Promise<void>,
): Promise<void> {
  await measure('idle');
  await row.locator('.yearly-pdf').click();
  await expect(row.getByRole('status')).toHaveText('Připravujeme údaje potvrzení…');
  await measure('busy');
  await page.clock.fastForward(8000);
  const cancel = row.getByRole('button', { name: 'Zrušit' });
  await expect(cancel).toBeVisible();
  await measure('cancel');
  release();
  await expect
    .poll(async () => {
      await page.clock.runFor(500);
      return row.locator('.pdf-progress__line--done').count();
    })
    .toBe(1);
  await expect(cancel).toHaveCount(0);
  await measure('done');
}

test.describe('Given a donor on a phone 390 pt wide with the largest text', () => {
  test.skip(
    ({ browserName }) => browserName !== 'webkit',
    'the largest text on a phone is an iPhone setting, checked in WebKit',
  );

  for (const place of YEARLY_PLACES) {
    test(`when the PDF of ${place.name} takes long to prepare and is saved, then the button stays put and the status and Zrušit stay within the screen`, async ({
      page,
    }) => {
      await page.addInitScript((size) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = `html { font-size: ${size}; }`;
          document.head.append(style);
        });
      }, LARGEST_ROOT);
      await mockDonorApi(page, receiptDonations);
      const synced = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/donations/me/sync',
      );
      const release = await holdTheIssuing(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await openReceiptsAfterSignIn(page);
      await openDonorSection(page, place.section);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('navigation', { name: 'Můj účet' })).toHaveCount(0);
      const row = place.row(page);
      const button = row.locator('.yearly-pdf');
      await expect(button).toBeVisible();
      await synced;
      await expect(page.locator('.first-sync')).toHaveCount(0);
      await expect(page.locator('.page-fade--leaving')).toHaveCount(0);
      await keepStillAndStopTheClock(page, button);

      const placed: Record<string, number[]> = {};
      const pastTheScreen: string[] = [];
      await throughThePreparation(page, row, release, async (state) => {
        const box = (await button.boundingBox())!;
        placed[state] = [box.x, box.y, box.width].map((value) => Math.round(value));
        for (const [name, part] of [
          ['status', row.locator('.receipt-saved')],
          ['Zrušit', row.getByRole('button', { name: 'Zrušit' })],
        ] as const) {
          if ((await part.count()) > 0) {
            const partBox = (await part.boundingBox())!;
            if (partBox.x + partBox.width > 390 + 0.5) {
              pastTheScreen.push(
                `${state}: ${name} ends at ${Math.round(partBox.x + partBox.width)}`,
              );
            }
          }
        }
      });

      expect(placed.busy).toEqual(placed.idle);
      expect(placed.cancel).toEqual(placed.idle);
      expect(placed.done).toEqual(placed.idle);
      expect(pastTheScreen).toEqual([]);
    });
  }
});

test.describe('Given a donor on an iPhone who opens a section from the account sheet', () => {
  test.skip(
    ({ browserName }) => browserName !== 'webkit',
    'the account sheet at the iPhone width of the iphone project is checked in WebKit',
  );

  for (const place of YEARLY_PLACES) {
    test(`when the PDF of ${place.name} in the sheet takes long to prepare and is saved, then its row keeps its height`, async ({
      page,
    }) => {
      await mockDonorApi(page, receiptDonations);
      const synced = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/donations/me/sync',
      );
      const release = await holdTheIssuing(page);
      await openReceiptsAfterSignIn(page);
      await page.goto('/darce/prehled');
      await expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeVisible();
      await openDonorSection(page, place.section);
      const row = page.locator('dialog[open]').locator(place.selector).last();
      const button = row.locator('.yearly-pdf');
      await expect(button).toBeVisible();
      await synced;
      await expect(page.locator('.first-sync')).toHaveCount(0);
      await keepStillAndStopTheClock(page, button);

      const heights: Record<string, number> = {};
      await throughThePreparation(page, row, release, async (state) => {
        heights[state] = Math.round((await row.boundingBox())!.height);
      });

      expect(heights.busy).toBe(heights.idle);
      expect(heights.cancel).toBe(heights.idle);
      expect(heights.done).toBe(heights.idle);
    });
  }
});
