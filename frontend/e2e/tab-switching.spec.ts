import type { Page, Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { requestsInFlight, settled } from './settled';

const PHOTO = readFileSync(join(__dirname, '..', 'public', 'images', 'news-1.webp'));
const FRAMES_AFTER_SWITCH = 12;

interface SwitchFrame {
  readonly scrollY: number;
  readonly seenBeforeAndDrawn: number;
}

function newsWithPhoto(index: number) {
  return {
    ...article,
    id: `0199f3e0-0000-7000-8000-00000000c2${String(index).padStart(2, '0')}`,
    slug: `zprava-${index}`,
    title: `Zpráva ${index}`,
    publishedOn: `2026-10-${String(20 - index).padStart(2, '0')}`,
    coverImage: {
      id: `0199f3e0-0000-7000-8000-00000000d2${String(index).padStart(2, '0')}`,
      url: `/api/content/media/0199f3e0-0000-7000-8000-00000000d2${String(index).padStart(2, '0')}`,
      alt: null,
      focalPoint: null,
    },
  };
}

async function newsWithPhotos(page: Page): Promise<() => readonly string[]> {
  const items = [1, 2, 3, 4, 5, 6].map(newsWithPhoto);
  const photosAsked: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/content/news/'),
    (route) => {
      const slug = new URL(route.request().url()).pathname.split('/').pop();
      const item = items.find((news) => news.slug === slug);
      return item ? route.fulfill({ json: item }) : route.fulfill({ status: 404 });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({
        json: { items, page: 0, size: 10, total: items.length, hasMore: false },
      }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => {
      const asked = new URL(route.request().url());
      photosAsked.push(`${asked.pathname}${asked.search}`);
      return route.fulfill({
        body: PHOTO,
        contentType: 'image/webp',
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      });
    },
  );
  return () => [...photosAsked];
}

async function photosInViewDrawn(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .getByRole('main')
        .locator('img')
        .evaluateAll((all) => {
          const inView = all
            .map((photo) => photo as HTMLImageElement)
            .filter((photo) => {
              const box = photo.getBoundingClientRect();
              return box.bottom > 0 && box.top < window.innerHeight && box.width > 0;
            });
          return (
            inView.length > 0 && inView.every((photo) => photo.complete && photo.naturalWidth > 0)
          );
        }),
    )
    .toBe(true);
}

async function rememberDrawnPhotos(page: Page): Promise<readonly string[]> {
  await photosInViewDrawn(page);
  return page
    .getByRole('main')
    .locator('img')
    .evaluateAll((all) => {
      const drawn = all
        .map((photo) => photo as HTMLImageElement)
        .filter((photo) => photo.complete && photo.naturalWidth > 0);
      drawn.forEach((photo) => photo.setAttribute('data-seen-before', ''));
      return drawn.map((photo) => {
        const address = new URL(photo.currentSrc);
        return `${address.pathname}${address.search}`;
      });
    });
}

function askedAgain(
  asked: () => readonly string[],
  before: number,
  photos: readonly string[],
): string[] {
  return asked()
    .slice(before)
    .filter((address) => photos.includes(address));
}

function framesOfSwitch(page: Page, name: string, path: string): Promise<SwitchFrame[]> {
  return framesWhile(page, path, () => tab(page, name).click());
}

async function framesWhile(
  page: Page,
  path: string,
  act: () => Promise<void>,
): Promise<SwitchFrame[]> {
  const sampling = page.evaluate(
    ({ target, wanted }) =>
      new Promise<SwitchFrame[]>((done) => {
        const frames: SwitchFrame[] = [];
        const sample = (): void => {
          if (location.pathname === target) {
            const seenBefore = Array.from(
              document.querySelectorAll<HTMLImageElement>('main img[data-seen-before]'),
            );
            frames.push({
              scrollY: Math.round(window.scrollY),
              seenBeforeAndDrawn: seenBefore.filter(
                (photo) => photo.complete && photo.naturalWidth > 0,
              ).length,
            });
          }
          if (frames.length < wanted) {
            requestAnimationFrame(sample);
          } else {
            done(frames);
          }
        };
        requestAnimationFrame(sample);
      }),
    { target: path, wanted: FRAMES_AFTER_SWITCH },
  );
  await act();
  return sampling;
}

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c101',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec.',
  coverImage: null,
  publishedOn: '2026-10-20',
  live: true,
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
  signer: null,
};

interface HeldNews {
  release(): void;
  readonly asked: () => number;
}

async function newsAnsweredOnceThenHeld(page: Page): Promise<HeldNews> {
  let asked = 0;
  let release: () => void = () => undefined;
  const held = new Promise<void>((done) => (release = done));
  await page.route(
    (url) => url.pathname === '/api/content/news',
    async (route) => {
      const firstPageOfTheList = new URL(route.request().url()).searchParams.get('size') === '10';
      asked += firstPageOfTheList ? 1 : 0;
      if (firstPageOfTheList && asked > 1) {
        await held;
      }
      await route.fulfill({
        json: { items: [article], page: 0, size: 10, total: 1, hasMore: false },
      });
    },
  );
  return { release: () => release(), asked: () => asked };
}

const SCRIPTS_QUIET_MS = 1_000;

async function scriptsStopArriving(page: Page, inFlight: () => number): Promise<void> {
  let lastCount = -1;
  await expect
    .poll(
      async () => {
        await settled(page, inFlight, 10_000);
        const count = await page.evaluate(
          () =>
            performance.getEntriesByType('resource').filter((entry) => entry.name.endsWith('.js'))
              .length,
        );
        const unchanged = count === lastCount;
        lastCount = count;
        return unchanged;
      },
      { intervals: [SCRIPTS_QUIET_MS], timeout: 20_000 },
    )
    .toBe(true);
}

function tab(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Hlavní sekce' }).getByRole('link', { name });
}

test.describe('Given a visitor switching between the tabs', () => {
  test('when they return to a tab they have seen, then its content shows at once while the server is asked again', async ({
    page,
  }) => {
    const news = await newsAnsweredOnceThenHeld(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { name: article.title })).toBeVisible();

    await tab(page, 'O nás').click();
    await expect(page).toHaveURL(/\/o-nas$/);
    await tab(page, 'Aktuality').click();

    await expect(page.getByRole('heading', { name: article.title })).toBeVisible();
    await expect(page.getByText('Načítáme aktuality…')).toHaveCount(0);
    await expect.poll(news.asked).toBe(2);
    news.release();
  });

  test('when the first page has opened, then the pages of the other tabs are loaded ahead, so the first switch waits for no code', async ({
    page,
  }) => {
    const inFlight = requestsInFlight(page);
    await page.goto('/o-nas');
    await scriptsStopArriving(page, inFlight);

    const scripts: Request[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') {
        scripts.push(request);
      }
    });
    for (const [name, path] of [
      ['Aktuality', /\/aktuality$/],
      ['Pomáháme', /\/projekty$/],
      ['Přispět', /\/prispet$/],
    ] as const) {
      await tab(page, name).click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    }

    expect(scripts.map((request) => new URL(request.url()).pathname)).toEqual([]);
  });

  test('when they return to a tab with photos, then every frame shows the photos already drawn and no photo is asked for again', async ({
    page,
  }) => {
    const photosAsked = await newsWithPhotos(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { name: 'Zpráva 2' })).toBeVisible();
    const photos = await rememberDrawnPhotos(page);
    const askedBefore = photosAsked().length;

    await tab(page, 'O nás').click();
    await expect(page).toHaveURL(/\/o-nas$/);
    const frames = await framesOfSwitch(page, 'Aktuality', '/aktuality');

    expect(frames.map((frame) => frame.seenBeforeAndDrawn)).toEqual(
      frames.map(() => photos.length),
    );
    expect(askedAgain(photosAsked, askedBefore, photos)).toEqual([]);
  });

  test('when they return to a tab they scrolled, then it opens where they left it, and a tab not scrolled opens at its top, each without sliding', async ({
    page,
  }) => {
    await newsWithPhotos(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { name: 'Zpráva 6' })).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);

    const toAbout = await framesOfSwitch(page, 'O nás', '/o-nas');
    const backToNews = await framesOfSwitch(page, 'Aktuality', '/aktuality');

    expect(toAbout.map((frame) => frame.scrollY)).toEqual(toAbout.map(() => 0));
    expect(backToNews.map((frame) => frame.scrollY)).toEqual(backToNews.map(() => 300));
  });

  test('when they leave an article for another tab and come back, then the article is as they left it, and Zpět shows the list where they left it, without sliding', async ({
    page,
  }) => {
    const photosAsked = await newsWithPhotos(page);
    await page.goto('/aktuality');
    const article = page.getByRole('main').getByRole('link', { name: 'Zpráva 4' }).first();
    await article.scrollIntoViewIfNeeded();
    const listTop = await page.evaluate(() => Math.round(window.scrollY));
    await article.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Zpráva 4' })).toBeVisible();
    const photos = await rememberDrawnPhotos(page);
    const askedBefore = photosAsked().length;

    await tab(page, 'O nás').click();
    await expect(page).toHaveURL(/\/o-nas$/);
    const backToArticle = await framesOfSwitch(page, 'Aktuality', '/aktuality/zprava-4');
    const backToList = await framesWhile(page, '/aktuality', () =>
      page.getByRole('button', { name: 'Zpět' }).click(),
    );

    expect(backToArticle.map((frame) => frame.seenBeforeAndDrawn)).toEqual(
      backToArticle.map(() => photos.length),
    );
    expect(askedAgain(photosAsked, askedBefore, photos)).toEqual([]);
    expect(backToList.map((frame) => frame.scrollY)).toEqual(backToList.map(() => listTop));
  });

  test('when the first page has opened, then the lists of the other tabs are asked for ahead, so the first switch shows them at once', async ({
    page,
  }) => {
    const news = await newsAnsweredOnceThenHeld(page);
    const listAhead = page.waitForResponse((response) =>
      response.url().endsWith('/api/content/news?page=0&size=10'),
    );
    await page.goto('/o-nas');
    await listAhead;
    expect(news.asked()).toBe(1);

    await tab(page, 'Aktuality').click();

    await expect(page.getByRole('heading', { name: article.title })).toBeVisible();
    await expect(page.getByText('Načítáme aktuality…')).toHaveCount(0);
    news.release();
  });

  test('when the pointer rests on an article before opening it, then the article is fetched ahead and opens complete, without its loading line', async ({
    page,
  }) => {
    await newsWithPhotos(page);
    await page.goto('/aktuality');
    const link = page.getByRole('main').getByRole('link', { name: 'Zpráva 2' }).first();
    await expect(link).toBeVisible();
    const fetchedAhead = page.waitForResponse((response) =>
      response.url().endsWith('/api/content/news/zprava-2'),
    );
    await link.hover();
    await fetchedAhead;
    await page.evaluate(() => {
      const seen = { loading: false };
      Object.assign(window, { nfnnArticleLoading: seen });
      new MutationObserver(() => {
        seen.loading ||= document.body.textContent?.includes('Načítáme stránku') ?? false;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    await link.click();

    await expect(page.getByRole('heading', { level: 1, name: 'Zpráva 2' })).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { nfnnArticleLoading: { loading: boolean } }).nfnnArticleLoading,
      ),
    ).toEqual({ loading: false });
  });
});
