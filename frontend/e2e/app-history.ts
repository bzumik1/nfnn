import { Page } from '@playwright/test';

export const OWN_HISTORY_KEY = 'nfnn.app-history';

export async function stepBack(page: Page): Promise<void> {
  await page.evaluate(() => history.back());
}

export function browserEntries(page: Page): Promise<number> {
  return page.evaluate(() => history.length);
}

export function siteSteps(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const kept: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    return Array.isArray(kept) ? kept.length : 0;
  }, OWN_HISTORY_KEY);
}
