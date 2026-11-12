import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { browserEntries, stepBack } from './app-history';
import { mockDonorApi, rememberedDonorSession } from './donor-session';

const article = {
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
};

async function publishedArticle(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({ json: { items: [article], page: 0, size: 10, total: 1, hasMore: false } }),
  );
}

async function settledPanel(page: Page) {
  const panel = page.getByRole('dialog').locator('.dialog-panel');
  await expect(panel).toBeVisible();
  await panel.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  return panel;
}

function tabs(page: Page) {
  return page.getByRole('navigation', { name: 'Hlavní sekce' });
}

const SECTIONS = [
  'Můj přehled',
  'Moje dary',
  'Potvrzení o daru',
  'Bankovní účty',
  'Údaje a zabezpečení',
];

async function openSheetSection(page: Page, name: string) {
  await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('link', { name }).click();
  await expect(sheet.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
  return sheet;
}

async function swipeFromLeftEdge(target: Locator): Promise<void> {
  const box = await target.boundingBox();
  const y = (box?.y ?? 0) + 40;
  for (const [type, x] of [
    ['touchstart', 4],
    ['touchmove', 60],
    ['touchmove', 160],
    ['touchmove', 260],
    ['touchend', 260],
  ] as const) {
    const finger = { identifier: 1, clientX: x, clientY: y };
    await target.dispatchEvent(type, {
      touches: type === 'touchend' ? [] : [finger],
      changedTouches: [finger],
      bubbles: true,
      cancelable: true,
    });
  }
}

function back(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: 'Zpět' });
}

async function openArticleFromList(page: Page): Promise<void> {
  await page.goto('/aktuality');
  await page.getByRole('link', { name: article.title }).click();
  await expect(page).toHaveURL(`/aktuality/${article.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeFocused();
}

test.describe('Given a visitor who moves through the tabs and back', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedArticle(page);
  });

  test('when they press Zpět with the keyboard on an article opened from the list, then the list returns and the link to that article takes the focus', async ({
    page,
  }) => {
    await openArticleFromList(page);

    await back(page).focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL('/aktuality');
    await expect(
      page.getByRole('main').locator(`a[href="/aktuality/${article.slug}"]`).first(),
    ).toBeFocused();
  });

  test('when they reload the article and press Zpět, then the list returns without leaving the site', async ({
    page,
  }) => {
    await openArticleFromList(page);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });

  test('when they leave the article for another tab and come back, then the tab opens the article again and Zpět stays in the tab', async ({
    page,
  }) => {
    await openArticleFromList(page);

    await tabs(page).getByRole('link', { name: 'Pomáháme' }).click();
    await expect(page).toHaveURL('/projekty');
    await tabs(page).getByRole('link', { name: 'Aktuality' }).click();
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeFocused();
  });

  test('when they open an article from outside the site and press Zpět, then its list opens in place of it', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${article.slug}`);

    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });
});

test.describe('Given a signed-in donor on a phone who opens a section from the account sheet', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedDonorSession(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/o-nas');
    await expect(page.getByRole('banner').getByRole('button', { name: 'Účet' })).toBeVisible();
  });

  for (const section of SECTIONS) {
    test(`when they choose ${section}, then it opens inside the sheet under a Zpět button, without a close button, and the page under it stays`, async ({
      page,
    }) => {
      const sheet = await openSheetSection(page, section);

      await expect(sheet.getByRole('button', { name: 'Zpět' })).toBeVisible();
      await expect(sheet.getByRole('button', { name: 'Zavřít' })).toHaveCount(0);
      await expect(sheet.locator('app-account-section > *')).not.toHaveCount(0);
      await expect(page).toHaveURL('/o-nas');
    });

    test(`when the app steps back from ${section}, as its swipe does, then the account list returns in the sheet and the next step closes it`, async ({
      page,
    }) => {
      const sheet = await openSheetSection(page, section);

      await stepBack(page);

      await expect(sheet.getByRole('heading', { level: 2, name: 'Účet' })).toBeVisible();
      await expect(sheet.getByRole('link', { name: section })).toBeFocused();
      await expect(page).toHaveURL('/o-nas');
      await stepBack(page);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL('/o-nas');
    });
  }

  test('when they have written into a form of Údaje a zabezpečení and step back, then a dialog asks first, and only discarding returns the account list', async ({
    page,
  }) => {
    const sheet = await openSheetSection(page, 'Údaje a zabezpečení');
    await sheet.getByRole('button', { name: 'Upravit údaje' }).click();
    await sheet.getByLabel('Jméno a příjmení').fill('Jana Rozepsaná');

    await stepBack(page);

    const ask = page.getByRole('dialog', { name: 'Zahodit rozepsané údaje?' });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Pokračovat v psaní' }).click();
    await expect(ask).toHaveCount(0);
    await expect(sheet.getByLabel('Jméno a příjmení')).toHaveValue('Jana Rozepsaná');

    await stepBack(page);
    await page
      .getByRole('dialog', { name: 'Zahodit rozepsané údaje?' })
      .getByRole('button', { name: 'Zahodit' })
      .click();

    await expect(sheet.getByRole('heading', { level: 2, name: 'Účet' })).toBeVisible();
    await expect(page).toHaveURL('/o-nas');
  });

  test('when they press Zpět in the sheet, then the account list returns with the focus on the section they left', async ({
    page,
  }) => {
    const sheet = await openSheetSection(page, 'Moje dary');

    await sheet.getByRole('button', { name: 'Zpět' }).click();

    await expect(sheet.getByRole('heading', { level: 2, name: 'Účet' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Moje dary' })).toBeFocused();
    await expect(sheet.getByRole('button', { name: 'Zavřít' })).toBeVisible();
  });

  test('when they open a section in the sheet, then the browser gains no entry, so its Back would leave the site', async ({
    page,
  }) => {
    const entries = await browserEntries(page);

    await openSheetSection(page, 'Moje dary');

    expect(await browserEntries(page)).toBe(entries);
  });

  test('when they choose a section from the account list, then its title in the sheet takes the focus', async ({
    page,
  }) => {
    const sheet = await openSheetSection(page, 'Bankovní účty');

    await expect(
      sheet.getByRole('heading', { level: 2, name: 'Bankovní účty', exact: true }),
    ).toBeFocused();
  });

  test('when they press the account button, then the title of the sheet holds the focus and no control shows a focus ring', async ({
    page,
  }) => {
    await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
    const sheet = page.getByRole('dialog');

    await expect(sheet.locator('#account-sheet-title')).toBeFocused();
    await expect(sheet.getByRole('button', { name: 'Zavřít' })).not.toBeFocused();
    expect(
      await page.evaluate(
        () =>
          [...document.querySelectorAll(':focus-visible')].filter(
            (element) => getComputedStyle(element).outlineStyle !== 'none',
          ).length,
      ),
    ).toBe(0);
  });

  test('when they open the sheet with the keyboard, then its close button takes the focus as before', async ({
    page,
  }) => {
    await page.getByRole('banner').getByRole('button', { name: 'Účet' }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog').getByRole('button', { name: 'Zavřít' })).toBeFocused();
  });

  test('when the sheet has opened, then it rises almost to the top of the screen even though its list is short', async ({
    page,
  }) => {
    await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
    const panel = await settledPanel(page);

    const box = await panel.boundingBox();

    expect(box?.y).toBeLessThanOrEqual(16);
    expect(box && Math.round(box.y + box.height)).toBe(page.viewportSize()?.height);
  });

  test('when they drag the tall sheet down by its grabber, then it closes', async ({ page }) => {
    await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
    await settledPanel(page);
    const box = (await page.locator('.dialog-grabber').boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 400, { steps: 20 });
    await page.mouse.up();

    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('when the sheet has opened, then its round close button stands on one row with the logo', async ({
    page,
  }) => {
    await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
    const sheet = page.getByRole('dialog');
    await settledPanel(page);

    const close = await sheet.getByRole('button', { name: 'Zavřít' }).boundingBox();
    const name = await sheet.getByRole('heading', { level: 2 }).boundingBox();

    expect(close?.width).toBe(40);
    expect(close?.height).toBe(40);
    expect(close && name && close.y < name.y + name.height && name.y < close.y + close.height).toBe(
      true,
    );
  });
});

test.describe('Given a donor in the installed app on a phone with a section open in the account sheet', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
    });
    await mockDonorApi(page);
    await rememberedDonorSession(page, { installed: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/o-nas');
    await expect(page.getByRole('banner').getByRole('button', { name: 'Účet' })).toBeVisible();
  });

  test('when they swipe from the left edge, then the account list returns in the sheet', async ({
    page,
  }) => {
    const address = page.url();
    const sheet = await openSheetSection(page, 'Moje dary');

    await swipeFromLeftEdge(sheet.locator('app-account-section'));

    await expect(sheet.getByRole('heading', { level: 2, name: 'Účet' })).toBeVisible();
    await expect(page).toHaveURL(address);
  });
});

test.describe('Given an address of a section of the old one-page home', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  for (const [old, now, heading] of [
    ['/#prispet', '/prispet', 'Přispějte na pomůcky pro děti'],
    ['/#o-nas', '/o-nas', null],
    ['/#projekty', '/projekty', 'Komu jsme pomohli'],
    ['/#aktuality', '/aktuality', 'Co je u nás nového'],
    ['/#uvod', '/', null],
  ] as const) {
    test(`when ${old} is opened, then ${now} shows and Back does not return to the old address`, async ({
      page,
    }) => {
      await page.goto(old);

      await expect(page).toHaveURL(now);
      if (heading !== null) {
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      }
      await page.goBack();
      await expect(page).toHaveURL('about:blank');
    });
  }

  test('when /#kontakt is opened, then the contact section of O nás is on screen', async ({
    page,
  }) => {
    await page.goto('/#kontakt');

    await expect(page).toHaveURL('/o-nas#kontakt');
    await expect(page.locator('#kontakt')).toBeInViewport();
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });
});

test.describe('Given a visitor on a phone with the tab bar at the bottom', () => {
  const nearEdge = 4;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/aktuality');
  });

  test('when they point just inside the top or bottom edge of the bar above any tab, then that tab is under the finger', async ({
    page,
  }) => {
    const bar = await tabs(page).boundingBox();
    expect(bar).not.toBeNull();
    const links = tabs(page).getByRole('link');

    for (const name of ['O nás', 'Aktuality', 'Pomáháme', 'Přispět']) {
      const tab = await links.filter({ hasText: name }).boundingBox();
      expect(tab).not.toBeNull();
      const x = tab!.x + tab!.width / 2;
      for (const y of [bar!.y + nearEdge, bar!.y + bar!.height - nearEdge]) {
        const hit = await page.evaluate(
          ([px, py]) => document.elementFromPoint(px, py)?.closest('a')?.textContent?.trim(),
          [x, y],
        );
        expect(hit, `${name} at ${y - bar!.y} px from the top of the bar`).toBe(name);
      }
    }
  });

  test('when they tap Pomáháme just inside the top edge of the bar, then Pomáháme opens', async ({
    page,
  }) => {
    const bar = await tabs(page).boundingBox();
    const tab = await tabs(page).getByRole('link', { name: 'Pomáháme' }).boundingBox();

    await page.mouse.click(tab!.x + tab!.width / 2, bar!.y + nearEdge);

    await expect(page).toHaveURL('/projekty');
    await expect(tabs(page).getByRole('link', { name: 'Pomáháme' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('Given a visitor on the landing page, which is one full-screen photo', () => {
  const rootOverscroll = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY);

  test('when they pull the page past its top or bottom, then the page does not stretch away from the photo', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();

    expect(await rootOverscroll(page)).toBe('none');
  });

  test('when they move on to another tab, then that page stretches at its ends as before', async ({
    page,
  }) => {
    await page.goto('/');
    await tabs(page).getByRole('link', { name: 'O nás' }).click();
    await expect(page).toHaveURL(/\/o-nas$/);

    expect(await rootOverscroll(page)).toBe('auto');
  });
});
