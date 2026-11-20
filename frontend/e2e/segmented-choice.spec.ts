import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  mockDonorApi,
  openSignInDialog,
  secondFactorRecovery,
  secondFactorRequired,
} from './donor-session';
import { highlightColours, segmentLayouts, themeWeights, withoutWeight } from './segmented';

test.describe('Given a visitor at the choice between Přihlášení and Registrace', () => {
  for (const width of [1280, 390]) {
    test(`when they switch to Registrace ${width} px wide, then the chosen label turns semibold and the other regular while no segment or label moves`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await openSignInDialog(page);
      await page.setViewportSize({ width, height: 844 });
      const segments = page.getByRole('dialog').locator('.tab-switch > button');
      await expect(segments).toHaveCount(2);
      const weights = await themeWeights(segments);
      const before = await segmentLayouts(segments);

      await segments.nth(1).click();

      await expect(segments.nth(1)).toHaveAttribute('aria-pressed', 'true');
      const after = await segmentLayouts(segments);
      expect(before.map((segment) => segment.weight)).toEqual([weights.semibold, weights.regular]);
      expect(after.map((segment) => segment.weight)).toEqual([weights.regular, weights.semibold]);
      expect(withoutWeight(after)).toEqual(withoutWeight(before));
    });
  }

  for (const { pose, width, height } of [
    { pose: 'a computer', width: 1280, height: 800 },
    { pose: 'an iPad on its side', width: 1194, height: 834 },
  ]) {
    test(`when they switch to Registrace and back on ${pose}, then neither the dialog's frame nor the switch moves or changes its width`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await openSignInDialog(page);
      await page.setViewportSize({ width, height });
      const dialog = page.getByRole('dialog');
      const segments = dialog.locator('.tab-switch > button');
      const frames = async () => {
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                document.getAnimations().filter((motion) => motion.playState === 'running').length,
            ),
          )
          .toBe(0);
        return Promise.all(
          [dialog.locator('.dialog-panel'), dialog.locator('.tab-switch')].map((part) =>
            part.evaluate((element) => {
              const box = element.getBoundingClientRect();
              return {
                left: Math.round(box.left),
                top: Math.round(box.top),
                width: Math.round(box.width),
              };
            }),
          ),
        );
      };
      const signIn = await frames();

      await segments.nth(1).click();
      await expect(dialog.locator('#register-email')).toBeVisible();
      const registration = await frames();
      await segments.nth(0).click();
      await expect(dialog.locator('#login-email')).toBeVisible();

      expect(registration).toEqual(signIn);
      expect(await frames()).toEqual(signIn);
    });
  }

  test('when the system forces its own colours, then the chosen tab is drawn in Highlight with HighlightText', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.emulateMedia({ forcedColors: 'active' });
    await openSignInDialog(page);
    const chosen = page.getByRole('dialog').locator('.tab-switch > button').first();
    await expect(chosen).toHaveAttribute('aria-pressed', 'true');

    const highlight = await highlightColours(chosen);
    await expect(chosen).toHaveCSS('background-color', highlight.background);
    await expect(chosen).toHaveCSS('color', highlight.text);
  });
});

async function dialogFrame(page: Page): Promise<{ left: number; top: number; width: number }> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getAnimations().filter((motion) => motion.playState === 'running').length,
      ),
    )
    .toBe(0);
  return page
    .getByRole('dialog')
    .locator('.dialog-panel')
    .evaluate((panel) => {
      const box = panel.getBoundingClientRect();
      return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width) };
    });
}

async function signInWithSecondFactor(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
  const dialog = page.getByRole('dialog');
  await dialog.locator('#login-email').fill('jana@example.cz');
  await dialog.locator('#login-password').fill('correct horse battery');
  await dialog.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  await expect(dialog.locator('#login-code')).toBeVisible();
}

async function register(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Registrace' }).click();
  await dialog.locator('#register-name').fill('Jana Nováková');
  await dialog.locator('#register-street').fill('Dlouhá 12');
  await dialog.locator('#register-postal-code').fill('400 01');
  await dialog.locator('#register-city').fill('Ústí nad Labem');
  await dialog.locator('#register-email').fill('jana@example.cz');
  await dialog.locator('#register-password').fill('correct horse battery');
  await dialog.getByRole('button', { name: 'Vytvořit účet' }).click();
}

const STEPS: { step: string; reach: (page: Page) => Promise<void> }[] = [
  {
    step: 'the registration',
    reach: async (page) => {
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Registrace' }).click();
      await expect(dialog.locator('#register-name')).toBeVisible();
    },
  },
  {
    step: 'the registration sent',
    reach: async (page) => {
      await page.route('**/api/donors/auth/register', (route) =>
        route.fulfill({ status: 202, body: '' }),
      );
      await register(page);
      await expect(
        page.getByRole('dialog').getByRole('heading', { name: 'Zkontrolujte si e-mail' }),
      ).toBeFocused();
    },
  },
  {
    step: 'the code from the app',
    reach: signInWithSecondFactor,
  },
  {
    step: 'the recovery by payment',
    reach: async (page) => {
      await page.route('**/api/donors/auth/login/second-factor/recovery', (route) =>
        route.fulfill({ json: secondFactorRecovery }),
      );
      await signInWithSecondFactor(page);
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Obnovit přístup platbou' }).click();
      await expect(dialog.getByRole('heading', { name: 'Obnova přístupu platbou' })).toBeFocused();
    },
  },
  {
    step: 'the password reset',
    reach: async (page) => {
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Zapomněli jste heslo?' }).click();
      await expect(dialog.locator('#reset-email')).toBeVisible();
    },
  },
  {
    step: 'the reset link sent',
    reach: async (page) => {
      await page.route('**/api/donors/auth/password-reset/request', (route) =>
        route.fulfill({ status: 202, body: '' }),
      );
      const dialog = page.getByRole('dialog');
      await dialog.locator('#login-email').fill('jana@example.cz');
      await dialog.getByRole('button', { name: 'Zapomněli jste heslo?' }).click();
      await dialog.getByRole('button', { name: 'Odeslat odkaz' }).click();
      await expect(dialog.getByRole('heading', { name: 'Zkontrolujte si e-mail' })).toBeFocused();
    },
  },
];

for (const { pose, width, height } of [
  { pose: 'a computer', width: 1280, height: 800 },
  { pose: 'an iPad on its side', width: 1194, height: 834 },
]) {
  test.describe(`Given the sign-in dialog on ${pose}`, () => {
    for (const { step, reach } of STEPS) {
      test(`when the visitor goes on to ${step}, then the dialog's frame keeps the sign-in's left edge, top edge and width`, async ({
        page,
      }) => {
        await mockDonorApi(page);
        await openSignInDialog(page);
        await page.setViewportSize({ width, height });
        const signIn = await dialogFrame(page);

        await reach(page);

        expect(await dialogFrame(page)).toEqual(signIn);
      });
    }
  });
}
