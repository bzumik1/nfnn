import type { TestInfo } from '@playwright/test';
import { expect, NO_SERVER_PAYMENT, routeApiDefaults, testWithoutBrowser } from '../fixtures';
import { checksFrom, collectFindings, type Findings, LIMITS } from './layout-checks';
import {
  LANDING_MOVES_GLOBAL,
  LANDING_VIEW,
  type LandingView,
  RECORD_MOVES,
  scrollKeys,
  swipe,
  UNTIL_STILL,
} from './landing-still';
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
import {
  FORGET_STORED_DATA,
  HELD_LOCKS,
  NEXT_FRAMES,
  WAIT_MS,
  WebDriver,
  webDriverUi,
} from './webdriver';

const START_TIMEOUT_MS = 600_000;
const FORGET_WAIT_MS = 5_000;
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
    const kept = await driver.executeAsync<string[]>(FORGET_STORED_DATA, FORGET_WAIT_MS);
    if (kept.length > 0) {
      throw new Error(`the databases of the step before stayed: ${kept.join(', ')}`);
    }
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
  const locks = await driver
    .executeAsync<string>(HELD_LOCKS)
    .catch((error: unknown) => String(error));
  await testInfo.attach('locks', { body: locks, contentType: 'text/plain' });
  console.log(`${testInfo.title}: Web Locks at the failure: ${locks}`);
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

async function tryToScroll(driver: WebDriver, pose: SafariPose, view: LandingView): Promise<void> {
  const across = view.width / 2;
  const gestures =
    pose.platform === 'iOS'
      ? [
          swipe(across, view.height * 0.75, view.height * 0.25),
          swipe(across, view.height * 0.3, view.height * 0.8),
          swipe(across, view.height * 0.75, view.height * 0.2),
        ]
      : [scrollKeys()];
  for (const gesture of gestures) {
    await driver.command('POST', '/actions', gesture);
    await driver.command('DELETE', '/actions');
    await driver.executeAsync(UNTIL_STILL);
  }
}

const stillParts = ({ scrollY, height, photo, marks }: LandingView) => ({
  scrollY,
  height,
  photo,
  marks,
});

test.describe('Given the landing page in Safari on an iPhone, an iPad or a Mac', () => {
  test('when the visitor swipes or presses keys to scroll it, then the photo keeps covering the whole screen and nothing moves, unless enlarged text no longer fits one screen', async ({
    safariPage,
    safari,
  }, testInfo) => {
    const { driver, pose } = safari;
    await testInfo.attach('step', {
      body: JSON.stringify({ id: 'home-still', order: STEPS.length, device: driver.device }),
      contentType: 'application/json',
    });
    await safariPage.ui.goto('/');
    await safariPage.ui.waitVisible({ css: '#uvod h1' });
    await safariPage.settle();
    if (pose.platform === 'mac') {
      await safariPage.ui.click({ css: '#uvod h1' });
    }
    await driver.executeAsync(UNTIL_STILL);
    const loaded = await driver.execute<LandingView>(LANDING_VIEW, LANDING_MOVES_GLOBAL);
    await testInfo.attach('screen after loading', {
      body: await driver.screenshot(),
      contentType: 'image/png',
    });

    await driver.execute(RECORD_MOVES, LANDING_MOVES_GLOBAL);
    await tryToScroll(driver, pose, loaded);
    const after = await driver.execute<LandingView>(LANDING_VIEW, LANDING_MOVES_GLOBAL);
    await testInfo.attach('screen', { body: await driver.screenshot(), contentType: 'image/png' });
    await testInfo.attach('views', {
      body: JSON.stringify({ loaded, after }, null, 2),
      contentType: 'application/json',
    });

    if (!loaded.staged) {
      expect(pose.textScale, 'the landing page scrolls at the default text size').toBeDefined();
      expect(loaded.heroHeight, 'the landing page scrolls although it fits').toBeGreaterThan(
        loaded.height,
      );
      expect(after.scrollY, 'the landing page that no longer fits does not scroll').toBeGreaterThan(
        loaded.scrollY,
      );
      return;
    }
    expect(
      loaded.restingScroll > 0,
      'the photo reaches under the status bar and the toolbar only in a Safari tab of iOS',
    ).toBe(pose.platform === 'iOS');
    expect(loaded.scrollY, 'the landing page rests past the room above it').toBe(
      loaded.restingScroll,
    );
    const photo = loaded.photo;
    expect(photo, 'the landing page has no photo').not.toBeNull();
    expect(
      photo && {
        aboveTheTop: photo.top <= -loaded.restingScroll,
        belowTheBottom: photo.bottom >= loaded.height + loaded.bleedBottom,
        fromTheLeft: photo.left <= 0,
        toTheRight: photo.right >= loaded.width,
      },
      `the photo ${JSON.stringify(photo)} leaves part of the screen uncovered`,
    ).toEqual({ aboveTheTop: true, belowTheBottom: true, fromTheLeft: true, toTheRight: true });
    expect(
      after.moves.filter((scrollY) => scrollY !== loaded.restingScroll),
      'the page moved under the gesture',
    ).toEqual([]);
    expect(stillParts(after), 'something moved').toEqual(stillParts(loaded));
  });
});
