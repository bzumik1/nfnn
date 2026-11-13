import { Page } from '@playwright/test';
import { stepBack } from './app-history';
import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c011',
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

interface SeenTransition {
  readonly kind: 'push' | 'pop' | 'none';
  readonly hiddenFromAssistiveTech: boolean;
  readonly copies: number;
  readonly moved: readonly string[];
}

declare global {
  interface Window {
    nfnnSeenTransitions: SeenTransition[];
  }
}

async function watchTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.nfnnSeenTransitions = [];
    const seen = new WeakMap<Element, SeenTransition>();
    const MOTION_KEYS = new Set(['offset', 'easing', 'composite', 'computedOffset']);
    new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.classList.contains('page-transition')) {
            const entry: SeenTransition = {
              kind: node.classList.contains('page-transition--push')
                ? 'push'
                : node.classList.contains('page-transition--pop')
                  ? 'pop'
                  : 'none',
              hiddenFromAssistiveTech: node.getAttribute('aria-hidden') === 'true' && node.inert,
              copies: 0,
              moved: [],
            };
            seen.set(node, entry);
            window.nfnnSeenTransitions.push(entry);
          }
        });
        const target = record.target;
        if (
          record.type === 'attributes' &&
          target instanceof HTMLElement &&
          target.classList.contains('page-transition--moving')
        ) {
          const entry = seen.get(target) as { copies: number; moved: string[] } | undefined;
          if (entry === undefined || entry.copies > 0) {
            continue;
          }
          entry.copies = target.querySelectorAll('.page-transition__page').length;
          target.querySelectorAll('.page-transition__page, .page-transition__dim').forEach((part) =>
            part.getAnimations().forEach((animation) => {
              const effect = animation.effect as KeyframeEffect;
              effect
                .getKeyframes()
                .flatMap((frame) => Object.keys(frame))
                .filter((key) => !MOTION_KEYS.has(key))
                .forEach((key) => entry.moved.push(key));
            }),
          );
        }
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  });
}

function seenTransitions(page: Page): Promise<SeenTransition[]> {
  return page.evaluate(() => window.nfnnSeenTransitions);
}

async function forgetTransitions(page: Page): Promise<void> {
  await page.evaluate(() => (window.nfnnSeenTransitions = []));
}

function overlays(page: Page) {
  return page.locator('.page-transition');
}

function back(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: 'Zpět' });
}

function tabs(page: Page) {
  return page.getByRole('navigation', { name: 'Hlavní sekce' });
}

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

async function openArticleFromList(page: Page): Promise<void> {
  await page.goto('/aktuality');
  await page.getByRole('link', { name: article.title }).click();
  await expect(page).toHaveURL(`/aktuality/${article.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeFocused();
  await expect(overlays(page)).toHaveCount(0);
}

test.describe('Given a visitor reading the news on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedArticle(page);
    await watchTransitions(page);
  });

  test('when they open an article from the list, then the article slides in over the list with only transform and opacity moving, and its heading takes the focus', async ({
    page,
  }) => {
    await openArticleFromList(page);

    const [transition, ...more] = await seenTransitions(page);
    expect(more).toHaveLength(0);
    expect(transition).toMatchObject({ kind: 'push', hiddenFromAssistiveTech: true, copies: 2 });
    expect(transition.moved.length).toBeGreaterThan(0);
    expect(new Set(transition.moved)).toEqual(new Set(['transform', 'opacity']));
  });

  test('when they press Zpět on the article, then the article slides away off the list and the link to that article takes the focus', async ({
    page,
  }) => {
    await openArticleFromList(page);
    await forgetTransitions(page);

    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(
      page.getByRole('main').locator(`a[href="/aktuality/${article.slug}"]`).first(),
    ).toBeFocused();
    await expect(overlays(page)).toHaveCount(0);
    expect(await seenTransitions(page)).toEqual([
      expect.objectContaining({ kind: 'pop', hiddenFromAssistiveTech: true, copies: 2 }),
    ]);
  });

  test('when the app steps back without Zpět, then the article slides away the same way', async ({
    page,
  }) => {
    await openArticleFromList(page);
    await forgetTransitions(page);

    await stepBack(page);

    await expect(page).toHaveURL('/aktuality');
    await expect(overlays(page)).toHaveCount(0);
    expect(await seenTransitions(page)).toEqual([expect.objectContaining({ kind: 'pop' })]);
  });

  test('when they reload the article and press Zpět, then the list it opens in place of the article comes back the same way', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${article.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();

    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(overlays(page)).toHaveCount(0);
    expect(await seenTransitions(page)).toEqual([expect.objectContaining({ kind: 'pop' })]);
  });

  test('when they switch tabs, then the pages change without a slide', async ({ page }) => {
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeVisible();

    await tabs(page).getByRole('link', { name: 'Pomáháme' }).click();

    await expect(page).toHaveURL(/\/projekty/);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    expect(await seenTransitions(page)).toEqual([]);
  });

  test('when they ask the system for less motion, then pages change at once without a slide', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await openArticleFromList(page);
    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(
      page.getByRole('main').locator(`a[href="/aktuality/${article.slug}"]`).first(),
    ).toBeFocused();
    expect(await seenTransitions(page)).toEqual([]);
  });
});

test.describe('Given a visitor reading the news on a wide screen', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedArticle(page);
    await watchTransitions(page);
  });

  test('when they open an article and press Zpět, then pages change at once without a slide', async ({
    page,
  }) => {
    await openArticleFromList(page);
    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    expect(await seenTransitions(page)).toEqual([]);
  });
});
