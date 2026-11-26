import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';

const EDGE_TOLERANCE_PX = 1;

for (const viewport of [
  { width: 820, height: 1180, device: 'an iPad upright' },
  { width: 1280, height: 900, device: 'a computer' },
]) {
  test.describe(`Given a visitor on O nás on ${viewport.device}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
    });

    test('when the intro shows its text beside the photo, then the photo column ends where the figures end', async ({
      page,
    }) => {
      await page.goto('/o-nas');
      await expect(page.locator('.intro .figures .stat').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));

      const columns = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const frame = box('.intro-frame');
        const rest = box('.intro-rest');
        return {
          beside: frame.left > rest.right,
          endsApart: Math.abs(frame.bottom - rest.bottom),
        };
      });
      expect(columns.beside).toBe(true);
      expect(columns.endsApart).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
    });
  });
}
