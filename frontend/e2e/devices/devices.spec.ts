import { test as base } from '../fixtures';
import { requestsInFlight, settled } from '../settled';
import { layoutChecks } from './layout-checks';
import type { DeviceOptions } from './poses';
import { finishedAnimations, runStep, scrollToEnd, SETTLE_TIMEOUT_MS, stepTitle } from './run-step';
import { STEPS } from './steps';
import { playwrightUi } from './ui';

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
            await settled(page, inFlight, SETTLE_TIMEOUT_MS);
            await page.evaluate(() => document.fonts.ready);
            await page.evaluate(finishedAnimations);
          },
          scrollToEnd: async () => {
            const scrolled = await page.evaluate(scrollToEnd);
            if (scrolled) {
              await page.evaluate(
                () =>
                  new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                  ),
              );
            }
            return scrolled;
          },
          checks: () => layoutChecks(page, pageErrors),
          screenshot: () => page.screenshot({ animations: 'disabled', scale: 'css' }),
        },
        testInfo,
      );
    });
  }
});
