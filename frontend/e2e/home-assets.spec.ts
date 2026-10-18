import { expect, test } from '@playwright/test';
import { mockDonorApi } from './donor-session';

test.describe('Given a visitor on the home page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when it loads, then nothing is fetched from another site and the fonts are the site\'s own', async ({ page, baseURL }) => {
    const elsewhere: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(baseURL!) && !request.url().startsWith('data:')) {
        elsewhere.push(request.url());
      }
    });

    await page.goto('/');
    await page.waitForFunction(() => {
      const loaded = [...document.fonts].filter((face) => face.status === 'loaded');
      return (
        loaded.some((face) => face.family.includes('Playfair Display') && face.style === 'italic') &&
        loaded.some((face) => face.family.includes('Inter'))
      );
    });

    expect(elsewhere).toEqual([]);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('when it loads, then the photos the phone layout hides are never downloaded', async ({ page }) => {
      const images: string[] = [];
      page.on('request', (request) => {
        if (request.resourceType() === 'image') {
          images.push(new URL(request.url()).pathname);
        }
      });

      await page.goto('/');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState('networkidle');

      expect(images.filter((path) => path.startsWith('/images/about-') || path.startsWith('/images/donate-'))).toEqual([]);
      expect(images.some((path) => path.startsWith('/images/hero-'))).toBe(true);
    });
  });
});
