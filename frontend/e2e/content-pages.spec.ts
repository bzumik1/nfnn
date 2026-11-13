import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, openSection, problem } from './donor-session';

const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a001';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQTX4NRwzEcQBO0hcxU+9NfQAAAABJRU5ErkJggg==',
  'base64',
);

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c001',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec.\n\nDruhý odstavec.',
  coverImage: { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}`, alt: 'Děti sázejí stromek' },
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

const project = {
  id: '0199f3e0-0000-7000-8000-00000000c002',
  slug: 'dominik-7-let',
  title: 'Dominik, 7 let',
  year: 2024,
  tag: 'Kompenzační pomůcky',
  perex: 'Pomohli jsme mu získat speciální kočárek.',
  body: 'Dominik se narodil s dětskou mozkovou obrnou.\n\nDěkujeme všem dárcům.',
  coverImage: null,
  publishedOn: '2026-10-01',
  createdAt: '2026-09-19T09:00:00Z',
  updatedAt: '2026-10-01T07:30:00Z',
};

async function publishedContent(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/home',
    (route) => route.fulfill({ json: { news: [article], projects: [project] } }),
  );
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
  await page.route(
    (url) => url.pathname === `/api/content/projects/${project.slug}`,
    (route) => route.fulfill({ json: project }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({ json: { items: [article], page: 0, size: 10, total: 1, hasMore: false } }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({ json: { items: [project], page: 0, size: 10, total: 1, hasMore: false } }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );
}

test.describe('Given a visitor on the Aktuality and Pomáháme tabs', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when news and projects are published, then the tabs list them and each card leads to its page', async ({
    page,
  }) => {
    await publishedContent(page);

    await page.goto('/aktuality');

    await expect(page).toHaveTitle('Aktuality | Nová naděje – nadační fond');
    const news = page.locator('.featured');
    await expect(news).toHaveCount(1);
    await expect(news.locator('.featured-tag')).toHaveText('Projekt');
    await expect(news.locator('.featured-date')).toHaveText('20. 10. 2026');
    await expect(news.locator('img')).toBeVisible();
    const stories = page.getByRole('region', { name: 'Příběhy z roku 2024' });
    await expect(stories.getByRole('link', { name: 'Dominik, 7 let' })).toHaveAttribute(
      'href',
      '/projekty/dominik-7-let',
    );
    await expect(stories.getByRole('link', { name: 'Zobrazit v Pomáháme' })).toHaveAttribute(
      'href',
      '/projekty?rok=2024',
    );

    await page.getByRole('link', { name: 'Zahrada pro děti' }).click();

    await expect(page).toHaveURL('/aktuality/zahrada-pro-deti');
    await expect(page).toHaveTitle('Zahrada pro děti | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Zahrada pro děti' })).toBeFocused();
    await expect(page.locator('.ui-intro__meta')).toHaveText('Projekt · 20. 10. 2026');
    await expect(page.locator('.prose p')).toHaveText(['První odstavec.', 'Druhý odstavec.']);
    await expect(page.locator('.photo img')).toBeVisible();
    await expect(page.locator('.photo img')).toHaveAttribute('alt', 'Děti sázejí stromek');

    await page.getByRole('link', { name: '← Všechny aktuality' }).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeFocused();
    await openSection(page, 'Pomáháme');

    await expect(page).toHaveURL('/projekty');
    await expect(page).toHaveTitle('Kde pomáháme | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Komu jsme pomohli' })).toBeVisible();
    await expect(page.locator('app-story-tile')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 2, name: /2024/ })).toBeVisible();
    await page.getByRole('link', { name: 'Dominik, 7 let' }).click();

    await expect(page).toHaveURL('/projekty/dominik-7-let');
    await expect(page.getByRole('heading', { level: 1, name: 'Dominik, 7 let' })).toBeFocused();
    await expect(page.locator('.ui-intro__meta')).toHaveText('Kompenzační pomůcky · 2024');
    await expect(page.locator('.photo')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Kde všude pomáháme' })).toHaveAttribute(
      'href',
      '/projekty',
    );
  });

  test('when nothing is published yet, then each tab says so and leads back to the home page', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/content/news' || url.pathname === '/api/content/projects',
      (route) =>
        route.fulfill({ json: { items: [], page: 0, size: 10, total: 0, hasMore: false } }),
    );

    await page.goto('/aktuality');

    await expect(page.getByText('Zatím tu žádná aktualita není.')).toBeVisible();
    await openSection(page, 'Pomáháme');
    await expect(page.getByText('Zatím tu žádný příběh není.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zpět na úvodní stránku' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  test('when the address is one the article had before, then the article shows under its current address', async ({
    page,
  }) => {
    await publishedContent(page);
    await page.route(
      (url) => url.pathname === '/api/content/news/stara-zahrada',
      (route) => route.fulfill({ json: article }),
    );

    await page.goto('/aktuality/stara-zahrada');

    await expect(page.getByRole('heading', { level: 1, name: 'Zahrada pro děti' })).toBeVisible();
    await expect(page).toHaveURL('/aktuality/zahrada-pro-deti');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://nfnn.cz/aktuality/zahrada-pro-deti',
    );
  });

  test('when the address names an article that is not published, then the page says it was not found and keeps the address', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/content/news/neznama',
      (route) => route.fulfill(problem(404, 'content/news-not-found', 'Nenalezeno', '')),
    );

    await page.goto('/aktuality/neznama');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Tuhle stránku jsme nenašli' }),
    ).toBeVisible();
    await expect(page).toHaveURL('/aktuality/neznama');
  });
});

test.describe('Given a visitor reading a news article', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedContent(page);
  });

  test('when they look at the tabs, then Aktuality is marked as the current place and leads to the list', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${article.slug}`);
    const tabs = page.getByRole('navigation', { name: 'Hlavní sekce' });
    const news = tabs.getByRole('link', { name: 'Aktuality' });
    await expect(news).toHaveAttribute('aria-current', 'true');

    await news.click();

    await expect(page).toHaveURL(/\/aktuality$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Pomáháme' })).toHaveAttribute('href', '/projekty');
  });

  test('when they press the back button of the article, then the list opens', async ({ page }) => {
    await page.goto(`/aktuality/${article.slug}`);

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();

    await expect(page).toHaveURL(/\/aktuality$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeVisible();
  });
});

test.describe('Given a visitor paging through the news', () => {
  test('when there are more than ten articles, then the list pages by ten and the address names the page', async ({
    page,
  }) => {
    await mockDonorApi(page);
    const articles = Array.from({ length: 12 }, (_, index) => ({
      ...article,
      id: `0199f3e0-0000-7000-8000-0000000d${String(index).padStart(4, '0')}`,
      slug: `aktualita-${index + 1}`,
      title: `Aktualita ${index + 1}`,
      coverImage: null,
    }));
    const asked: string[] = [];
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) => {
        const url = new URL(route.request().url());
        const pageIndex = Number(url.searchParams.get('page'));
        asked.push(`${url.searchParams.get('page')}/${url.searchParams.get('size')}`);
        return route.fulfill({
          json: {
            items: articles.slice(pageIndex * 10, pageIndex * 10 + 10),
            page: pageIndex,
            size: 10,
            total: articles.length,
            hasMore: pageIndex === 0,
          },
        });
      },
    );

    await page.goto('/aktuality');

    await expect(page.locator('.featured')).toHaveCount(1);
    await expect(page.locator('.news-card')).toHaveCount(9);
    await expect(page.getByText('Strana 1 z 2')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Novější' })).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Stránky aktualit' })
      .getByRole('link', { name: 'Starší' })
      .click();

    await expect(page).toHaveURL('/aktuality?strana=2');
    await expect(page.locator('.news-card')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Aktualita 12' })).toBeVisible();
    await page.getByRole('link', { name: 'Novější' }).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.locator('.news-card')).toHaveCount(9);
    expect(asked).toEqual(['0/10', '1/10', '0/10']);
  });
});

const PAGER_LISTS = [
  { path: '/aktuality?strana=2', api: '/api/content/news', label: 'Stránky aktualit' },
];

async function threePagesOf(page: Page, api: string): Promise<void> {
  await page.route(
    (url) => url.pathname === api,
    (route) => {
      const url = new URL(route.request().url());
      const index = Number(url.searchParams.get('page'));
      const size = Number(url.searchParams.get('size'));
      const items = Array.from({ length: 25 }, (_, number) => ({
        ...(api.endsWith('news') ? article : project),
        id: `0199f3e0-0000-7000-8000-0000000f${String(number).padStart(4, '0')}`,
        slug: `polozka-${number + 1}`,
        title: `Položka ${number + 1}`,
      })).slice(index * size, index * size + size);
      return route.fulfill({
        json: { items, page: index, size, total: 25, hasMore: (index + 1) * size < 25 },
      });
    },
  );
}

async function pagerLayout(nav: Locator) {
  return nav.evaluate((element) => {
    const frame = element.getBoundingClientRect();
    const parts = Array.from(element.querySelectorAll<HTMLElement>('a, .pages-position')).map(
      (part) => {
        const box = part.getBoundingClientRect();
        return {
          name: part.textContent!.replace(/\s+/g, ' ').trim(),
          middle: box.top + box.height / 2,
          centre: box.left + box.width / 2,
          width: box.width,
          height: box.height,
          inside: box.left >= frame.left - 1 && box.right <= frame.right + 1,
        };
      },
    );
    return {
      parts,
      centre: frame.left + frame.width / 2,
      overflows: element.scrollWidth > element.clientWidth + 1,
      pastViewport: frame.right > document.documentElement.clientWidth + 1,
    };
  });
}

for (const { width, height, textPercent } of [
  { width: 390, height: 844, textPercent: 100 },
  { width: 375, height: 667, textPercent: 100 },
  { width: 375, height: 667, textPercent: 200 },
  { width: 320, height: 568, textPercent: 200 },
  { width: 1280, height: 900, textPercent: 100 },
]) {
  test.describe(`Given a visitor ${width} px wide with text at ${textPercent} % at the end of a list`, () => {
    test.use({ viewport: { width, height } });

    for (const { path, api, label } of PAGER_LISTS) {
      test(`when they reach the pages of ${path}, then the directions and the position share one row with the position in its middle`, async ({
        page,
      }) => {
        await mockDonorApi(page);
        await threePagesOf(page, api);
        if (textPercent !== 100) {
          await page.addInitScript((percent) => {
            document.addEventListener('DOMContentLoaded', () => {
              const style = document.createElement('style');
              style.textContent = `html { font-size: ${percent}%; }`;
              document.head.append(style);
            });
          }, textPercent);
        }

        await page.goto(path);
        const nav = page.getByRole('navigation', { name: label });
        await expect(nav.locator('.pages-position')).toBeVisible();
        await nav.evaluate(() => document.fonts.ready);
        const layout = await pagerLayout(nav);

        expect(layout.overflows).toBe(false);
        expect(layout.pastViewport).toBe(false);
        const position = layout.parts.find((part) => part.name.startsWith('Strana'))!;
        expect(Math.abs(position.centre - layout.centre)).toBeLessThanOrEqual(1);
        for (const part of layout.parts) {
          expect(part.inside, part.name).toBe(true);
          expect(Math.abs(part.middle - position.middle), part.name).toBeLessThanOrEqual(1);
        }
        for (const direction of layout.parts.filter((part) => part !== position)) {
          expect(direction.width, direction.name).toBeGreaterThanOrEqual(24);
          expect(direction.height, direction.name).toBeGreaterThanOrEqual(24);
        }
      });
    }
  });
}

async function pretendBrowserThatShares(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shared: ShareData[] = [];
    Object.assign(window, { sharedPages: shared });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async (data: ShareData) => {
        shared.push({ title: data.title, url: data.url });
      },
      configurable: true,
    });
  });
}

async function pretendBrowserWithoutSharing(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
}

async function sharedPages(page: Page): Promise<ShareData[]> {
  return page.evaluate(() => (window as unknown as { sharedPages: ShareData[] }).sharedPages);
}

test.describe('Given a visitor in a browser that can share', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedContent(page);
    await pretendBrowserThatShares(page);
  });

  test('when they share a news article and then a project, then the device gets each title with its address on nfnn.cz', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${article.slug}`);
    await page.getByRole('button', { name: 'Sdílet' }).click();

    await expect
      .poll(() => sharedPages(page))
      .toEqual([{ title: article.title, url: `https://nfnn.cz/aktuality/${article.slug}` }]);
    await expect(page.getByRole('button', { name: 'Kopírovat odkaz' })).toHaveCount(0);

    await page.goto(`/projekty/${project.slug}`);
    await page.getByRole('button', { name: 'Sdílet' }).click();

    await expect
      .poll(() => sharedPages(page))
      .toEqual([{ title: project.title, url: `https://nfnn.cz/projekty/${project.slug}` }]);
  });
  test('when they share an article from Aktuality, then its button names it and the device gets its title with its address on nfnn.cz', async ({
    page,
  }) => {
    await page.goto('/aktuality');
    await page.getByRole('button', { name: `Sdílet ${article.title}`, exact: true }).click();

    await expect
      .poll(() => sharedPages(page))
      .toEqual([{ title: article.title, url: `https://nfnn.cz/aktuality/${article.slug}` }]);
    await expect(page).toHaveURL('/aktuality');
  });
});

test.describe('Given a visitor in a browser that cannot share', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedContent(page);
    await pretendBrowserWithoutSharing(page);
  });

  test('when they copy the link of a news article, then the clipboard holds its address on nfnn.cz', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${article.slug}`);

    await page.getByRole('button', { name: 'Kopírovat odkaz' }).click();

    await expect(page.getByRole('button', { name: 'Zkopírováno' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sdílet' })).toHaveCount(0);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `https://nfnn.cz/aktuality/${article.slug}`,
    );
  });

  test('when they copy the link of an article from Aktuality, then the clipboard holds its address and the page stays', async ({
    page,
  }) => {
    await page.goto('/aktuality');

    await page
      .getByRole('button', { name: `Kopírovat odkaz ${article.title}`, exact: true })
      .click();

    await expect(page.getByRole('button', { name: 'Zkopírováno' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `https://nfnn.cz/aktuality/${article.slug}`,
    );
    await expect(page).toHaveURL('/aktuality');
  });

  test('when they copy the link of a project, then the clipboard holds its address on nfnn.cz', async ({
    page,
  }) => {
    await page.goto(`/projekty/${project.slug}`);

    await page.getByRole('button', { name: 'Kopírovat odkaz' }).click();

    await expect(page.getByRole('button', { name: 'Zkopírováno' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `https://nfnn.cz/projekty/${project.slug}`,
    );
  });
});

test.describe('Given a visitor whose connection drops while they page through Aktuality', () => {
  test('when the next page cannot come, then the page says the connection is missing and trying again online loads it', async ({
    page,
    context,
  }) => {
    await mockDonorApi(page);
    await publishedContent(page);
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) => {
        const index = Number(new URL(route.request().url()).searchParams.get('page'));
        return route.fulfill({
          json: {
            items: [{ ...article, id: `news-${index}`, title: `Aktualita na straně ${index + 1}` }],
            page: index,
            size: 10,
            total: 25,
            hasMore: index < 2,
          },
        });
      },
    );
    await page.goto('/aktuality');
    await expect(page.locator('.featured')).toHaveCount(1);
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) => route.abort('internetdisconnected'),
      { times: 1 },
    );
    await context.setOffline(true);

    await page.getByRole('link', { name: 'Starší' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
      'Bez připojení se aktuality nenačetly. Až budete online, zkuste to znovu.',
    );

    await context.setOffline(false);
    await page.getByRole('button', { name: 'Zkusit znovu' }).click();

    await expect(
      page.getByRole('heading', { level: 3, name: 'Aktualita na straně 2' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeFocused();
  });
});
