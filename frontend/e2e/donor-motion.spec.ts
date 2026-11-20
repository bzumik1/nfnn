import { Page } from '@playwright/test';
import {
  longUnusedDevices,
  mockDonorApi,
  openDonorSection,
  signedInDevices,
  signIn,
} from './donor-session';
import { expect, test } from './fixtures';

interface Move {
  readonly on: string;
  readonly properties: readonly string[];
  readonly duration: number;
}

const MOVING = new Set(['transform', 'translate', 'scale', 'rotate']);
const SIZING = new Set(['grid-template-rows']);
const INSTANT_MS = 1;

async function recordMoves(page: Page, card: string): Promise<void> {
  await page.evaluate((card) => {
    const moves: Move[] = [];
    const frameKeys = new Set(['offset', 'computedOffset', 'easing', 'composite']);
    (window as unknown as { recordedMoves: Move[] }).recordedMoves = moves;
    const record = (target: EventTarget | null, animation: Animation | undefined) => {
      if (!(target instanceof Element) || animation === undefined || !target.closest(card)) {
        return;
      }
      const effect = animation.effect as KeyframeEffect | null;
      const properties =
        animation instanceof CSSTransition
          ? [animation.transitionProperty]
          : (effect?.getKeyframes() ?? []).flatMap((frame) =>
              Object.keys(frame).filter((key) => !frameKeys.has(key)),
            );
      moves.push({
        on: target.className,
        properties: [...new Set(properties)],
        duration: Number(effect?.getComputedTiming().duration ?? 0),
      });
    };
    document.addEventListener(
      'transitionrun',
      (event) =>
        record(
          event.target,
          (event.target as Element)
            .getAnimations()
            .find(
              (animation) =>
                animation instanceof CSSTransition &&
                animation.transitionProperty === event.propertyName,
            ),
        ),
      true,
    );
    document.addEventListener(
      'animationstart',
      (event) =>
        record(
          event.target,
          (event.target as Element)
            .getAnimations()
            .find(
              (animation) =>
                animation instanceof CSSAnimation &&
                animation.animationName === event.animationName,
            ),
        ),
      true,
    );
  }, card);
}

async function recordElementsMadeInert(page: Page, card: string): Promise<void> {
  await page.evaluate((card) => {
    const elements: string[] = [];
    (window as unknown as { inertElements: string[] }).inertElements = elements;
    new MutationObserver((records) => {
      for (const { target } of records) {
        if (
          target instanceof Element &&
          target.hasAttribute('inert') &&
          target.isConnected &&
          target.closest(card)
        ) {
          elements.push(target.id || `inside ${target.parentElement?.closest('[id]')?.id}`);
        }
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['inert'], subtree: true });
  }, card);
}

function elementsMadeInert(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { inertElements: string[] }).inertElements);
}

function whenFirstSyncSettled(page: Page): () => Promise<void> {
  const synced = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/donations/me/sync',
    { timeout: 10_000 },
  );
  return async () => {
    await synced;
    await expect(page.locator('.first-sync')).toHaveCount(0, { timeout: 10_000 });
  };
}

function recordedMoves(page: Page): Promise<Move[]> {
  return page.evaluate(() => (window as unknown as { recordedMoves: Move[] }).recordedMoves);
}

function reducedDuration(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--duration-reduced'),
      ) * 1000,
  );
}

async function expectOnlyInstantChangesOrShortFades(page: Page): Promise<void> {
  const moves = await recordedMoves(page);
  const reduced = await reducedDuration(page);
  for (const move of moves.filter((candidate) => candidate.duration > INSTANT_MS)) {
    expect(
      move.properties.filter((property) => MOVING.has(property) || SIZING.has(property)),
      move.on,
    ).toEqual([]);
    expect(move.duration, move.on).toBeLessThanOrEqual(reduced);
  }
}

function fadesOn(moves: readonly Move[], className: RegExp): boolean {
  return moves.some(
    (move) =>
      className.test(move.on) && move.duration > INSTANT_MS && move.properties.includes('opacity'),
  );
}

async function expectOnlyAShortFadeOn(page: Page, className: RegExp): Promise<void> {
  await expect.poll(async () => fadesOn(await recordedMoves(page), className)).toBe(true);
  await expectOnlyInstantChangesOrShortFades(page);
}

test.describe('Given a donor on a computer who asks for less motion', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

  test('when they sign out their only other device, then its row and the confirmation inside it are out of reach at once, the row only fades away without closing its height, and the heading takes the focus', async ({
    page,
  }) => {
    await mockDonorApi(page);
    let listed = signedInDevices;
    await page.route(
      (url) => url.pathname === '/api/donors/me/devices',
      (route) => route.fulfill({ json: { items: listed } }),
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/donors/me/devices/'),
      async (route) => {
        listed = signedInDevices.filter((device) => device.current);
        await route.fulfill({ status: 204 });
      },
    );
    const firstSyncSettled = whenFirstSyncSettled(page);
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const devices = page.locator('.devices');
    await devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click();
    await firstSyncSettled();
    await recordMoves(page, 'app-devices-card');
    await recordElementsMadeInert(page, 'app-devices-card');
    await devices
      .getByRole('group', { name: 'Odhlásit iPhone · Safari?' })
      .getByRole('button', { name: 'Odhlásit', exact: true })
      .click();

    await expect(devices.locator('.device-name')).toHaveText(['Mac · Safari']);
    await expect(devices.getByText('Jinde přihlášení nejste.')).toBeVisible();
    await expect(devices.getByRole('heading', { name: 'Přihlášená zařízení' })).toBeFocused();
    await expectOnlyAShortFadeOn(page, /(^| )device-slot( |$)/);
    const otherDevice = signedInDevices.find((device) => !device.current);
    const row = `device-row-${otherDevice?.id}`;
    expect(await elementsMadeInert(page)).toEqual([row, `inside ${row}`]);
  });

  test('when they open the older sign-ins, then the row says so at once, its chevron turns at once and the rows only fade in without opening their height', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donors/me/devices',
      (route) => route.fulfill({ json: { items: [...signedInDevices, ...longUnusedDevices] } }),
    );
    const firstSyncSettled = whenFirstSyncSettled(page);
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const older = page.locator('.devices').getByRole('button', { name: /Starší \(2\)/ });
    await firstSyncSettled();
    await recordMoves(page, 'app-devices-card');
    await older.click();

    await expect(older).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#devices-older .device-name')).toHaveText([
      'iPhone · aplikace',
      'Windows · Edge',
    ]);
    await expectOnlyAShortFadeOn(page, /(^| )devices-older( |$)/);
  });

  test('when they open Změnit heslo, then the toggle says so, the current password takes the focus at once and the panel only fades in', async ({
    page,
  }) => {
    await mockDonorApi(page);
    const firstSyncSettled = whenFirstSyncSettled(page);
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const toggle = page.locator('dd.account-actions').getByRole('button', { name: 'Změnit heslo' });
    await firstSyncSettled();
    await recordMoves(page, 'app-account-card');
    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.locator('#account-password-panel').getByLabel('Současné heslo'),
    ).toBeFocused();
    await expectOnlyAShortFadeOn(page, /(^| )account-panel( |$)/);
  });

  test('when they open Jak přiřazujeme platby?, then the toggle says so at once and the help only fades in without opening its height', async ({
    page,
  }) => {
    await mockDonorApi(page);
    const firstSyncSettled = whenFirstSyncSettled(page);
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');

    const toggle = page.getByRole('button', { name: 'Jak přiřazujeme platby?' });
    await firstSyncSettled();
    await recordMoves(page, 'app-bank-accounts-card');
    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Jak přiřazujeme platby' })).toBeVisible();
    await expectOnlyAShortFadeOn(page, /accounts-help-panel/);
  });
});

test.describe('Given a donor on a computer', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test('when they cancel the password form, then the toggle takes the focus at once and the closing panel is inert, so Tab never enters it', async ({
    page,
  }) => {
    await mockDonorApi(page);
    const firstSyncSettled = whenFirstSyncSettled(page);
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const toggle = page.locator('dd.account-actions').getByRole('button', { name: 'Změnit heslo' });
    const panel = page.locator('#account-password-panel');
    await firstSyncSettled();
    await toggle.click();
    await expect(panel.getByLabel('Současné heslo')).toBeFocused();

    await panel.getByRole('button', { name: 'Zrušit' }).click();

    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toHaveAttribute('inert', '');
    await page.keyboard.press('Tab');
    expect(await panel.evaluate((element) => element.contains(document.activeElement))).toBe(false);
  });
});
