import type { Page, Request } from '@playwright/test';
import { expect, test as base } from '../fixtures';
import { knownBreak, knownFindings, matches } from './known-findings';
import { layoutChecks } from './layout-checks';
import { DEVICE_PROJECT_PREFIX, type DeviceOptions } from './poses';
import { NOT_ON_THIS_DEVICE, STEPS } from './steps';

const KNOWN_BREAK_TIMEOUT_MS = 3_000;
const SETTLE_TIMEOUT_MS = 10_000;

function requestsInFlight(page: Page): () => number {
  const open = new Set<Request>();
  page.on('request', (request) => open.add(request));
  page.on('requestfinished', (request) => open.delete(request));
  page.on('requestfailed', (request) => open.delete(request));
  return () => open.size;
}

async function settled(page: Page, inFlight: () => number): Promise<void> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let quietRounds = 0;
  while (quietRounds < 2) {
    if (Date.now() > deadline) {
      throw new Error(`the page still waits for ${inFlight()} requests`);
    }
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    quietRounds = inFlight() === 0 ? quietRounds + 1 : 0;
  }
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
    test(`when they open ${step.title}, then nothing is cut off, stacked, covered or too small`, async ({
      page,
      pageErrors,
      inFlight,
    }, testInfo) => {
      const pose = testInfo.project.name.slice(DEVICE_PROJECT_PREFIX.length);
      await testInfo.attach('step', {
        body: JSON.stringify({ id: step.id, order: STEPS.indexOf(step) }),
        contentType: 'application/json',
      });
      const broken = knownBreak(pose, step.id);
      test.fail(!!broken, `${broken?.reason}: remove it from known-findings.ts once it opens`);
      if (broken) {
        page.setDefaultTimeout(KNOWN_BREAK_TIMEOUT_MS);
      }
      const skipped = await step.open(page);
      test.skip(skipped === NOT_ON_THIS_DEVICE, 'this device shows it without a menu');
      await settled(page, inFlight);
      await page.evaluate(() => document.fonts.ready);

      const known = knownFindings(pose, step.id);
      const checks = (await layoutChecks(page, pageErrors)).map((check) => ({
        ...check,
        known: known.find((finding) => matches(finding, check))?.reason,
      }));
      await testInfo.attach('screen', {
        body: await page.screenshot({ animations: 'disabled', scale: 'css' }),
        contentType: 'image/png',
      });
      await testInfo.attach('layout', {
        body: JSON.stringify(checks),
        contentType: 'application/json',
      });

      for (const finding of known) {
        testInfo.annotations.push({ type: 'known finding', description: finding.reason });
      }
      expect(
        known
          .filter((finding) => !checks.some((check) => matches(finding, check)))
          .map((finding) => `${finding.reason}: gone, remove it from known-findings.ts`),
      ).toEqual([]);
      expect(
        checks
          .filter((check) => !check.pass && !check.known)
          .map((check) => `${check.name}: ${check.detail}`),
      ).toEqual([]);
    });
  }
});
