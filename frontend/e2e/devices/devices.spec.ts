import type { Page, Request } from '@playwright/test';
import { test as base } from '../fixtures';
import { layoutChecks } from './layout-checks';
import type { DeviceOptions } from './poses';
import { runStep, stepTitle, waitUntilSettled } from './run-step';
import { STEPS } from './steps';
import { playwrightUi } from './ui';

function requestsInFlight(page: Page): () => number {
  const open = new Set<Request>();
  page.on('request', (request) => open.add(request));
  page.on('requestfinished', (request) => open.delete(request));
  page.on('requestfailed', (request) => open.delete(request));
  return () => open.size;
}

const test = base.extend<DeviceOptions & { pageErrors: string[]; inFlight: () => number }>({
  textScale: [100, { option: true }],
  pageErrors: [
    async ({ page, textScale }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      if (textScale !== 100) {
        await page.addInitScript((scale) => {
          const style = document.createElement('style');
          style.textContent = `html { font-size: ${scale}%; }`;
          document.addEventListener('DOMContentLoaded', () => document.head.append(style));
        }, textScale);
      }
      await use(errors);
    },
    { auto: true },
  ],
  inFlight: [async ({ page }, use) => use(requestsInFlight(page)), { auto: true }],
});

test.describe('Given the site on a phone or a tablet', () => {
  for (const step of STEPS) {
    test(stepTitle(step), async ({ page, pageErrors, inFlight }, testInfo) => {
      await runStep(
        step,
        {
          ui: playwrightUi(page),
          shortenWaits: (ms) => page.setDefaultTimeout(ms),
          settle: async () => {
            await waitUntilSettled(
              () =>
                page.evaluate(
                  () =>
                    new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
                ),
              inFlight,
            );
            await page.evaluate(() => document.fonts.ready);
          },
          checks: () => layoutChecks(page, pageErrors),
          screenshot: () => page.screenshot({ animations: 'disabled', scale: 'css' }),
        },
        testInfo,
      );
    });
  }
});
