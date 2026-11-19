import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  administrator,
  adminSettings,
  mockDonorApi,
  openUnlockedAdministrationPage,
  session,
} from './donor-session';

interface Move {
  readonly on: string;
  readonly property: string;
  readonly duration: number;
}

const SETTINGS = '/api/admin/operations/settings';
const SUMMARY = 'Adresa webu, server pro odesílání e-mailů a napojení na banku';
const INSTANT_MS = 1;

async function openSettings(page: Page): Promise<void> {
  await mockDonorApi(page);
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.route(
    (url) => url.pathname === SETTINGS,
    (route) => route.fulfill({ json: adminSettings }),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
  await openUnlockedAdministrationPage(page, '/sprava/nastaveni', 'Nastavení');
}

async function recordMoves(page: Page, within: string): Promise<void> {
  await page.evaluate((within) => {
    const moves: Move[] = [];
    (window as unknown as { recordedMoves: Move[] }).recordedMoves = moves;
    document.addEventListener(
      'transitionrun',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest(within)) {
          return;
        }
        const transition = target
          .getAnimations()
          .find(
            (animation) =>
              animation instanceof CSSTransition &&
              animation.transitionProperty === event.propertyName,
          );
        moves.push({
          on: target.getAttribute('class') ?? '',
          property: event.propertyName,
          duration: Number(transition?.effect?.getComputedTiming().duration ?? 0),
        });
      },
      true,
    );
  }, within);
}

function recordedMoves(page: Page): Promise<Move[]> {
  return page.evaluate(() => (window as unknown as { recordedMoves: Move[] }).recordedMoves);
}

function moved(moves: readonly Move[], on: RegExp, property: string): boolean {
  return moves.some(
    (move) => on.test(move.on) && move.property === property && move.duration > INSTANT_MS,
  );
}

test.describe('Given an administrator on a computer on the settings page', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test('when they open the technical settings, then the chevron turns, the parts open their height and the first field is reachable', async ({
    page,
  }) => {
    await openSettings(page);
    const details = page.locator('details#technicke-nastaveni');
    await expect(details.locator('summary svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#setting-PUBLIC_URL')).toBeHidden();

    await recordMoves(page, 'details#technicke-nastaveni');
    await page.getByText(SUMMARY).click();

    await expect(page.locator('#setting-PUBLIC_URL')).toBeVisible();
    await page.locator('#setting-PUBLIC_URL').focus();
    await expect(page.locator('#setting-PUBLIC_URL')).toBeFocused();
    await expect
      .poll(async () => {
        const moves = await recordedMoves(page);
        return [
          moved(moves, /details-chevron/, 'transform'),
          moved(moves, /details-body/, 'grid-template-rows'),
        ];
      })
      .toEqual([true, true]);
  });
});

test.describe('Given an administrator on a computer who asks for less motion, on the settings page', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

  test('when they open the technical settings, then the parts only fade in without opening their height', async ({
    page,
  }) => {
    await openSettings(page);

    await recordMoves(page, 'details#technicke-nastaveni');
    await page.getByText(SUMMARY).click();

    await expect(page.locator('#setting-PUBLIC_URL')).toBeVisible();
    await expect
      .poll(async () => moved(await recordedMoves(page), /details-body/, 'opacity'))
      .toBe(true);
    const moves = await recordedMoves(page);
    expect(
      moves.filter(
        (move) =>
          move.duration > INSTANT_MS && ['grid-template-rows', 'transform'].includes(move.property),
      ),
    ).toEqual([]);
  });
});
