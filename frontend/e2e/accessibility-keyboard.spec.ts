import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, openDonorSection, openSignInDialog, signIn } from './donor-session';
import {
  chunkLoadNotice,
  openAboutThenLoseNewChunks,
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

async function settledOverlapWithBar(page: Page): Promise<number> {
  const overlap = () =>
    page.evaluate(() => {
      const bar = document
        .querySelector('app-chunk-load-notice .chunk-load-bar')!
        .getBoundingClientRect();
      const focused = document.activeElement!.getBoundingClientRect();
      return Math.round(Math.min(focused.bottom, bar.bottom) - Math.max(focused.top, bar.top));
    });
  let previous = await overlap();
  for (let check = 0; check < 30; check += 1) {
    await page.waitForTimeout(100);
    const current = await overlap();
    if (current === previous) {
      return current;
    }
    previous = current;
  }
  return previous;
}

async function widerThanScreen(page: Page): Promise<number> {
  return page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
}

test.describe('Given a visitor who uses only the keyboard or a screen reader', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they follow the footer link to the contact section, then the section takes the focus and Tab continues inside it', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Kontakt' }).click();

    await expect(page.locator('#kontakt')).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#kontakt'))).toBe(true);
  });

  test('when they open another page from the footer, then its heading takes the focus', async ({
    page,
  }) => {
    await page.goto('/o-nas');
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

  test('when a signed-in donor chooses an amount in Poslat dar with the keyboard, then it is pressed, the bank details follow it and Tab reaches the copy buttons before the QR', async ({
    page,
  }) => {
    await signIn(page);
    const card = page.getByRole('region', { name: 'Poslat dar' });
    const thousand = card.getByRole('button', { name: '1 000 Kč' });
    await thousand.focus();
    await page.keyboard.press('Enter');

    await expect(thousand).toHaveAttribute('aria-pressed', 'true');
    await expect(card.locator('.bank-value').nth(1)).toHaveText('1 000 Kč');
    await expect(card.getByRole('status').filter({ hasText: 'QR platba na 1 000 Kč' })).toHaveCount(
      1,
    );

    await card.getByRole('button', { name: 'Jiná částka' }).focus();
    const order: string[] = [];
    for (let step = 0; step < 7; step++) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => {
          const focused = document.activeElement as HTMLElement;
          return (
            focused.textContent!.replace(/\s+/g, ' ').trim() || focused.getAttribute('aria-label')!
          );
        }),
      );
    }
    expect(order).toEqual([
      'Kopírovat číslo účtu',
      'Kopírovat částku',
      'Kopírovat variabilní symbol',
      'Kopírovat IBAN',
      'Jak nastavit trvalý příkaz',
      'Zvětšit: QR platba na účet Nadačního fondu Nová naděje',
      'Uložit QR kód',
    ]);
  });

  test('when a signed-in donor opens a row of the security card with Enter, then its form takes the focus and Zrušit returns it to the row', async ({
    page,
  }) => {
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    const changeEmail = page.getByRole('button', { name: 'Změnit e-mail' });
    await expect(changeEmail).toHaveAttribute('aria-expanded', 'false');

    await changeEmail.focus();
    await page.keyboard.press('Enter');

    await expect(changeEmail).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('Nový e-mail')).toBeFocused();

    await page.getByRole('button', { name: 'Zrušit', exact: true }).focus();
    await page.keyboard.press('Enter');

    await expect(changeEmail).toHaveAttribute('aria-expanded', 'false');
    await expect(changeEmail).toBeFocused();
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

test.describe('Given a visitor whose browser shows text twice as large on a computer', () => {
  test('when they open the About page, then the header and the four tabs stay on screen', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.goto('/o-nas');
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });

    const tabs = page.getByRole('navigation', { name: 'Hlavní sekce' }).getByRole('link');
    await expect(tabs).toHaveText(['O nás', 'Aktuality', 'Pomáháme', 'Přispět']);
    const boxes = await tabs.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().toJSON()),
    );
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(1280);
      expect(box.bottom).toBeLessThanOrEqual(800);
    }
    const signIn = await page
      .getByRole('banner')
      .getByRole('button', { name: 'Přihlásit se' })
      .boundingBox();
    expect(signIn!.x + signIn!.width).toBeLessThanOrEqual(1280);
    expect(await widerThanScreen(page)).toBe(0);
  });
});

async function splitWords(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const text = element.firstChild;
      if (text === null || text.nodeType !== Node.TEXT_NODE) {
        return [];
      }
      const content = text.textContent ?? '';
      const split: string[] = [];
      for (const match of content.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(text, match.index);
        range.setEnd(text, match.index + match[0].length);
        const lines = new Set(
          Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)),
        );
        if (lines.size > 1) {
          split.push(match[0]);
        }
      }
      return split;
    }),
  );
}

for (const width of [320, 390]) {
  test.describe(`Given a visitor on a phone ${width} px wide whose browser shows text twice as large`, () => {
    test.use({ viewport: { width, height: 844 } });

    test.beforeEach(async ({ page }) => {
      await page.route(
        (url) => url.pathname === '/api/content/news/zahrada-pro-deti',
        (route) =>
          route.fulfill({
            json: {
              id: '0199f3e0-0000-7000-8000-00000000c001',
              slug: 'zahrada-pro-deti',
              title: 'Zahrada pro děti',
              tag: 'Projekt',
              perex: 'Stavíme zahradu, kde si děti budou hrát.',
              body: 'První odstavec.',
              coverImage: null,
              publishedOn: '2026-10-20',
              createdAt: '2026-10-19T09:00:00Z',
              updatedAt: '2026-10-20T07:30:00Z',
            },
          }),
      );
    });

    test('when they open an article signed out, then the back button, the logo and Přihlásit se stay on screen side by side', async ({
      page,
    }) => {
      await page.goto('/aktuality/zahrada-pro-deti');
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      const banner = page.getByRole('banner');
      const boxes = await Promise.all(
        [
          banner.getByRole('button', { name: 'Zpět' }),
          banner.getByRole('link').first(),
          banner.getByRole('button', { name: 'Přihlásit se' }),
        ].map(async (control) => (await control.boundingBox())!),
      );

      for (const box of boxes) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(boxes[1].x);
      expect(boxes[1].x + boxes[1].width).toBeLessThanOrEqual(boxes[2].x);
      expect(await widerThanScreen(page)).toBe(0);
    });

    test('when they open Aktuality, then the leading article keeps its signer, Sdílet and Číst celé inside its card', async ({
      page,
    }) => {
      await page.route(
        (url) => url.pathname === '/api/content/news',
        (route) =>
          route.fulfill({
            json: {
              items: [
                {
                  id: '0199f3e0-0000-7000-8000-00000000c002',
                  slug: 'ohlednuti-za-rokem-2025',
                  title: 'Ohlédnutí za rokem 2025',
                  tag: 'Výroční ohlédnutí',
                  perex: 'I v roce 2025 jsme díky vám mohli přinášet naději.',
                  body: 'První odstavec.',
                  coverImage: null,
                  signer: {
                    id: 'signer',
                    name: 'Petr Vzorový',
                    role: 'Předseda správní rady',
                    portrait: null,
                  },
                  publishedOn: '2026-02-15',
                  createdAt: '2026-02-14T09:00:00Z',
                  updatedAt: '2026-02-15T07:30:00Z',
                },
              ],
              page: 0,
              size: 10,
              total: 1,
              hasMore: false,
            },
          }),
      );
      await page.goto('/aktuality');
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      const card = page.locator('app-featured-news article');
      const more = card.getByRole('link', { name: 'Číst celé Ohlédnutí za rokem 2025' });
      await expect(more).toBeVisible();

      const cardBox = (await card.boundingBox())!;
      for (const part of [card.getByText('Petr Vzorový'), card.getByRole('button'), more]) {
        const box = (await part.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(cardBox.x);
        expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
      }
      expect(await widerThanScreen(page)).toBe(0);
    });

    test('when they look at the tabs, then the four stand in one row, no label breaks inside a word and the end of the page stays above the bar', async ({
      page,
    }) => {
      await page.goto('/aktuality/zahrada-pro-deti');
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      await expect(page.getByRole('heading', { level: 1, name: 'Zahrada pro děti' })).toBeVisible();

      expect(await splitWords(page, 'app-tab-bar .tab-label')).toEqual([]);
      const tabs = page.getByRole('navigation', { name: 'Hlavní sekce' }).getByRole('link');
      const rows = await tabs.evaluateAll((elements) =>
        elements.map((element) => Math.round(element.getBoundingClientRect().top)),
      );
      expect(new Set(rows).size).toBe(1);
      await expect
        .poll(() =>
          page.evaluate(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            const bar = document.querySelector('app-tab-bar nav')!.getBoundingClientRect();
            const last = Array.from(
              document.querySelectorAll('main a, main button, main p, main h2'),
            )
              .map((element) => element.getBoundingClientRect())
              .filter((box) => box.height > 0)
              .reduce((lowest, box) => Math.max(lowest, box.bottom), 0);
            return Math.round(last - bar.top);
          }),
        )
        .toBeLessThanOrEqual(0);
    });
  });
}

test.describe('Given a visitor on a phone who uses only the keyboard', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they reach the tabs at the bottom and open Aktuality with Enter, then the tab is marked as the current one and the heading of its page takes the focus', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    const tabs = page.getByRole('navigation', { name: 'Hlavní sekce' });
    await expect(tabs.getByRole('link', { name: 'O nás' })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('link', { name: 'Aktuality' }).focus();

    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/aktuality$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeFocused();
    await expect(tabs.getByRole('link', { name: 'Aktuality' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('when they Tab to the end of the About page, then the tab bar hides no focused control', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    const footerLinks = page.getByRole('contentinfo').getByRole('link');
    await footerLinks.last().focus();

    const covered = await page.evaluate(() => {
      const focused = document.activeElement!.getBoundingClientRect();
      const bar = document.querySelector('app-tab-bar nav')!.getBoundingClientRect();
      return focused.bottom > bar.top && focused.top < bar.bottom;
    });
    expect(covered).toBe(false);
  });
});

for (const width of [320, 390, 1280]) {
  test.describe(`Given a visitor ${width} px wide whose next page could not be loaded`, () => {
    test.use({ viewport: { width, height: 800 } });

    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page);
      await withoutSessionStorage(page);
      await openAboutThenLoseNewChunks(page);
      await openPolicyFromFooter(page);
      await expect(chunkLoadNotice(page)).toBeVisible();
    });

    test('when they Tab back from the reload bar, then the bar hides neither the focused control nor the end of the page', async ({
      page,
    }) => {
      await page.keyboard.press('Shift+Tab');

      expect(await settledOverlapWithBar(page)).toBeLessThanOrEqual(0);
      const pageEndCovered = await page.evaluate(() => {
        const bar = document.querySelector('app-chunk-load-notice .chunk-load-bar')!;
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        const lastText = document.querySelector('footer .ui-container')!.getBoundingClientRect();
        return lastText.bottom > bar.getBoundingClientRect().top;
      });
      expect(pageEndCovered).toBe(false);
    });

    test('when they scroll to the end of the page, then the footer reaches down to the bar with its own colour', async ({
      page,
    }) => {
      const gapUnderFooter = await page.evaluate(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        const footer = document.querySelector('footer')!.getBoundingClientRect();
        return Math.round(document.documentElement.clientHeight - footer.bottom);
      });

      expect(gapUnderFooter).toBeLessThanOrEqual(0);
    });

    test('when they Tab through the contact form and leave its fields empty, then the bar never hides the focused control', async ({
      page,
    }) => {
      await page.locator('#contact-name').focus();
      for (const control of ['#contact-email', '#contact-message', 'button[type="submit"]']) {
        await page.keyboard.press('Tab');
        await expect(page.locator(`#kontakt ${control}`)).toBeFocused();

        expect(await settledOverlapWithBar(page), control).toBeLessThanOrEqual(0);
      }
    });

    test('when they open the sign-in dialog, then the page behind it does not move', async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 560 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const before = await page.evaluate(() => window.scrollY);

      await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      expect(await page.evaluate(() => window.scrollY)).toBe(before);
    });
  });
}

test.describe('Given a visitor who zooms to 400 % or sets wider text spacing', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  for (const path of ['/', '/o-nas', '/prispet', '/zasady-ochrany-osobnich-udaju', '/neexistuje']) {
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
