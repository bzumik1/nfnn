import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  bankAccountItem,
  mockDonorApi,
  openAccountItem,
  openDonorSection,
  signIn,
} from './donor-session';
import {
  heightsThroughTheMotion,
  scrollThroughTheMotion,
  stepAfterTheMotion,
  stepsAgainst,
  stepsBack,
  untilAtRest,
} from './motion-frames';

const SWAP_IN_MOTION = '.account-swap--opening, .account-swap--closing';

interface SwapPart {
  readonly className: string;
  readonly display: string;
}

async function pressOnFocus(row: Locator, focused: string, leaving: string): Promise<void> {
  await row.evaluate(
    (element, selectors) => {
      element.dataset['pressedOnFocus'] = 'waiting';
      const pressed = (event: FocusEvent) => {
        const target = event.target as HTMLElement;
        if (!target.matches(selectors.focused)) {
          return;
        }
        element.removeEventListener('focusin', pressed);
        setTimeout(() => {
          element.dataset['pressedOnFocus'] =
            element.querySelector(selectors.leaving) === null
              ? 'without the leaving part'
              : 'while leaving';
          target.click();
        });
      };
      element.addEventListener('focusin', pressed);
    },
    { focused, leaving },
  );
}

const FRAMES_BEFORE_THE_SCROLL = 10;

async function scrollAwayOnceRestored(row: Locator, restored: string): Promise<void> {
  await row.evaluate(
    (element, { selector, frames }) => {
      element.dataset['scrolledAway'] = 'waiting';
      const scrollAway = (event: FocusEvent) => {
        const target = event.target as HTMLElement;
        if (!target.matches(selector)) {
          return;
        }
        element.removeEventListener('focusin', scrollAway);
        const motions = element
          .getAnimations({ subtree: true })
          .filter((motion) => Number.isFinite(Number(motion.effect?.getComputedTiming().endTime)));
        void Promise.allSettled(motions.map((motion) => motion.finished)).then(() => {
          let framesLeft = frames;
          const afterFrames = () => {
            framesLeft -= 1;
            if (framesLeft > 0) {
              requestAnimationFrame(afterFrames);
              return;
            }
            const before = window.scrollY;
            window.scrollBy({ top: 600, behavior: 'instant' });
            const placed = target.getBoundingClientRect();
            element.dataset['scrolledAway'] =
              window.scrollY !== before && (placed.top < 0 || placed.bottom > window.innerHeight)
                ? 'out of view'
                : 'still in view';
          };
          requestAnimationFrame(afterFrames);
        });
      };
      element.addEventListener('focusin', scrollAway);
    },
    { selector: restored, frames: FRAMES_BEFORE_THE_SCROLL },
  );
}

function pressedOnFocus(row: Locator): Promise<string | null> {
  return row.getAttribute('data-pressed-on-focus');
}

function swapParts(row: Locator): Promise<SwapPart[]> {
  return row.evaluate((element) =>
    Array.from(element.querySelectorAll<HTMLElement>('.account-swap'), (part) => ({
      className: part.className,
      display: getComputedStyle(part).display,
    })),
  );
}

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

    await pressOnFocus(row, '.account-confirm-no', '.account-action-fold.account-swap--closing');
    await exclude.click();
    await expect.poll(() => pressedOnFocus(row)).toBe('while leaving');

    await expect(exclude).toBeFocused();
    await untilAtRest(row);
    await expect(exclude).toBeFocused();
    await expect
      .poll(async () =>
        (await swapParts(row)).map((part) => ({
          className: part.className,
          display: part.display,
        })),
      )
      .toEqual([{ className: 'account-action-fold account-swap', display: 'block' }]);
  });

  test('when Nepřiřazovat platby z tohoto účtu is pressed again while the question just answered by Ponechat is still leaving, then the focus lands on Ponechat of the new question', async ({
    page,
  }) => {
    const row = await openVerifiedAccount(page, 1280);
    const exclude = row.getByRole('button', { name: /Nepřiřazovat platby z\stohoto účtu/ });
    const keep = row.getByRole('button', { name: 'Ponechat' });

    await exclude.click();
    await expect(keep).toBeFocused();
    await pressOnFocus(row, '.account-action', '.account-confirm.account-swap--closing');
    await page.keyboard.press('Enter');
    await expect.poll(() => pressedOnFocus(row)).toBe('while leaving');

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

const LARGEST_SYSTEM_TEXT_PX = 53;

test.describe('Given a donor on a 375 pt iPhone whose app shows the largest accessibility text and a verified bank account', () => {
  for (const motion of [
    { name: '', reducedMotion: 'no-preference' as const },
    { name: ' with reduced motion', reducedMotion: 'reduce' as const },
  ]) {
    test(`when Nepřiřazovat platby z tohoto účtu asks and Ponechat answers${motion.name}, then each button that takes the focus stands wholly in view once the row has settled and the page moves one way while it gets there`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: motion.reducedMotion });
      await page.addInitScript((px) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = `html { font-size: ${px}px; }`;
          document.head.append(style);
        });
      }, LARGEST_SYSTEM_TEXT_PX);
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donations/me/bank-accounts',
        (route) => route.fulfill({ json: { items: [bankAccountItem()] } }),
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await page.setViewportSize({ width: 375, height: 667 });
      await openAccountItem(page, 'Bankovní účty');
      const row = page.locator('.account').filter({ hasText: '2900233333/2010' });
      const exclude = row.getByRole('button', { name: /Nepřiřazovat platby z\stohoto účtu/ });
      const keep = row.getByRole('button', { name: 'Ponechat' });
      await expect(exclude).toBeVisible();
      await untilAtRest(row);

      await exclude.click();
      await expect(keep).toBeFocused();
      await untilAtRest(row);
      await expect(keep).toBeInViewport({ ratio: 1 });

      await keep.scrollIntoViewIfNeeded();
      const scrolling = scrollThroughTheMotion(row, SWAP_IN_MOTION);
      await keep.click();
      const scrolled = await scrolling;
      await expect(exclude).toBeFocused();
      await untilAtRest(row);
      await expect(exclude).toBeInViewport({ ratio: 1 });
      await expect(exclude).toBeFocused();
      expect(stepsBack(scrolled), JSON.stringify(scrolled)).toEqual([]);
    });
  }
});

test.describe('Given a donor on the Bankovní účty page of a 375 pt iPhone whose app shows the largest accessibility text', () => {
  for (const motion of [
    { name: '', reducedMotion: 'no-preference' as const },
    { name: ' with reduced motion', reducedMotion: 'reduce' as const },
  ]) {
    test(`when something else scrolls the page right after Ponechat restores Nepřiřazovat platby z tohoto účtu${motion.name}, then the focused button still ends wholly in view`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: motion.reducedMotion });
      await page.addInitScript((px) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = `html { font-size: ${px}px; }`;
          document.head.append(style);
        });
      }, LARGEST_SYSTEM_TEXT_PX);
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donations/me/bank-accounts',
        (route) => route.fulfill({ json: { items: [bankAccountItem()] } }),
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await openDonorSection(page, 'Bankovní účty');
      await page.setViewportSize({ width: 375, height: 667 });
      const row = page.locator('.account').filter({ hasText: '2900233333/2010' });
      const exclude = row.getByRole('button', { name: /Nepřiřazovat platby z\stohoto účtu/ });
      const keep = row.getByRole('button', { name: 'Ponechat' });
      await expect(exclude).toBeVisible();
      await untilAtRest(row);
      await exclude.click();
      await expect(keep).toBeFocused();
      await untilAtRest(row);
      await expect(keep).toBeInViewport({ ratio: 1 });

      await scrollAwayOnceRestored(row, '.account-action');
      await keep.click();
      await expect(exclude).toBeFocused();
      await expect.poll(() => row.getAttribute('data-scrolled-away')).toBe('out of view');

      await expect(exclude).toBeInViewport({ ratio: 1 });
      await expect(exclude).toBeFocused();
    });
  }
});
