import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';

const KEPT_MINUTES_AGO = () => new Date(Date.now() - 10 * 60_000).toUTCString();
const ASLEEP_MS = 60_000;
const SETUP_STATUS = { json: { required: false, codeRequired: true } };

async function recordOfflinePill(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { offlinePillSeen: seen });
    new MutationObserver(() => {
      if (document.querySelector('.offline-pill') !== null && seen.length === 0) {
        seen.push('shown');
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

function offlinePillSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { offlinePillSeen: string[] }).offlinePillSeen);
}

test.describe('Given the installed app that the phone puts to sleep while it checks the connection', () => {
  test('when the phone wakes up and the server answers as always, then the app never says it is offline', async ({
    page,
  }) => {
    await page.clock.install();
    await recordOfflinePill(page);
    let keptAnswerShown = false;
    await page.route(
      (url) => url.pathname.startsWith('/api/content/'),
      async (route) => {
        await route.fulfill({
          json: { items: [], page: 0, size: 10, total: 0, hasMore: false },
          headers: { Date: KEPT_MINUTES_AGO() },
        });
        keptAnswerShown = true;
      },
    );
    const heldProbes: Route[] = [];
    let probeHeld!: () => void;
    const firstProbeHeld = new Promise<void>((resolve) => (probeHeld = resolve));
    await page.route(
      (url) => url.pathname === '/api/operations/setup',
      async (route) => {
        if (keptAnswerShown && heldProbes.length === 0) {
          heldProbes.push(route);
          probeHeld();
          return;
        }
        await route.fulfill(SETUP_STATUS);
      },
    );

    await page.goto('/aktuality');
    await firstProbeHeld;
    await page.clock.fastForward(ASLEEP_MS);
    await page.clock.runFor(1_000);

    await expect(page.locator('.offline-pill')).toHaveCount(0);
    expect(await offlinePillSeen(page)).toEqual([]);
    await heldProbes[0].fulfill(SETUP_STATUS).catch(() => undefined);
  });
});
