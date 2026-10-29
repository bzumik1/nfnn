import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, openSignInDialog, signIn } from './donor-session';
import {
  chunkLoadNotice,
  openHomeThenLoseNewChunks,
  openPolicyFromFooter,
  withoutSessionStorage,
} from './lost-chunks';

const WCAG_TEXT_SPACING =
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';

async function clippedTexts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.body.querySelectorAll<HTMLElement>('*'))
      .filter((element) => {
        const ownText = Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== '',
        );
        if (!ownText || element.closest('svg, .visually-hidden')) {
          return false;
        }
        const style = getComputedStyle(element);
        const hidesX = style.overflowX === 'hidden' || style.textOverflow === 'ellipsis';
        const hidesY = style.overflowY === 'hidden';
        return (
          (hidesX && element.scrollWidth > element.clientWidth + 1) ||
          (hidesY && element.scrollHeight > element.clientHeight + 1)
        );
      })
      .map((element) => element.textContent!.trim().slice(0, 40)),
  );
}

async function widerThanScreen(page: Page): Promise<number> {
  return page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
}

test.describe('Given a visitor who uses only the keyboard or a screen reader', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they follow a menu link to a section, then the section takes the focus and Tab continues inside it', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('.desktop-nav').getByRole('link', { name: 'Kontakt' }).click();

    await expect(page.locator('#kontakt')).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#kontakt'))).toBe(true);
  });

  test('when they open another page from the footer, then its heading takes the focus', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Zásady ochrany osobních údajů' }).last().click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Zásady ochrany osobních údajů' }),
    ).toBeFocused();
  });

  test('when they choose a firm with the arrow keys in the registration, then the firm is chosen and its fields appear', async ({
    page,
  }) => {
    await openSignInDialog(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Registrace' }).click();
    const person = page.getByRole('radio', { name: 'Fyzická osoba' });
    await person.focus();

    await page.keyboard.press('ArrowRight');

    const firm = page.getByRole('radio', { name: 'Firma' });
    await expect(firm).toBeFocused();
    await expect(firm).toHaveAttribute('aria-checked', 'true');
    await expect(person).toHaveAttribute('tabindex', '-1');
    await expect(page.getByLabel('Název firmy')).toBeVisible();
  });

  test('when a signed-in donor reaches the skip link, then it is visible and takes them past the menus to the content', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Moje dary' }).focus();
    const skipLink = page.getByRole('link', { name: 'Přeskočit na obsah' });
    for (
      let step = 0;
      step < 10 && !(await skipLink.evaluate((link) => link === document.activeElement));
      step++
    ) {
      await page.keyboard.press('Shift+Tab');
    }
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport();

    await page.keyboard.press('Enter');

    await expect(page.getByRole('main')).toBeFocused();
    await expect(page.getByRole('main')).toContainText('Můj přehled');
  });

  test('when the browser shows text twice as large, then the text of the page grows with it', async ({
    page,
  }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');
    const text = page.locator('main p').first();
    const normal = await text.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

    await page.addStyleTag({ content: 'html { font-size: 200%; }' });

    const larger = await text.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(larger).toBe(normal * 2);
  });
});

test.describe('Given a visitor in a window too narrow for the header links', () => {
  test.use({ viewport: { width: 800, height: 900 } });

  test('when they open the home page 800 px wide, then the header offers the menu button instead of the links', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Otevřít menu' })).toBeVisible();
    await expect(page.locator('.desktop-nav')).toBeHidden();
  });
});

test.describe('Given a visitor whose browser shows text twice as large on a computer', () => {
  test('when they open the home page, then every header link stays on one line inside the header', async ({
    page,
  }) => {
    await page.goto('/');
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });

    const header = await page.locator('nav.nav').boundingBox();
    const items = await page.locator('.desktop-nav > *').evaluateAll((elements) =>
      elements.map((element) => ({
        text: element.textContent!.trim(),
        ...element.getBoundingClientRect().toJSON(),
      })),
    );
    expect(items.map((item) => item.text)).toEqual([
      'O nás',
      'Projekty',
      'Aktuality',
      'Kontakt',
      'Přispět',
      'Přihlásit se',
    ]);
    for (const item of items) {
      expect(item.top, item.text).toBeGreaterThanOrEqual(header!.y);
      expect(item.bottom, item.text).toBeLessThanOrEqual(header!.y + header!.height);
      expect(item.right, item.text).toBeLessThanOrEqual(1280);
    }
    expect(await widerThanScreen(page)).toBe(0);
  });
});

test.describe('Given a visitor on a phone who uses only the keyboard', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they Tab past the last item of the open menu, then the menu closes and nothing hides the focused control', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Otevřít menu' }).click();
    await page.locator('#mobile-menu .mobile-login').focus();

    await page.keyboard.press('Tab');

    await expect(page.locator('#mobile-menu')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Otevřít menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

for (const width of [320, 390, 1280]) {
  test.describe(`Given a visitor ${width} px wide whose next page could not be loaded`, () => {
    test.use({ viewport: { width, height: 800 } });

    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page);
      await withoutSessionStorage(page);
      await openHomeThenLoseNewChunks(page);
      await openPolicyFromFooter(page);
      await expect(chunkLoadNotice(page)).toBeVisible();
    });

    test('when they Tab back from the reload bar, then the bar hides neither the focused control nor the end of the page', async ({
      page,
    }) => {
      await page.keyboard.press('Shift+Tab');

      const covered = await page.evaluate(() => {
        const bar = document.querySelector('app-chunk-load-notice [role="alert"]')!;
        const barTop = bar.getBoundingClientRect().top;
        const focused = document.activeElement!.getBoundingClientRect();
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        const footer = document.querySelector('footer')!.getBoundingClientRect();
        return { focused: focused.bottom > barTop, pageEnd: footer.bottom > barTop };
      });

      expect(covered).toEqual({ focused: false, pageEnd: false });
    });
  });
}

test.describe('Given a visitor who zooms to 400 % or sets wider text spacing', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  for (const path of ['/', '/zasady-ochrany-osobnich-udaju', '/neexistuje']) {
    test(`when they open ${path} 320 px wide, then nothing runs off the screen and no text is cut off with wider spacing`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      expect(await widerThanScreen(page)).toBeLessThanOrEqual(0);
      await page.addStyleTag({ content: WCAG_TEXT_SPACING });
      expect(await clippedTexts(page)).toEqual([]);
      expect(await widerThanScreen(page)).toBeLessThanOrEqual(0);
    });
  }

  test('when a signed-in donor opens each section 320 px wide, then nothing runs off the screen and no text is cut off with wider spacing', async ({
    page,
  }) => {
    await signIn(page);
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of [
      '/darce/prehled',
      '/darce/dary',
      '/darce/potvrzeni',
      '/darce/ucty',
      '/darce/udaje',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      expect(await widerThanScreen(page), path).toBeLessThanOrEqual(0);
      await page.addStyleTag({ content: WCAG_TEXT_SPACING });
      expect(await clippedTexts(page), path).toEqual([]);
      expect(await widerThanScreen(page), path).toBeLessThanOrEqual(0);
    }
  });
});
