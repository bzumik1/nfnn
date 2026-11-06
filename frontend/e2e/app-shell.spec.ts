import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, openAccountItem, signIn } from './donor-session';

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

  test('when they press Zpět with the keyboard on an article opened from the list, then the list returns and its heading takes the focus', async ({
    page,
  }) => {
    await openArticleFromList(page);

    await back(page).focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeFocused();
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
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/o-nas');
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await tabs(page).getByRole('link', { name: 'O nás' }).click();
    await expect(page).toHaveURL('/o-nas');
  });

  test('when they go back with the browser, then the page the sheet was opened on returns', async ({
    page,
  }) => {
    await openAccountItem(page, 'Moje dary');
    await expect(page).toHaveURL('/darce/dary');

    await page.goBack();

    await expect(page).toHaveURL('/o-nas');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('when they press Zpět, then the page the sheet was opened on returns', async ({ page }) => {
    await openAccountItem(page, 'Moje dary');
    await expect(page).toHaveURL('/darce/dary');

    await back(page).click();

    await expect(page).toHaveURL('/o-nas');
  });

  test('when they choose the section already open, then the sheet closes and one Back leaves it', async ({
    page,
  }) => {
    await openAccountItem(page, 'Moje dary');
    await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('link', { name: 'Moje dary' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await sheet.getByRole('link', { name: 'Moje dary' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL('/darce/dary');
    await page.goBack();

    await expect(page).toHaveURL('/o-nas');
  });

  test('when they press the account button, then the sheet holds the focus itself and its close button shows no focus ring', async ({
    page,
  }) => {
    await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
    const sheet = page.getByRole('dialog');

    await expect(sheet).toBeFocused();
    await expect(sheet.getByRole('button', { name: 'Zavřít' })).not.toBeFocused();
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

  test('when the sheet has opened, then its close button is as large as Zpět and on one row with the name', async ({
    page,
  }) => {
    await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
    const sheet = page.getByRole('dialog');
    await settledPanel(page);

    const close = await sheet.getByRole('button', { name: 'Zavřít' }).boundingBox();
    const name = await sheet.getByRole('heading', { level: 2 }).boundingBox();

    expect(close?.width).toBe(44);
    expect(close?.height).toBe(44);
    expect(close && name && close.y < name.y + name.height && name.y < close.y + close.height).toBe(
      true,
    );
  });
});

test.describe('Given an address of a section of the old one-page home', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  for (const [old, now, heading] of [
    ['/#prispet', '/prispet', 'Přispějte na pomůcky pro děti'],
    ['/#o-nas', '/o-nas', null],
    ['/#projekty', '/projekty', 'Pomáháme'],
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
