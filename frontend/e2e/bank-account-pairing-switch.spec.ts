import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { bankAccountItem, mockDonorApi, openDonorSection, signIn } from './donor-session';
import {
  heightsThroughTheMotion,
  stepAfterTheMotion,
  stepsAgainst,
  untilAtRest,
} from './motion-frames';

const SWAP_IN_MOTION = '.account-swap--opening, .account-swap--closing';

async function openVerifiedAccount(page: Page, width: number): Promise<Locator> {
  await mockDonorApi(page);
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-accounts',
    (route) => route.fulfill({ json: { items: [bankAccountItem()] } }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await page.setViewportSize({ width, height: 900 });
  await openDonorSection(page, 'Bankovní účty');
  const row = page.locator('.account').filter({ hasText: '2900233333/2010' });
  await expect(row).toBeVisible();
  await untilAtRest(row);
  return row;
}

test.describe('Given a signed-in donor with a verified bank account on a computer', () => {
  for (const motion of [
    { name: '', reducedMotion: 'no-preference' as const },
    { name: ' with reduced motion', reducedMotion: 'reduce' as const },
  ]) {
    for (const width of [1280, 900]) {
      test(`when Nepřiřazovat platby z tohoto účtu asks and Ponechat answers ${width} px wide${motion.name}, then the account row only grows while the question opens, only shrinks while it closes and stands still once the motion ends`, async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: motion.reducedMotion });
        const row = await openVerifiedAccount(page, width);

        const asking = heightsThroughTheMotion(row, SWAP_IN_MOTION);
        await row.getByRole('button', { name: /Nepřiřazovat platby z\stohoto účtu/ }).click();
        const opening = await asking;
        await expect(row.getByRole('button', { name: 'Ponechat' })).toBeFocused();

        const answering = heightsThroughTheMotion(row, SWAP_IN_MOTION);
        await row.getByRole('button', { name: 'Ponechat' }).click();
        const closing = await answering;
        await expect(
          row.getByRole('button', { name: /Nepřiřazovat platby z\stohoto účtu/ }),
        ).toBeFocused();

        expect(opening.path.length).toBeGreaterThan(1);
        expect(closing.path.length).toBeGreaterThan(1);
        expect({
          opening: stepsAgainst(opening.path, 'grows'),
          openingAfterTheMotion: stepAfterTheMotion(opening),
          closing: stepsAgainst(closing.path, 'shrinks'),
          closingAfterTheMotion: stepAfterTheMotion(closing),
        }).toEqual({
          opening: [],
          openingAfterTheMotion: [],
          closing: [],
          closingAfterTheMotion: [],
        });
        expect(Math.abs(closing.rest - opening.path[0])).toBeLessThanOrEqual(0.5);
      });
    }
  }

  test('when Ponechat is pressed while Nepřiřazovat platby z tohoto účtu is still leaving, then the focus lands on the returning button and it stays a plain block once at rest', async ({
    page,
  }) => {
    const row = await openVerifiedAccount(page, 1280);
    const exclude = row.getByRole('button', { name: /Nepřiřazovat platby z\stohoto účtu/ });

    await exclude.click();
    await expect(row.getByRole('button', { name: 'Ponechat' })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(exclude).toBeFocused();
    await untilAtRest(row);
    await expect(exclude).toBeFocused();
    expect(
      await row.evaluate((element) =>
        Array.from(element.querySelectorAll('.account-action-fold'), (fold) => ({
          moving: /--(opening|returning|closing)\b/.test(fold.className),
          display: getComputedStyle(fold).display,
        })),
      ),
    ).toEqual([{ moving: false, display: 'block' }]);
  });

  test('when Nepřiřazovat platby z tohoto účtu is pressed again while the question just answered by Ponechat is still leaving, then the focus lands on Ponechat of the new question', async ({
    page,
  }) => {
    const row = await openVerifiedAccount(page, 1280);
    const exclude = row.getByRole('button', { name: /Nepřiřazovat platby z\stohoto účtu/ });
    const keep = row.getByRole('button', { name: 'Ponechat' });

    await exclude.click();
    await expect(keep).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(exclude).toBeFocused();
    await expect(row.locator('.account-confirm.account-swap--closing')).toBeAttached();
    await page.keyboard.press('Enter');

    await expect(keep).toBeFocused();
    await untilAtRest(row);
    await expect(keep).toBeFocused();
  });

  for (const width of [1280, 900]) {
    test(`when a row asks about an older symbol ${width} px wide, then Nepřiřazovat platby z tohoto účtu stands under the question set apart by twice the row's gap`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donations/me/bank-accounts',
        (route) =>
          route.fulfill({
            json: {
              items: [
                bankAccountItem({
                  symbolOffer: {
                    variableSymbol: '6123456789',
                    paymentCount: 14,
                    firstMonth: '2025-01',
                    lastMonth: '2026-10',
                  },
                }),
              ],
            },
          }),
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await page.setViewportSize({ width, height: 900 });
      await openDonorSection(page, 'Bankovní účty');
      const row = page.locator('.account').filter({ hasText: '2900233333/2010' });
      await expect(row.locator('app-symbol-claim')).toBeVisible();
      await untilAtRest(row);

      const placed = await row.evaluate((element) => {
        const body = element.querySelector('.account-body')!;
        const question = element.querySelector('app-symbol-claim')!.getBoundingClientRect();
        const button = element.querySelector('.account-action')!.getBoundingClientRect();
        return {
          offset: Math.round(button.top - question.bottom),
          twiceTheGap: Math.round(2 * parseFloat(getComputedStyle(body).rowGap)),
        };
      });
      expect(placed.offset).toBe(placed.twiceTheGap);
    });
  }
});
