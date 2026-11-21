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

type LoadingPhase = 'held' | 'shown' | 'content';

interface SendGiftPlace {
  readonly top: number;
  readonly phase: LoadingPhase;
}

declare global {
  interface Window {
    sendGiftPlaces?: SendGiftPlace[];
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

async function recordWhereSendGiftStandsWhileLoading(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const places: SendGiftPlace[] = [];
    window.sendGiftPlaces = places;
    let placeSeen = false;
    const record = () => {
      if (document.fonts.status === 'loading') {
        places.length = 0;
        requestAnimationFrame(record);
        return;
      }
      const card = document.querySelector('.send-gift');
      const place = document.querySelector('.overview-skeletons');
      if (card !== null && (place !== null || placeSeen)) {
        placeSeen = true;
        const phase: LoadingPhase =
          place === null
            ? 'content'
            : place.classList.contains('overview-skeletons--shown')
              ? 'shown'
              : 'held';
        const top = Math.round(card.getBoundingClientRect().top + window.scrollY);
        const last = places.at(-1);
        if (last?.top !== top || last.phase !== phase) {
          places.push({ top, phase });
        }
        if (phase === 'content') {
          return;
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
  test('when the gifts answer slowly, then the card Poslat dar keeps its place while the skeleton stands in and fades in, and moves only once, when the cards take its place', async ({
    page,
  }) => {
    await mockDonorApi(page, donorWithDonations);
    await answerGiftsSlowly(page);
    await recordWhereSendGiftStandsWhileLoading(page);
    await openOverview(page);

    await expect(page.locator('.last-gift')).toBeVisible({ timeout: SLOW_ANSWER_MS * 4 });
    await expect
      .poll(() => page.evaluate(() => window.sendGiftPlaces?.at(-1)?.phase))
      .toBe('content');

    const places = await page.evaluate(() => window.sendGiftPlaces ?? []);
    const recorded = JSON.stringify(places);
    const phases = new Set(places.map((place) => place.phase));
    expect(phases.has('shown'), recorded).toBe(true);
    const whileLoading = places.filter((place) => place.phase !== 'content');
    expect(new Set(whileLoading.map((place) => place.top)).size, recorded).toBe(1);
    expect(new Set(places.map((place) => place.top)).size, recorded).toBeLessThanOrEqual(2);
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

  for (const root of ['16px', '34px', '53px']) {
    for (const width of [390, 1280]) {
      test(`when they have no gift yet and the page is ${width} px wide with a root of ${root}, then every step number of Jak poslat první dar starts on the card's text edge and every line of the steps' text starts on one edge after the numbers`, async ({
        page,
      }) => {
        await mockDonorApi(page, noDonations);
        await openOverview(page);
        await page.addStyleTag({ content: `html { font-size: ${root}; }` });
        await page.setViewportSize({ width, height: 900 });
        const card = page.locator('section.first-gift');
        await expect(card.locator('.first-gift-steps li')).toHaveCount(3);
        await page.evaluate(() => document.fonts.ready);

        const { titleLeft, stepLefts, lineLefts } = await card.evaluate((section) => {
          const title = section.querySelector('h2')!.getBoundingClientRect();
          const steps = [...section.querySelectorAll('.first-gift-steps > li')];
          return {
            titleLeft: title.left,
            stepLefts: steps.map((step) => step.getBoundingClientRect().left),
            lineLefts: steps.flatMap((step) =>
              [...step.querySelectorAll(':scope > span')].flatMap((text) =>
                [...text.getClientRects()].map((line) => line.left),
              ),
            ),
          };
        });

        for (const left of stepLefts) {
          expect(Math.abs(left - titleLeft)).toBeLessThanOrEqual(1);
        }
        expect(lineLefts.length).toBeGreaterThanOrEqual(3);
        for (const left of lineLefts) {
          expect(left).toBeGreaterThan(titleLeft);
          expect(Math.abs(left - lineLefts[0])).toBeLessThanOrEqual(0.5);
        }
      });
    }
  }
});
