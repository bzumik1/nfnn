import type { Page } from '@playwright/test';

export async function waitWhileNothingMayHappen(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}
