import AxeBuilder from '@axe-core/playwright';
import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { article, mockPublicContent, project } from './baseline/screen-mocks';
import { mockDonorApi, openSignInDialog, signIn } from './donor-session';
import { fakeCameraShowing, pngDataUrl, qrCodePng } from './receipt-code-files';
import {
  serveReceiptKeys,
  serveReceiptStatus,
  SINGLE_RECEIPT,
  verdictHeading,
} from './receipt-verification';

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

  test('when the receipt verification opens, then it stands on the light grouped ground of the app screens with dark text', async ({
    page,
  }) => {
    await page.goto('/overit');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ověření potvrzení o daru');

    expect(await luminanceOf(page.locator('body'), 'background-color')).toBeGreaterThan(
      LIGHT_LUMINANCE,
    );
    expect(
      await luminanceOf(page.locator('app-verification-page'), 'background-color'),
    ).toBeGreaterThan(LIGHT_LUMINANCE);
    expect(await luminanceOf(page.getByRole('heading', { level: 1 }), 'color')).toBeLessThan(
      DARK_LUMINANCE,
    );
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

    await page.getByRole('button', { name: /Platíte z\sjiného zařízení\?/ }).click();
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

  test('when a visitor scans another code with the camera and then pastes the link of a signed receipt, then neither the preview nor the verdict breaks the rules', async ({
    page,
  }) => {
    await page.addInitScript(
      fakeCameraShowing,
      pngDataUrl(qrCodePng('https://example.org/jiny-kod')),
    );
    await serveReceiptKeys(page);
    await serveReceiptStatus(page, 'active');
    await page.goto('/overit');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ověření potvrzení o daru');

    await page.getByRole('button', { name: 'Naskenovat QR kód' }).click();
    await expect(page.locator('video')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Zastavit skenování' }).click();
    await page
      .getByLabel('Odkaz z QR kódu')
      .fill(`https://nfnn.cz/overit#${SINGLE_RECEIPT.fragment}`);
    await page.getByRole('button', { name: 'Ověřit odkaz' }).click();

    await expect(verdictHeading(page)).toHaveText('Podepsáno fondem Nová naděje');
    expect(await violations(page)).toEqual([]);
  });
});

async function chooseAppearance(page: Page, choice: 'Automaticky' | 'Světlý' | 'Tmavý') {
  const sheet = page.getByRole('dialog');
  if (!(await sheet.isVisible())) {
    await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
  }
  const control = sheet.getByRole('button', { name: /^Vzhled: / });
  const order = ['Automaticky', 'Světlý', 'Tmavý'];
  const shown = ((await control.getAttribute('aria-label')) ?? '').replace('Vzhled: ', '');
  const presses = (order.indexOf(choice) - order.indexOf(shown) + order.length) % order.length;
  for (let pressed = 1; pressed <= presses; pressed++) {
    await control.click();
    await expect(control).toHaveAccessibleName(
      `Vzhled: ${order[(order.indexOf(shown) + pressed) % order.length]}`,
    );
  }
  await expect(control).toHaveAccessibleName(`Vzhled: ${choice}`);
}

const SETTLED_AFTER_SWITCH_MS = 1000;
const COLOURS_OF_THE_SWITCH: readonly (readonly [string, string])[] = [
  ['header .account-button', 'color'],
  ['header .account-button', 'background-color'],
  ['app-donor-overview .ui-card', 'background-color'],
  ['app-donor-overview .ui-card', 'color'],
  ['html', 'background-color'],
  ['body', 'background-color'],
];

interface DrawnFrame {
  at: number;
  dark: boolean;
  colours: string[];
  icons: number[];
}

interface IconFade {
  icon: number;
  seconds: number;
  endedAtOpacity: number;
}

interface FrameRecorder {
  drawnFrames: DrawnFrame[];
  iconFades: IconFade[];
}

const APPEARANCE_ICONS = '.account-appearance .appearance-icon';
const QUIET_FRAMES_BEFORE_SWITCH = 2;
const SHORTEST_VISIBLE_FADE_SECONDS = 0.1;

async function framesAroundSwitch(page: Page, press: () => Promise<void>): Promise<DrawnFrame[]> {
  for (const selector of new Set(COLOURS_OF_THE_SWITCH.map(([measured]) => measured))) {
    await expect(page.locator(selector).first()).toBeVisible();
  }
  await page.evaluate(
    async ([icons, quietFramesNeeded]) => {
      const recorder = window as unknown as FrameRecorder;
      recorder.iconFades = [];
      document.addEventListener('transitionend', (event) => {
        const icon = event.target as Element;
        if (event.propertyName !== 'opacity' || !icon.matches(icons)) {
          return;
        }
        recorder.iconFades.push({
          icon: Array.from(document.querySelectorAll(icons)).indexOf(icon),
          seconds: event.elapsedTime,
          endedAtOpacity: Number(getComputedStyle(icon).opacity),
        });
      });
      const iconsStill = (): boolean =>
        Array.from(document.querySelectorAll(icons)).every(
          (icon) => icon.getAnimations().length === 0,
        );
      await new Promise<void>((settled) => {
        let quietFrames = 0;
        const check = (): void => {
          quietFrames = iconsStill() ? quietFrames + 1 : 0;
          if (quietFrames >= quietFramesNeeded) {
            settled();
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      });
      recorder.iconFades = [];
    },
    [APPEARANCE_ICONS, QUIET_FRAMES_BEFORE_SWITCH] as const,
  );
  await page.evaluate(
    ([targets, icons]) => {
      const recorder = window as unknown as FrameRecorder;
      recorder.drawnFrames = [];
      const draw = (at: number): void => {
        recorder.drawnFrames.push({
          at,
          dark: document.documentElement.getAttribute('data-appearance') === 'dark',
          colours: targets.map(([selector, property]) => {
            const element = document.querySelector(selector);
            return element ? getComputedStyle(element).getPropertyValue(property) : 'missing';
          }),
          icons: Array.from(document.querySelectorAll(icons)).map((icon) =>
            Number(getComputedStyle(icon).opacity),
          ),
        });
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    },
    [COLOURS_OF_THE_SWITCH, APPEARANCE_ICONS] as const,
  );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as FrameRecorder).drawnFrames.length))
    .toBeGreaterThan(1);
  await press();
  await page.waitForFunction((settle) => {
    const frames = (window as unknown as FrameRecorder).drawnFrames;
    const switched = frames.find((frame) => frame.dark);
    return switched !== undefined && frames[frames.length - 1].at - switched.at >= settle;
  }, SETTLED_AFTER_SWITCH_MS);
  return page.evaluate(() => (window as unknown as FrameRecorder).drawnFrames);
}

function framesBetween(frames: DrawnFrame[]): string[][] {
  const before = frames[0].colours.join('|');
  const after = frames[frames.length - 1].colours.join('|');
  return frames
    .map((frame) => frame.colours)
    .filter((colours) => ![before, after].includes(colours.join('|')));
}

function fadingIcons(frames: DrawnFrame[]): number[] {
  return frames.flatMap((frame) => frame.icons).filter((opacity) => opacity > 0 && opacity < 1);
}

async function iconsThatFaded(page: Page): Promise<Omit<IconFade, 'seconds'>[]> {
  const fades = await page.evaluate(() => (window as unknown as FrameRecorder).iconFades);
  return fades
    .filter((fade) => fade.seconds >= SHORTEST_VISIBLE_FADE_SECONDS)
    .map(({ icon, endedAtOpacity }) => ({ icon, endedAtOpacity }))
    .sort((first, second) => first.icon - second.icon);
}

async function closeAccountSheet(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('Given a signed-in donor whose device shows the light appearance', () => {
  test.use({ colorScheme: 'light' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await signIn(page);
  });

  test('when the donor chooses Tmavý in the account sheet, then the site turns dark at once, stays dark after a reload and nothing breaks the rules', async ({
    page,
  }) => {
    await chooseAppearance(page, 'Tmavý');

    expect(await violations(page)).toEqual([]);
    await closeAccountSheet(page);
    await page.goto('/o-nas');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    expect(await luminanceOf(page.locator('body'), 'background-color')).toBeLessThan(
      DARK_LUMINANCE,
    );
    expect(await luminanceOf(heading, 'color')).toBeGreaterThan(LIGHT_LUMINANCE);
    expect(await shownSource(headerLogo(page))).toBe('/images/logo-on-dark.svg');
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
    expect(await violations(page)).toEqual([]);

    await page.reload();
    await expect(heading).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    expect(await luminanceOf(page.locator('body'), 'background-color')).toBeLessThan(
      DARK_LUMINANCE,
    );
  });

  test('when the donor switches from Světlý to Tmavý, then the header, a card and the page take their dark colours in the same frame, never some light and some dark, while the icon of the button cross-fades', async ({
    page,
  }) => {
    await chooseAppearance(page, 'Světlý');
    const control = page.getByRole('dialog').getByRole('button', { name: 'Vzhled: Světlý' });

    const frames = await framesAroundSwitch(page, () => control.click());

    expect(frames[0].dark).toBe(false);
    expect(frames[0].colours).not.toContain('missing');
    expect(frames[frames.length - 1].colours).not.toEqual(frames[0].colours);
    expect(framesBetween(frames)).toEqual([]);
    expect(frames[0].icons).toHaveLength(3);
    await expect
      .poll(() => iconsThatFaded(page))
      .toEqual([
        { icon: 1, endedAtOpacity: 0 },
        { icon: 2, endedAtOpacity: 1 },
      ]);
  });

  test('when the donor chooses Tmavý and then signs out, then the site follows the light device again for whoever comes next', async ({
    page,
  }) => {
    await chooseAppearance(page, 'Tmavý');
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');

    await page.getByRole('dialog').getByRole('button', { name: 'Odhlásit se' }).click();

    await expect(page.locator('html')).not.toHaveAttribute('data-appearance', /.*/);
    expect(await page.evaluate(() => localStorage.getItem('nfnn.appearance'))).toBeNull();
    await page.goto('/o-nas');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await luminanceOf(page.locator('body'), 'background-color')).toBe(1);
  });

  test('when the donor chooses Tmavý, then another open tab of the site turns dark too without a reload', async ({
    page,
    context,
  }) => {
    const other = await context.newPage();
    await mockDonorApi(other);
    await other.goto('/o-nas');
    await expect(other.getByRole('heading', { level: 1 })).toBeVisible();

    await chooseAppearance(page, 'Tmavý');

    await expect(other.locator('html')).toHaveAttribute('data-appearance', 'dark');
    await expect
      .poll(() => luminanceOf(other.locator('body'), 'background-color'))
      .toBeLessThan(DARK_LUMINANCE);
    await other.close();
  });
});

test.describe('Given a signed-in donor on a light device who asked the system for less motion', () => {
  test.use({ colorScheme: 'light', reducedMotion: 'reduce' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await signIn(page);
  });

  test('when the donor switches from Světlý to Tmavý, then the colours change together in one frame and the icon of the button changes at once, without a fade', async ({
    page,
  }) => {
    await chooseAppearance(page, 'Světlý');
    const control = page.getByRole('dialog').getByRole('button', { name: 'Vzhled: Světlý' });

    const frames = await framesAroundSwitch(page, () => control.click());

    expect(framesBetween(frames)).toEqual([]);
    expect(frames[0].icons).toHaveLength(3);
    expect(fadingIcons(frames)).toEqual([]);
    expect(await iconsThatFaded(page)).toEqual([]);
  });
});

test.describe('Given a signed-in donor whose device shows the dark appearance', () => {
  test.use({ colorScheme: 'dark' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await signIn(page);
  });

  test('when the donor chooses Světlý, then the site stays light on the dark device, also after a reload, and nothing breaks the rules', async ({
    page,
  }) => {
    await chooseAppearance(page, 'Světlý');

    expect(await violations(page)).toEqual([]);
    await closeAccountSheet(page);
    await page.goto('/o-nas');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    expect(await luminanceOf(page.locator('body'), 'background-color')).toBe(1);
    expect(await luminanceOf(heading, 'color')).toBeLessThan(DARK_LUMINANCE);
    expect(await shownSource(headerLogo(page))).toBe('/images/logo.svg');
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
      .toBe('light');
    expect(await violations(page)).toEqual([]);

    await page.reload();
    await expect(heading).toBeVisible();
    expect(await luminanceOf(page.locator('body'), 'background-color')).toBe(1);
  });

  test('when the donor goes back to Automaticky, then the site follows the dark device again', async ({
    page,
  }) => {
    await chooseAppearance(page, 'Světlý');
    await chooseAppearance(page, 'Automaticky');
    await closeAccountSheet(page);

    await page.goto('/o-nas');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-appearance', /.*/);
    expect(await luminanceOf(page.locator('body'), 'background-color')).toBeLessThan(
      DARK_LUMINANCE,
    );
  });
});

test.describe('Given a visitor who chose the dark appearance on a light device', () => {
  test.use({ colorScheme: 'light' });

  test('when the code of the app is still on its way, then the page and its launch screen are already dark', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('nfnn.appearance', 'dark'));
    await page.route(/\/main-[A-Za-z0-9_-]+\.js$/, () => undefined);

    await page.goto('/o-nas', { waitUntil: 'commit' });
    await expect(page.locator('.launch-screen')).toBeAttached();

    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
    expect(await luminanceOf(page.locator('.launch-screen'), 'background-color')).toBeLessThan(
      DARK_LUMINANCE,
    );
  });
});

test.describe('Given a signed-in donor on a touch phone', () => {
  test.use({ colorScheme: 'light', hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('when the account sheet is open, then the appearance button takes only its own taps, so the card of the donor and Odhlásit se stay theirs', async ({
    page,
  }) => {
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const sheet = page.getByRole('dialog');
    if (!(await sheet.isVisible())) {
      await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
    }
    const back = sheet.getByRole('button', { name: 'Zpět' });
    if (await back.isVisible()) {
      await back.click();
    }
    await expect(sheet.getByRole('button', { name: /^Vzhled: / })).toBeVisible();

    for (const target of [
      sheet.locator('a.account-profile'),
      sheet.getByRole('button', { name: 'Odhlásit se' }),
      sheet.locator('.account-logo'),
    ]) {
      const box = (await target.boundingBox())!;
      const hit = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest('button, a')?.className ?? '',
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
      expect(hit).not.toContain('account-appearance');
    }
  });
});

type Rgb = [number, number, number];

const FINGER_SIZE = 44;
const RIM_CONTRAST = 3;
const APART_FROM_PAGE = 1.3;

async function paintedFrom(page: Page, layers: string[]): Promise<Rgb> {
  return page.evaluate((colours) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    for (const colour of colours) {
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
    }
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  }, layers);
}

async function groundsUnder(target: Locator): Promise<string[]> {
  return target.evaluate((element) => {
    const grounds: string[] = [];
    for (let each = element.parentElement; each; each = each.parentElement) {
      grounds.unshift(getComputedStyle(each).backgroundColor);
    }
    return grounds;
  });
}

async function rimOf(target: Locator): Promise<string | null> {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 1) {
      return style.outlineColor;
    }
    if (style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) >= 1) {
      return style.borderTopColor;
    }
    return null;
  });
}

async function fillOf(target: Locator): Promise<string> {
  return target.evaluate((element) => getComputedStyle(element).backgroundColor);
}

function contrastBetween(first: Rgb, second: Rgb): number {
  const luminance = (colour: Rgb) => {
    const [r, g, b] = colour.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

async function pretendBrowserThatShares(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: () => Promise.resolve(),
      configurable: true,
    });
  });
}

test.describe('Given a visitor whose device shows the dark appearance on Aktuality', () => {
  test.use({ colorScheme: 'dark' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await mockPublicContent(page);
    await pretendBrowserThatShares(page);
  });

  for (const width of [390, 1280]) {
    test(`when the featured news card shows at ${width} px, then Číst celé has a rim of at least 3:1 against the card and Sdílet stands as tall as it, at least 44 px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/aktuality');
      const card = page.locator('.featured');
      const more = card.locator('.featured-more');
      const share = card.getByRole('button', { name: `Sdílet ${article.title}`, exact: true });
      await expect(more).toBeVisible();
      await expect(share).toBeVisible();

      const underCard = [...(await groundsUnder(card)), await fillOf(card)];
      const cardGround = await paintedFrom(page, underCard);
      const rim = await rimOf(more);
      const rimPainted = await paintedFrom(page, [
        ...underCard,
        await fillOf(more),
        ...(rim === null ? [] : [rim]),
      ]);
      expect(contrastBetween(rimPainted, cardGround)).toBeGreaterThanOrEqual(RIM_CONTRAST);

      const moreBox = (await more.boundingBox())!;
      const shareBox = (await share.boundingBox())!;
      expect(moreBox.height).toBeGreaterThanOrEqual(FINGER_SIZE);
      expect(shareBox.height).toBeGreaterThanOrEqual(FINGER_SIZE);
      expect(Math.abs(shareBox.height - moreBox.height)).toBeLessThanOrEqual(1);
    });
  }

  test('when the featured news item has no photo, then its card has a rim or a surface that sets it apart from the page', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) =>
        route.fulfill({
          json: {
            items: [{ ...article, coverImage: null }],
            page: 0,
            size: 10,
            total: 1,
            hasMore: false,
          },
        }),
    );
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/aktuality');
    const card = page.locator('.featured');
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toHaveCount(0);

    const grounds = await groundsUnder(card);
    const pageGround = await paintedFrom(page, grounds);
    const rim = await rimOf(card);
    const edge = await paintedFrom(page, [
      ...grounds,
      await fillOf(card),
      ...(rim === null ? [] : [rim]),
    ]);
    expect(contrastBetween(edge, pageGround)).toBeGreaterThanOrEqual(APART_FROM_PAGE);
  });
});
