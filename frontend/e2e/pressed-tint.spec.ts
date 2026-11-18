import type { Locator, Page } from '@playwright/test';
import { mockDonorApi, rememberedDonorSession } from './donor-session';
import { expect, test } from './fixtures';

const NO_TINT = '0%';

interface PressWatch {
  pressTransitions: string[];
}

async function watchPress(control: Locator, property: string): Promise<void> {
  await control.evaluate((element, watched) => {
    const watch = window as unknown as PressWatch;
    watch.pressTransitions = [];
    for (const type of ['transitionrun', 'transitionend']) {
      element.addEventListener(type, (event) => {
        if ((event as TransitionEvent).propertyName === watched) {
          watch.pressTransitions.push(type);
        }
      });
    }
  }, property);
}

function pressTransitions(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as PressWatch).pressTransitions);
}

function valueOf(control: Locator, property: string): Promise<string> {
  return control.evaluate(
    (element, watched) => getComputedStyle(element).getPropertyValue(watched).trim(),
    property,
  );
}

async function expectPressFadesBack(
  page: Page,
  control: Locator,
  property: string,
  rest: string,
): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await watchPress(control, property);
  expect(await valueOf(control, property)).toBe(rest);
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect.poll(() => valueOf(control, property)).not.toBe(rest);
  expect(await pressTransitions(page)).toEqual([]);

  await page.mouse.move(0, 0);
  await page.mouse.up();

  await expect.poll(() => pressTransitions(page)).toEqual(['transitionrun', 'transitionend']);
  expect(await valueOf(control, property)).toBe(rest);
}

function expectTintFadesBack(page: Page, control: Locator): Promise<void> {
  return expectPressFadesBack(page, control, '--pressed-tint', NO_TINT);
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

  test('when they let go of a button that darkens, then it darkened at once and lightens back by a fade', async ({
    page,
  }) => {
    await page.goto('/stranka-ktera-neexistuje');

    await expectPressFadesBack(
      page,
      page.getByRole('link', { name: 'Zpět na úvodní stránku' }),
      'filter',
      'none',
    );
  });

  test('when a signed-in donor lets go of a text button that turns transparent, then it turned at once and comes back by a fade', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await rememberedDonorSession(page);
    await page.goto('/darce/ucty');

    await expectPressFadesBack(page, page.locator('.accounts-help'), 'opacity', '1');
  });
});
