import type { Locator, Page } from '@playwright/test';
import { donorWithDonations } from './baseline/screen-mocks';
import { mockDonorApi, noDonations, rememberedDonorSession } from './donor-session';
import { expect, test } from './fixtures';

const SLOW_ANSWER_MS = 1500;
const GIFTS_PATHS = new Set([
  '/api/donations/me',
  '/api/donations/me/summary',
  '/api/donations/me/sync',
]);

declare global {
  interface Window {
    sendGiftTops?: number[];
  }
}

async function answerGiftsSlowly(page: Page): Promise<void> {
  await page.route(
    (url) => GIFTS_PATHS.has(url.pathname),
    async (route) => {
      await new Promise((answer) => setTimeout(answer, SLOW_ANSWER_MS));
      await route.fallback();
    },
  );
}

async function recordWhereSendGiftStands(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sendGiftTops = [];
    const record = () => {
      const card = document.querySelector('.send-gift');
      if (card !== null) {
        const top = Math.round(card.getBoundingClientRect().top + window.scrollY);
        const tops = window.sendGiftTops!;
        if (tops.at(-1) !== top) {
          tops.push(top);
        }
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
}

async function openOverview(page: Page): Promise<void> {
  await rememberedDonorSession(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/darce/prehled');
  await expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeVisible();
}

async function box(locator: Locator): Promise<{ top: number; bottom: number }> {
  const found = await locator.boundingBox();
  expect(found).not.toBeNull();
  return { top: found!.y, bottom: found!.y + found!.height };
}

async function spaceAboveTitleAndBelowLastChild(
  card: Locator,
): Promise<{ above: number; below: number }> {
  const outer = await box(card);
  const title = await box(card.locator(':scope > .ui-card__title'));
  const last = await box(card.locator(':scope > :last-child'));
  return { above: title.top - outer.top, below: outer.bottom - last.bottom };
}

test.describe('Given a signed-in donor on Můj přehled', () => {
  test('when the gifts answer slowly, then the card Poslat dar moves at most once while the skeleton stands in for the cards above it', async ({
    page,
  }) => {
    await mockDonorApi(page, donorWithDonations);
    await answerGiftsSlowly(page);
    await recordWhereSendGiftStands(page);
    await openOverview(page);

    await expect(page.locator('.last-gift')).toBeVisible({ timeout: SLOW_ANSWER_MS * 4 });
    await expect(page.locator('.ui-skeleton-reveal')).toHaveCount(0);

    const tops = await page.evaluate(() => window.sendGiftTops ?? []);
    expect(tops.length).toBeGreaterThan(0);
    expect(tops.length - 1).toBeLessThanOrEqual(1);
  });

  test('when they have a gift, then the card Poslední dar ends as close below its last line as it starts above its title', async ({
    page,
  }) => {
    await mockDonorApi(page, donorWithDonations);
    await openOverview(page);
    const card = page.locator('section.last-gift');
    await expect(card).toBeVisible();

    const { above, below } = await spaceAboveTitleAndBelowLastChild(card);
    expect(below).toBeCloseTo(above, 0);
  });

  test('when they have no gift yet, then Jak poslat první dar ends as close below its last line as it starts above its title and the bank check stands apart from the box Poslali jste dar a nevidíte ho? at least as far as the steps above it', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    await openOverview(page);
    const card = page.locator('section.first-gift');
    await expect(card.getByRole('button', { name: 'Zkontrolovat nové platby' })).toBeVisible();

    const { above, below } = await spaceAboveTitleAndBelowLastChild(card);
    expect(below).toBeCloseTo(above, 0);

    const steps = await box(card.locator('.first-gift-steps'));
    const missingGift = await box(card.locator('.missing-gift'));
    const check = await box(card.getByRole('button', { name: 'Zkontrolovat nové platby' }));
    expect(check.top - missingGift.bottom).toBeGreaterThanOrEqual(missingGift.top - steps.bottom);
  });
});
