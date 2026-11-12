import type { TestInfo } from '@playwright/test';
import { expect, testWithoutBrowser as test } from '../fixtures';
import { knownBreak, knownFindings, matches } from './known-findings';
import type { Check } from './layout-checks';
import { untilQuiet } from '../settled';
import { DEVICE_PROJECT_PREFIX } from './poses';
import { NOT_ON_THIS_DEVICE, type Step, STEPS } from './steps';
import type { Ui } from './ui';

const KNOWN_BREAK_TIMEOUT_MS = 3_000;
const CHECKED_AT_THE_END = 'no control covered by another element';
export const SETTLE_TIMEOUT_MS = 10_000;

export async function finishedAnimations(): Promise<void> {
  await Promise.all(
    document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined)),
  );
}

export function scrollToEnd(): boolean {
  if (document.querySelector('dialog[open]')) {
    return false;
  }
  const end = document.documentElement.scrollHeight - window.innerHeight;
  if (end <= window.scrollY + 1) {
    return false;
  }
  window.scrollTo({ top: end, behavior: 'instant' });
  return true;
}

export const stepTitle = (step: Step) =>
  `when they open ${step.title}, then nothing is cut off, stacked, covered or too small`;

export interface Browser {
  ui: Ui;
  device?: string;
  shortenWaits(ms: number): void;
  settle(): Promise<void>;
  scrollToEnd(): Promise<boolean>;
  checks(): Promise<Check[]>;
  screenshot(): Promise<Buffer>;
}

export function waitUntilSettled(
  nextFrames: () => Promise<unknown>,
  inFlight: () => number,
): Promise<void> {
  return untilQuiet({ nextFrames, inFlight, timeoutMs: SETTLE_TIMEOUT_MS });
}

export async function runStep(step: Step, browser: Browser, testInfo: TestInfo): Promise<void> {
  const pose = testInfo.project.name.slice(DEVICE_PROJECT_PREFIX.length);
  await testInfo.attach('step', {
    body: JSON.stringify({ id: step.id, order: STEPS.indexOf(step), device: browser.device }),
    contentType: 'application/json',
  });
  const broken = knownBreak(pose, step.id);
  test.fail(!!broken, `${broken?.reason}: remove it from known-findings.ts once it opens`);
  if (broken) {
    browser.shortenWaits(KNOWN_BREAK_TIMEOUT_MS);
  }
  const skipped = await step.open(browser.ui);
  test.skip(
    skipped === NOT_ON_THIS_DEVICE,
    'this device has no such state (no menu to open, or the QR shown without folding)',
  );
  await browser.settle();

  const known = knownFindings(pose, step.id);
  const screen = await browser.screenshot();
  const atStart = await browser.checks();
  const atEnd = (await browser.scrollToEnd())
    ? (await browser.checks())
        .filter((check) => check.name === CHECKED_AT_THE_END)
        .map((check) => ({ ...check, detail: `at the end of the page: ${check.detail}` }))
    : [];
  const checks = [...atStart, ...atEnd].map((check) => ({
    ...check,
    known: known.find((finding) => matches(finding, check))?.reason,
  }));
  await testInfo.attach('screen', { body: screen, contentType: 'image/png' });
  if (atEnd.length > 0) {
    await testInfo.attach('screen at the end', {
      body: await browser.screenshot(),
      contentType: 'image/png',
    });
  }
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
}
