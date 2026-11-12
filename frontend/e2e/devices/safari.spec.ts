import type { TestInfo } from '@playwright/test';
import { expect, NO_SERVER_PAYMENT, routeApiDefaults, testWithoutBrowser } from '../fixtures';
import { checksFrom, collectFindings, type Findings, LIMITS } from './layout-checks';
import type { SafariPose } from './poses';
import { BLANK_PATH, ERRORS_GLOBAL, EVENTS_GLOBAL, RouteHost } from './route-host';
import {
  type Browser,
  finishedAnimations,
  runStep,
  scrollToEnd,
  stepTitle,
  waitUntilSettled,
} from './run-step';
import { STEPS } from './steps';
import { NEXT_FRAMES, WAIT_MS, WebDriver, webDriverUi } from './webdriver';

const START_TIMEOUT_MS = 600_000;
const FONTS_READY =
  'const done = arguments[arguments.length - 1]; document.fonts.ready.then(() => done());';
const COLLECT_FINDINGS = `return (${collectFindings.toString()})(arguments[0]);`;
const ANIMATIONS_FINISHED = `const done = arguments[arguments.length - 1]; (${finishedAnimations.toString()})().then(() => done());`;
const SCROLL_TO_END = `return (${scrollToEnd.toString()})();`;

interface Safari {
  driver: WebDriver;
  host: RouteHost;
  baseUrl: string;
  pose: SafariPose;
}

const test = testWithoutBrowser.extend<
  { safariPage: Browser },
  { safariPose: SafariPose | undefined; safari: Safari }
>({
  safariPose: [undefined, { scope: 'worker', option: true }],
  safari: [
    async ({ safariPose }, use) => {
      if (!safariPose) {
        throw new Error('a Safari project names its pose in use.safariPose');
      }
      const host = new RouteHost(process.env['E2E_DIST'] ?? 'dist/frontend/browser');
      const baseUrl = await host.start();
      const driver = await WebDriver.start(safariPose);
      await use({ driver, host, baseUrl, pose: safariPose });
      await driver.stop();
      await host.stop();
    },
    { scope: 'worker', timeout: START_TIMEOUT_MS },
  ],
  safariPage: async ({ safari }, use, testInfo) => {
    const { driver, host, baseUrl, pose } = safari;
    host.reset(pose.textScale ?? 100);
    await driver.navigate(`${baseUrl}${BLANK_PATH}`);
    await driver.execute('localStorage.clear(); sessionStorage.clear();');
    await driver.deleteCookies();
    const askedForServerPayment = await routeApiDefaults(host.routes);
    const waits = { ms: WAIT_MS, presses: [] as string[] };
    await use({
      ui: webDriverUi(driver, host, baseUrl, waits),
      device: driver.device,
      shortenWaits: (ms) => (waits.ms = ms),
      settle: async () => {
        await waitUntilSettled(
          () => driver.executeAsync(NEXT_FRAMES),
          () => host.inFlight(),
        );
        await driver.executeAsync(FONTS_READY);
        await driver.executeAsync(ANIMATIONS_FINISHED);
      },
      scrollToEnd: async () => {
        const scrolled = await driver.execute<boolean>(SCROLL_TO_END);
        if (scrolled) {
          await driver.executeAsync(NEXT_FRAMES);
        }
        return scrolled;
      },
      checks: async () =>
        checksFrom(
          await driver.execute<Findings>(COLLECT_FINDINGS, LIMITS),
          await driver.execute<string[]>(`return window.${ERRORS_GLOBAL} || [];`),
        ),
      screenshot: () => driver.screenshot(),
    });
    for (const press of waits.presses) {
      testInfo.annotations.push({ type: 'press', description: press });
    }
    if (waits.presses.length) {
      console.log(`${testInfo.title}: ${waits.presses.join('; ')}`);
    }
    if (testInfo.status !== testInfo.expectedStatus) {
      await keepFailedScreen(driver, host, testInfo);
    }
    expect(askedForServerPayment, NO_SERVER_PAYMENT).toEqual([]);
  },
});

async function keepFailedScreen(
  driver: WebDriver,
  host: RouteHost,
  testInfo: TestInfo,
): Promise<void> {
  const shown = testInfo.attachments.some((attachment) => attachment.name === 'screen');
  const screen = shown ? undefined : await driver.screenshot().catch(() => undefined);
  if (screen) {
    await testInfo.attach('screen', { body: screen, contentType: 'image/png' });
  }
  const events = await driver
    .execute<string[]>(`return window.${EVENTS_GLOBAL} || [];`)
    .catch((error: unknown) => [String(error)]);
  await testInfo.attach('events', { body: events.join('\n'), contentType: 'text/plain' });
  console.log(`${testInfo.title}: events before the failure\n${events.join('\n')}`);
  const answered = host.answered();
  await testInfo.attach('answered', { body: answered.join('\n'), contentType: 'text/plain' });
  console.log(`${testInfo.title}: API answers before the failure\n${answered.join('\n')}`);
}

test.describe('Given the site in Safari on an iPhone, an iPad or a Mac', () => {
  for (const step of STEPS) {
    test(stepTitle(step), async ({ safariPage }, testInfo) => {
      await runStep(step, safariPage, testInfo);
    });
  }
});
