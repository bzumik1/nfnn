import { expect, test } from './fixtures';
import { mockDonorApi, openSignInDialog } from './donor-session';
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
