import type { BrowserContext, Locator, Page } from '@playwright/test';
import { mockPublicContent, servePaymentDetails } from './baseline/screen-mocks';
import { expect, test } from './fixtures';
import { mockDonorApi } from './donor-session';
import { lowestContentEdge, scrolledToTheEnd } from './page-end';

const PHONE = { width: 390, height: 844 };

async function animationsOf(element: Locator): Promise<void> {
  await element.evaluate((node) =>
    Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
}

async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

async function imagesAndFontsSettled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    images.forEach((image) => (image.loading = 'eager'));
    await Promise.all(
      images
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise((done) => {
              image.addEventListener('load', done, { once: true });
              image.addEventListener('error', done, { once: true });
            }),
        ),
    );
  });
  await expect
    .poll(() => page.evaluate(() => [...document.images].every((image) => image.complete)))
    .toBe(true);
}

async function recordTheEndWhenTheRoomArrives(page: Page): Promise<() => Promise<boolean[]>> {
  await page.evaluate(() => {
    const records: boolean[] = [];
    Object.assign(window, { endHeldWhenOffline: records });
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('is-offline') && records.length === 0) {
        records.push(
          Math.ceil(window.scrollY + window.innerHeight) >=
            document.documentElement.scrollHeight - 1,
        );
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { endHeldWhenOffline: boolean[] }).endHeldWhenOffline,
    );
}

async function loseTheConnection(page: Page, context: BrowserContext): Promise<Locator> {
  await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
  await context.setOffline(true);
  const pill = page.getByRole('button', { name: /^Offline/ });
  await expect(pill).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/\bis-offline\b/);
  await animationsOf(pill);
  return pill;
}

test.describe('Given a visitor on a phone who reads a page that ends with a section holding the tab bar in its bottom padding', () => {
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await mockPublicContent(page);
    await servePaymentDetails(page);
  });

  for (const { path, lastPart } of [
    { path: '/o-nas', lastPart: '#kontakt form' },
    { path: '/prispet', lastPart: '#prispet .bank' },
  ]) {
    test(`when they stand at the end of ${path} and the Offline pill appears, then its last line stands above the pill without scrolling again`, async ({
      page,
      context,
    }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator(lastPart).first()).toBeVisible();
      await imagesAndFontsSettled(page);
      await scrolledToTheEnd(page);
      const recordedEnd = await recordTheEndWhenTheRoomArrives(page);

      const pill = await loseTheConnection(page, context);

      expect(await recordedEnd()).toEqual([true]);
      await expect
        .poll(async () => (await pill.boundingBox())!.y - (await lowestContentEdge(page)))
        .toBeGreaterThanOrEqual(0);
    });

    test(`when they read the middle of ${path} and the Offline pill appears, then the page does not move`, async ({
      page,
      context,
    }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator(lastPart).first()).toBeVisible();
      await imagesAndFontsSettled(page);
      const middle = await page.evaluate(() => {
        const top = Math.round((document.documentElement.scrollHeight - window.innerHeight) / 2);
        window.scrollTo({ top, behavior: 'instant' });
        return top;
      });
      await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(middle);

      await loseTheConnection(page, context);
      await nextFrames(page);

      expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(middle);
    });
  }
});
