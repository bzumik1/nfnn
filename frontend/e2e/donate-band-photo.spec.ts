import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, samplePngBase64 } from './donor-session';

const BAND_PHOTO_ID = '0199f3e0-0000-7000-8000-00000000b101';

const BAND_PHOTO = {
  id: BAND_PHOTO_ID,
  url: `/api/content/media/${BAND_PHOTO_ID}`,
  width: 1600,
  height: 1067,
  alt: 'Usměvavá dívka na zahradě',
  focalPoint: { x: 62, y: 28 },
};

interface ShadeAtFocus {
  textShadeCoversFocus: boolean;
  photoShadeCoversFocus: boolean;
}

async function serveBandPhoto(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/home',
    (route) =>
      route.fulfill({ json: { news: [], projects: [], donateBand: { photo: BAND_PHOTO } } }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) =>
      route.fulfill({ contentType: 'image/png', body: Buffer.from(samplePngBase64, 'base64') }),
  );
}

async function shadeAtFocus(page: Page): Promise<ShadeAtFocus> {
  return page.locator('app-donate-band .band').evaluate((band) => {
    const photo = band.querySelector('.band-photo')!;
    const image = photo.querySelector('img')!;
    const text = band.querySelector<HTMLElement>('.band-text')!;
    const imageBox = image.getBoundingClientRect();
    const [focusX, focusY] = getComputedStyle(image).objectPosition.split(' ').map(parseFloat);
    const focus = {
      x: imageBox.left + (imageBox.width * focusX) / 100,
      y: imageBox.top + (imageBox.height * focusY) / 100,
    };

    const textBox = text.getBoundingClientRect();
    const focusUnderText =
      focus.x >= textBox.left &&
      focus.x <= textBox.right &&
      focus.y >= textBox.top &&
      focus.y <= textBox.bottom;
    const shadeEnd = document.createElement('div');
    shadeEnd.style.position = 'absolute';
    shadeEnd.style.left = '0';
    shadeEnd.style.top = '0';
    shadeEnd.style.height = '1px';
    shadeEnd.style.width = 'var(--fade-end)';
    text.append(shadeEnd);
    const shadeEndX = shadeEnd.getBoundingClientRect().right;
    shadeEnd.remove();

    const photoShade = getComputedStyle(photo, '::after');
    const photoShadeTop =
      photoShade.content === 'none'
        ? Infinity
        : photo.getBoundingClientRect().bottom - parseFloat(photoShade.height);

    return {
      textShadeCoversFocus: focusUnderText && focus.x < shadeEndX,
      photoShadeCoversFocus: focus.y > photoShadeTop,
    };
  });
}

for (const screen of [
  { name: 'a computer at 900 px', width: 900, height: 800, textSize: '100%' },
  { name: 'a computer at 1280 px with 200 % text', width: 1280, height: 900, textSize: '200%' },
  { name: 'a computer at 1280 px', width: 1280, height: 900, textSize: '100%' },
  { name: 'a computer at 1920 px', width: 1920, height: 1080, textSize: '100%' },
]) {
  test.describe(`Given a visitor on ${screen.name} on O nás with the band photo’s focal point set`, () => {
    test.use({ viewport: { width: screen.width, height: screen.height }, reducedMotion: 'reduce' });

    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page);
      await serveBandPhoto(page);
    });

    test('when they reach the closing Přispět band, then its photo’s focal point lies outside the shade of its text and of its lower edge', async ({
      page,
    }) => {
      await page.goto('/o-nas');
      await page.addStyleTag({ content: `html { font-size: ${screen.textSize}; }` });
      const band = page.locator('app-donate-band .band');
      await expect(band).toBeVisible();
      await band.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);

      await expect
        .poll(() => shadeAtFocus(page))
        .toEqual({ textShadeCoversFocus: false, photoShadeCoversFocus: false });
    });
  });
}
