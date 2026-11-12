import AxeBuilder from '@axe-core/playwright';
import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { article, mockPublicContent, project } from './baseline/screen-mocks';
import { mockDonorApi, openSignInDialog, signIn } from './donor-session';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PAGE_PINCH_STOPPED_JAKUB_2026_10_31 = 'meta-viewport';
const QR_NAME = 'QR platba na účet Nadačního fondu Nová naděje';
const DARK_LUMINANCE = 0.05;
const LIGHT_LUMINANCE = 0.8;

async function luminanceOf(target: Locator, property: string): Promise<number> {
  return target.evaluate((element, name) => {
    const written = getComputedStyle(element).getPropertyValue(name);
    const channels = (written.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const [r, g, b] = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }, property);
}

async function violations(page: Page): Promise<string[]> {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_AA)
    .disableRules([PAGE_PINCH_STOPPED_JAKUB_2026_10_31])
    .analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
}

function headerLogo(page: Page): Locator {
  return page.getByRole('banner').getByRole('img', { name: 'Nová naděje – nadační fond' });
}

async function shownSource(image: Locator): Promise<string> {
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.complete))
    .toBe(true);
  return image.evaluate((element: HTMLImageElement) => new URL(element.currentSrc).pathname);
}

test.describe('Given a visitor whose device shows the light appearance', () => {
  test.use({ colorScheme: 'light' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when About opens, then the page stays white with dark text and the dark logo, as before the dark appearance', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(await luminanceOf(page.locator('body'), 'background-color')).toBe(1);
    expect(await luminanceOf(page.getByRole('heading', { level: 1 }), 'color')).toBeLessThan(
      DARK_LUMINANCE,
    );
    expect(await shownSource(headerLogo(page))).toBe('/images/logo.svg');
  });
});

test.describe('Given a visitor whose device shows the dark appearance', () => {
  test.use({ colorScheme: 'dark' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when the site opens, then it declares both appearances, so the browser draws its own controls dark too', async ({
    page,
  }) => {
    await page.goto('/o-nas');

    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute(
      'content',
      'light dark',
    );
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
      .toBe('dark');
  });

  test('when About opens, then the page turns dark with light text and the header shows the logo for a dark background', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    expect(await luminanceOf(page.locator('body'), 'background-color')).toBeLessThan(
      DARK_LUMINANCE,
    );
    expect(await luminanceOf(heading, 'color')).toBeGreaterThan(LIGHT_LUMINANCE);
    expect(await shownSource(headerLogo(page))).toBe('/images/logo-on-dark.svg');
  });

  test('when the sign-in dialog opens, then it is dark and shows the logo for a dark background', async ({
    page,
  }) => {
    await openSignInDialog(page);
    const dialog = page.getByRole('dialog');

    expect(await shownSource(dialog.getByRole('img', { name: 'Nová naděje – nadační fond' }))).toBe(
      '/images/logo-on-dark.svg',
    );
    expect(await violations(page)).toEqual([]);
  });

  test('when Přispět draws the payment QR code, then the code keeps dark modules on a light ground, so a bank app can still scan it', async ({
    page,
  }) => {
    await page.goto('/prispet');
    const qrCode = page.getByRole('img', { name: QR_NAME });
    await expect(qrCode).toBeVisible();

    expect(await luminanceOf(qrCode.locator('.qr-ground'), 'fill')).toBeGreaterThan(
      LIGHT_LUMINANCE,
    );
    expect(await luminanceOf(qrCode.locator('.qr-plain, .qr-dot').first(), 'fill')).toBeLessThan(
      DARK_LUMINANCE,
    );
  });

  test('when About, Přispět and the privacy policy open, then nothing on them breaks the rules', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    await expect(page.getByRole('heading', { level: 1, name: 'Vznik a poslání' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.goto('/prispet');
    await expect(page.getByRole('img', { name: QR_NAME })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.goto('/zasady-ochrany-osobnich-udaju');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('when Přispět opens on a phone and the QR code for another device unfolds, then nothing breaks the rules', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/prispet');
    await expect(page.getByRole('button', { name: 'Otevřít v aplikaci banky' })).toBeEnabled();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: /Platíte z jiného zařízení\?/ }).click();
    await expect(page.locator('#prispet .qr-code svg')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('when the news and the projects are listed and opened, then nothing on them breaks the rules', async ({
    page,
  }) => {
    await mockPublicContent(page);

    for (const path of [
      '/aktuality',
      '/projekty',
      `/aktuality/${article.slug}`,
      `/projekty/${project.slug}`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    }
  });

  test('when a signed-in donor opens the overview, then nothing on it breaks the rules', async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.locator('.send-gift app-qr-code')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });
});
