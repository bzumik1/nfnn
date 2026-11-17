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

async function recordMoves(page: Page): Promise<void> {
  await page.evaluate(() => {
    const moves: Move[] = [];
    const frameKeys = new Set(['offset', 'computedOffset', 'easing', 'composite']);
    (window as unknown as { recordedMoves: Move[] }).recordedMoves = moves;
    const record = (target: EventTarget | null, animation: Animation | undefined) => {
      if (!(target instanceof Element) || animation === undefined) {
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
  });
}

async function recordRowsMadeInert(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rows: string[] = [];
    (window as unknown as { inertRows: string[] }).inertRows = rows;
    new MutationObserver((records) => {
      for (const { target } of records) {
        if (target instanceof Element && target.hasAttribute('inert') && target.isConnected) {
          rows.push(target.id);
        }
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['inert'], subtree: true });
  });
}

function rowsMadeInert(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { inertRows: string[] }).inertRows);
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

async function expectOnlyInstantChangesOrShortFades(page: Page): Promise<Move[]> {
  const moves = await recordedMoves(page);
  const reduced = await reducedDuration(page);
  for (const move of moves.filter((candidate) => candidate.duration > INSTANT_MS)) {
    expect(
      move.properties.filter((property) => MOVING.has(property) || SIZING.has(property)),
      move.on,
    ).toEqual([]);
    expect(move.duration, move.on).toBeLessThanOrEqual(reduced);
  }
  return moves;
}

function fadesOn(moves: readonly Move[], className: RegExp): boolean {
  return moves.some(
    (move) =>
      className.test(move.on) && move.duration > INSTANT_MS && move.properties.includes('opacity'),
  );
}

test.describe('Given a donor on a computer who asks for less motion', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

  test('when they sign out their only other device, then its row is out of reach at once, only fades away without closing its height, and the heading takes the focus', async ({
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
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const devices = page.locator('.devices');
    await devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click();
    await recordMoves(page);
    await recordRowsMadeInert(page);
    await devices
      .getByRole('group', { name: 'Odhlásit iPhone · Safari?' })
      .getByRole('button', { name: 'Odhlásit', exact: true })
      .click();

    await expect(devices.locator('.device-name')).toHaveText(['Mac · Safari']);
    await expect(devices.getByText('Jinde přihlášení nejste.')).toBeVisible();
    await expect(devices.getByRole('heading', { name: 'Přihlášená zařízení' })).toBeFocused();
    const moves = await expectOnlyInstantChangesOrShortFades(page);
    expect(fadesOn(moves, /(^| )device-slot( |$)/)).toBe(true);
    const otherDevice = signedInDevices.find((device) => !device.current);
    expect(await rowsMadeInert(page)).toEqual([`device-row-${otherDevice?.id}`]);
  });

  test('when they open the older sign-ins, then the row says so at once, its chevron turns at once and the rows only fade in without opening their height', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donors/me/devices',
      (route) => route.fulfill({ json: { items: [...signedInDevices, ...longUnusedDevices] } }),
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const older = page.locator('.devices').getByRole('button', { name: /Starší \(2\)/ });
    await recordMoves(page);
    await older.click();

    await expect(older).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#devices-older .device-name')).toHaveText([
      'iPhone · aplikace',
      'Windows · Edge',
    ]);
    const moves = await expectOnlyInstantChangesOrShortFades(page);
    expect(fadesOn(moves, /(^| )devices-older( |$)/)).toBe(true);
  });

  test('when they open Změnit heslo, then the toggle says so, the current password takes the focus at once and the panel only fades in', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const toggle = page.locator('dd.account-actions').getByRole('button', { name: 'Změnit heslo' });
    await recordMoves(page);
    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.locator('#account-password-panel').getByLabel('Současné heslo'),
    ).toBeFocused();
    const moves = await expectOnlyInstantChangesOrShortFades(page);
    expect(fadesOn(moves, /(^| )account-panel( |$)/)).toBe(true);
  });

  test('when they open Jak přiřazujeme platby?, then the toggle says so at once and the help only fades in without opening its height', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');

    const toggle = page.getByRole('button', { name: 'Jak přiřazujeme platby?' });
    await recordMoves(page);
    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Jak přiřazujeme platby' })).toBeVisible();
    const moves = await expectOnlyInstantChangesOrShortFades(page);
    expect(fadesOn(moves, /accounts-help-panel/)).toBe(true);
  });
});
