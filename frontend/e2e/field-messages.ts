import type { Page } from '@playwright/test';
import { expect } from './fixtures';

const SUBPIXEL_TOLERANCE = 1;

async function fieldGap(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.setProperty('block-size', 'var(--space-1-5)');
    document.body.append(probe);
    const gap = probe.getBoundingClientRect().height;
    probe.remove();
    return gap;
  });
}

export async function expectErrorRightUnderItsControl(
  page: Page,
  controlId: string,
): Promise<void> {
  const control = page.locator(`#${controlId}`);
  const error = page.locator(`#${controlId}-error`);
  const hint = page.locator(`#${controlId}-hint`);
  await expect(error).toBeVisible();
  await expect(hint).toBeVisible();

  const gap = await fieldGap(page);
  const controlBox = (await control.boundingBox())!;
  const errorBox = (await error.boundingBox())!;
  const hintBox = (await hint.boundingBox())!;
  const controlBottom = controlBox.y + controlBox.height;

  expect(errorBox.y).toBeGreaterThanOrEqual(controlBottom - SUBPIXEL_TOLERANCE);
  expect(errorBox.y - controlBottom).toBeLessThanOrEqual(gap + SUBPIXEL_TOLERANCE);
  expect(hintBox.y).toBeGreaterThanOrEqual(errorBox.y + errorBox.height - SUBPIXEL_TOLERANCE);
}
