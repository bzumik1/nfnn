import type { Locator, Page } from '@playwright/test';
import { mockDonorApi, rememberedDonorSession } from './donor-session';
import { expect, test } from './fixtures';

const NO_TINT = 'rgba(0, 0, 0, 0)';

interface TintWatch {
  tintTransitions: string[];
}

async function watchTint(control: Locator): Promise<void> {
  await control.evaluate((element) => {
    const watch = window as unknown as TintWatch;
    watch.tintTransitions = [];
    for (const type of ['transitionrun', 'transitionend']) {
      element.addEventListener(type, (event) => {
        if ((event as TransitionEvent).propertyName === '--pressed-tint') {
          watch.tintTransitions.push(type);
        }
      });
    }
  });
}

function tintTransitions(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as TintWatch).tintTransitions);
}

function tintOf(control: Locator): Promise<string> {
  return control.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--pressed-tint').trim(),
  );
}

async function expectTintFadesBack(page: Page, control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await watchTint(control);
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect.poll(() => tintOf(control)).not.toBe(NO_TINT);
  expect(await tintTransitions(page)).toEqual([]);

  await page.mouse.move(0, 0);
  await page.mouse.up();

  await expect.poll(() => tintTransitions(page)).toEqual(['transitionrun', 'transitionend']);
  expect(await tintOf(control)).toBe(NO_TINT);
}

test.describe('Given a visitor pressing and releasing a control', () => {
  test('when they let go of a bare link in the text, then its tint came at once and fades back to nothing', async ({
    page,
  }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');

    await expectTintFadesBack(page, page.getByRole('link', { name: 'kontaktní formulář' }));
  });

  test('when they let go of a copy pill with a background of its own, then its tint came at once and fades back to nothing', async ({
    page,
  }) => {
    await page.goto('/prispet');

    await expectTintFadesBack(page, page.getByRole('button', { name: 'Kopírovat číslo účtu' }));
  });

  test('when a signed-in donor lets go of a row of a list, then its tint came at once and fades back to nothing', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await rememberedDonorSession(page);
    await page.goto('/darce/ucty');

    await expectTintFadesBack(page, page.locator('.accounts-add'));
  });
});
