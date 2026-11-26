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
  { name: 'an iPad Pro 11" upright', width: 834, height: 1194, textSize: '100%' },
  { name: 'a phone on its side', width: 844, height: 390, textSize: '100%' },
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

const PIXEL_TOLERANCE = 1;

interface MeasuredBand {
  photoHeight: number;
  photoTopToDonateBottom: number;
  textInset: number;
  windowHeight: number;
}

async function measuredBand(page: Page, textSize: string): Promise<MeasuredBand> {
  await page.goto('/o-nas');
  await page.addStyleTag({ content: `html { font-size: ${textSize}; }` });
  const band = page.locator('app-donate-band .band');
  await expect(band).toBeVisible();
  await band.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);

  return band.evaluate((element) => {
    const bandBox = element.getBoundingClientRect();
    const photo = element.querySelector('.band-photo')!.getBoundingClientRect();
    const title = element.querySelector('.band-title')!.getBoundingClientRect();
    const donate = element.querySelector('.band-donate')!.getBoundingClientRect();
    return {
      photoHeight: photo.height,
      photoTopToDonateBottom: donate.bottom - photo.top,
      textInset: title.left - bandBox.left,
      windowHeight: window.innerHeight,
    };
  });
}

for (const screen of [
  { name: 'a 1080 px display with 200 % text', width: 1920, height: 1080, textSize: '200%' },
  { name: 'a phone on its side', width: 844, height: 390, textSize: '100%' },
]) {
  test.describe(`Given a visitor on ${screen.name} (${screen.width} × ${screen.height}), where the Přispět band stands its photo above its text`, () => {
    test.use({ viewport: { width: screen.width, height: screen.height }, reducedMotion: 'reduce' });

    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page);
      await serveBandPhoto(page);
    });

    test('when they reach the band on O nás, then its photo takes at most half of the window’s height', async ({
      page,
    }) => {
      const band = await measuredBand(page, screen.textSize);

      expect(band.photoHeight).toBeLessThanOrEqual(band.windowHeight / 2 + PIXEL_TOLERANCE);
    });
  });
}

test.describe('Given a visitor on a 1080 px display with 200 % text on O nás', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await serveBandPhoto(page);
  });

  test('when they reach the closing Přispět band, then its photo and its Přispět button fit one screen', async ({
    page,
  }) => {
    const band = await measuredBand(page, '200%');

    expect(band.photoTopToDonateBottom).toBeLessThanOrEqual(band.windowHeight);
  });
});

test.describe('Given a visitor on a computer at 1280 px on O nás', () => {
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await serveBandPhoto(page);
  });

  test('when they enlarge the text to 200 % and the band stands its photo above its text, then its text keeps the inset it has beside the photo', async ({
    page,
  }) => {
    const besideThePhoto = await measuredBand(page, '100%');
    const underThePhoto = await measuredBand(page, '200%');

    expect(underThePhoto.textInset).toBeGreaterThanOrEqual(
      besideThePhoto.textInset - PIXEL_TOLERANCE,
    );
  });
});
