import { Locator, Page } from '@playwright/test';
import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';
import {
  KEY_LIST,
  serveReceiptApi,
  serveReceiptKeys,
  serveReceiptStatus,
  SINGLE_RECEIPT,
  verdictHeading,
  YEARLY_RECEIPT,
} from './receipt-verification';

const COMPUTER_WIDTHS = [900, 1024, 1280, 1440, 1599, 1600, 1920, 2560];
const FORMER_COLUMN_WIDTH = 912;
const PIXEL_TOLERANCE = 1;
const NO_ANSWER = 'Podpis sedí, ale fond teď neodpověděl, zda potvrzení vede';

async function leftEdge(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!.x;
}

function backButton(page: Page): Locator {
  return page.getByRole('banner').getByRole('button', { name: 'Zpět' });
}

async function withCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      },
    });
  });
}

async function firstLineStart(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects()[0].left;
  });
}

for (const width of COMPUTER_WIDTHS) {
  test.describe(`Given a visitor on /overit in a window ${width} px wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockDonorApi(page);
    });

    test('when the page offers the three ways, then the title and the first way start on the header back button', async ({
      page,
    }) => {
      await page.goto('/overit');
      const firstWay = page.locator('.proof-ways > .ui-card').first();
      await expect(firstWay).toBeVisible();

      const axis = await leftEdge(backButton(page));
      const title = await leftEdge(page.getByRole('heading', { level: 1 }));

      expect(Math.abs(title - axis)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(Math.abs((await leftEdge(firstWay)) - axis)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    });

    test('when a receipt is verified, then its result starts on the header back button and keeps its former width', async ({
      page,
    }) => {
      await serveReceiptKeys(page);
      await serveReceiptStatus(page, 'active');
      await page.goto(`/overit#${YEARLY_RECEIPT.fragment}`);
      const card = page.locator('.verify-card');
      await expect(verdictHeading(page)).toBeVisible();

      const axis = await leftEdge(backButton(page));
      const title = await leftEdge(page.getByRole('heading', { level: 1 }));
      const box = (await card.boundingBox())!;
      const layoutWidth = await page.evaluate(() => document.body.clientWidth);

      expect(Math.abs(title - axis)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(Math.abs(box.x - axis)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(
        Math.abs(box.width - Math.min(FORMER_COLUMN_WIDTH, layoutWidth - 2 * axis)),
      ).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    });

    test('when the page offers the three ways, then the camera card puts its action right under its title instead of stretching to the tallest card', async ({
      page,
    }) => {
      await withCamera(page);
      await page.goto('/overit');
      const camera = page
        .locator('.proof-ways > .ui-card')
        .filter({ has: page.getByRole('heading', { name: 'Načíst fotoaparátem' }) });
      await expect(camera.getByRole('button', { name: 'Naskenovat QR kód' })).toBeVisible();

      const bar = (await camera.locator('.ui-card__bar').boundingBox())!;
      const action = (await camera.locator('.ui-list').boundingBox())!;
      const card = (await camera.boundingBox())!;

      expect(action.y - (bar.y + bar.height)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(card.y + card.height - (action.y + action.height)).toBeLessThanOrEqual(
        PIXEL_TOLERANCE,
      );
    });
  });
}

for (const width of [1280, 1920]) {
  test.describe(`Given a visitor with a result on /overit in a window ${width} px wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockDonorApi(page);
    });

    test('when the result shows, then the note under it and the closing note start on the same edge', async ({
      page,
    }) => {
      await serveReceiptKeys(page);
      await serveReceiptStatus(page, 'active');
      await page.goto(`/overit#${YEARLY_RECEIPT.fragment}`);
      await expect(verdictHeading(page)).toBeVisible();
      const local = page.getByText('Podpis jsme ověřili ve vašem zařízení.');
      const domain = page.getByText('Fond ověřuje potvrzení jen na adrese');
      await expect(local).toBeVisible();
      await expect(domain).toBeVisible();

      expect(Math.abs((await firstLineStart(local)) - (await firstLineStart(domain)))).toBeLessThan(
        PIXEL_TOLERANCE,
      );
    });

    test('when the foundation does not answer, then Zkusit znovu is sized by its text, not by the card', async ({
      page,
    }) => {
      await serveReceiptApi(page, { keys: KEY_LIST, status: 503 });
      await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);
      await expect(verdictHeading(page)).toHaveText(NO_ANSWER);
      const retry = page.getByRole('button', { name: 'Zkusit znovu' });
      await expect(retry).toBeVisible();

      const button = (await retry.boundingBox())!;
      const card = (await page.locator('.verify-card').boundingBox())!;

      expect(button.width).toBeLessThan(card.width / 2);
    });

    test('when a yearly receipt shows, then Celkem closes the data on a row of its own and its sum is the strongest figure', async ({
      page,
    }) => {
      await serveReceiptKeys(page);
      await serveReceiptStatus(page, 'active');
      await page.goto(`/overit#${YEARLY_RECEIPT.fragment}`);
      await expect(page.getByRole('heading', { name: 'Jednotlivé dary (12)' })).toBeVisible();
      const items = page.locator('.verify-data > div');
      const total = items.filter({ has: page.locator('dt', { hasText: 'Celkem' }) });

      const layout = await items.evaluateAll((elements) =>
        elements.map((element) => {
          const { left, right, top, bottom } = element.getBoundingClientRect();
          return { left, right, top, bottom, total: element.querySelector('dt')?.textContent };
        }),
      );
      const list = (await page.locator('.verify-data').boundingBox())!;
      const last = layout.at(-1)!;
      const others = layout.slice(0, -1);
      const strength = (locator: Locator) =>
        locator.evaluate((element) => {
          const style = getComputedStyle(element);
          return { size: parseFloat(style.fontSize), weight: Number(style.fontWeight) };
        });
      const sum = await strength(total.locator('dd'));
      const gift = await strength(page.locator('.verify-gift .ui-list__value').first());

      expect(last.total?.trim()).toBe('Celkem');
      expect(Math.abs(last.left - list.x)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(Math.abs(last.right - (list.x + list.width))).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(last.top).toBeGreaterThanOrEqual(Math.max(...others.map((item) => item.bottom)));
      expect(sum.weight).toBeGreaterThan(gift.weight);
      expect(sum.size).toBeGreaterThanOrEqual(gift.size);
    });
  });
}
