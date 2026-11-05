import type { Locator, Page } from '@playwright/test';

import { API_GENERATION } from '../src/app/core/version/api-generation';

export const UPDATE_NOTICE = 'Web má novou verzi. Než budete cokoli odesílat, načtěte ji.';

export async function serveNewerApiGeneration(page: Page): Promise<void> {
  await page.route('**/api/content/home', (route) =>
    route.fulfill({
      json: { news: [], projects: [] },
      headers: { 'Cache-Control': 'no-store', 'Nfnn-Api': String(API_GENERATION + 1) },
    }),
  );
}

export const updateNotice = (page: Page): Locator =>
  page.locator('[aria-live="polite"]').filter({ hasText: UPDATE_NOTICE }).getByText(UPDATE_NOTICE);
