import { expect, test } from './fixtures';
import { mockDonorApi, openSignInDialog } from './donor-session';
import { segmentLayouts, themeWeights, withoutWeight } from './segmented';

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
});
