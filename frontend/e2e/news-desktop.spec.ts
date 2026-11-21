import { Locator, Page } from '@playwright/test';
import { LARGE_TEXT } from './devices/poses';
import { mockDonorApi, samplePngBase64 } from './donor-session';
import { expect, test } from './fixtures';

const PNG = Buffer.from(samplePngBase64, 'base64');
const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a003';
const EDGE_TOLERANCE_PX = 1;
const NEAR_PX = 48;
const LONG_TAG = 'Pobyty v lázních pro celé rodiny dětí';
const LONGEST_TITLE =
  'Nová střecha nad hlavou pro rodinu z Vysočiny, které loni v létě vyhořel dům i se vším, co měli, a teď začíná znovu';
const LARGEST_SYSTEM_TEXT_PX = 53;
const ENLARGED_ROOT_PX = 23;
const CLAMPED_TITLE_LINES = 3;
const TITLE_WITH_DESCENDERS_AND_RINGS =
  'Příspěvek pro Řehoře, Šárku a Žofii: nový vozík a jízdy pro Ůvaly, Ůžice, Ůštěk, Ůhlejov a Ůsobí';
const RING_LETTER = 'Ů';
const LONG_PEREX =
  'Rodina přišla o domov i o všechno, co v něm měla. Díky dárcům má znovu střechu nad hlavou, nová okna a kamna, a děti se mohou vrátit do své školy.';

interface Box {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

interface InkAroundClip {
  readonly lines: number;
  readonly firstCutLine: string;
  readonly keptInkOutside: number;
  readonly cutInkInside: number;
}

interface ArticleOptions {
  readonly title?: string;
  readonly tag?: string | null;
  readonly perex?: string;
  readonly photo?: boolean;
  readonly signer?: string | null;
}

function article(index: number, options: ArticleOptions = {}): Record<string, unknown> {
  const signer = options.signer === undefined ? null : options.signer;
  return {
    id: `0199f3e0-0000-7000-8000-0000000d${String(index).padStart(4, '0')}`,
    slug: `aktualita-${index}`,
    title: options.title ?? `Zahrada pro děti ${index}`,
    tag: options.tag === undefined ? 'Projekt' : options.tag,
    perex: options.perex ?? 'Stavíme zahradu, kde si děti budou hrát.',
    body: 'Text aktuality.',
    coverImage:
      options.photo === false
        ? null
        : { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}`, alt: null, focalPoint: null },
    publishedOn: '2025-10-25',
    createdAt: '2025-10-24T09:00:00Z',
    updatedAt: '2025-10-25T07:30:00Z',
    signer:
      signer === null
        ? null
        : { id: `p${index}`, name: signer, role: 'Předsedkyně správní rady', portrait: null },
  };
}

function story(index: number, tag: string | null, title: string): Record<string, unknown> {
  return {
    id: `0199f3e0-0000-7000-8000-0000000e${String(index).padStart(4, '0')}`,
    slug: `pribeh-${index}`,
    title,
    year: 2025,
    category: 'CHILDREN',
    tag,
    perex: 'Krátké shrnutí.',
    body: 'Text příběhu.',
    coverImage: null,
    publishedOn: '2025-10-01',
    createdAt: '2025-09-19T09:00:00Z',
    updatedAt: '2025-10-01T07:30:00Z',
    live: true,
  };
}

async function enlargeText(page: Page, rootFontSize: string): Promise<void> {
  await page.addInitScript((size) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `html { font-size: ${size}; }`;
      document.head.append(style);
    });
  }, rootFontSize);
}

async function openNews(
  page: Page,
  news: Record<string, unknown>[],
  size: { width: number; height: number },
  stories: Record<string, unknown>[] = [],
): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({
        json: { items: news, page: 0, size: 10, total: news.length, hasMore: false },
      }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({
        json: { items: stories, page: 0, size: 50, total: stories.length, hasMore: false },
      }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: PNG }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(size);
  await page.goto('/aktuality');
  await expect(page.locator('app-featured-news')).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

function boxOf(locator: Locator): Promise<Box> {
  return locator.evaluate((element) => {
    const { top, left, right, bottom } = element.getBoundingClientRect();
    return { top, left, right, bottom };
  });
}

function linesOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = [...range.getClientRects()]
      .filter((rect) => rect.width > 0)
      .map((rect) => Math.round(rect.top));
    return new Set(tops).size;
  });
}

function missingLettersOfTag(tag: Locator): Promise<number> {
  return tag.evaluate((element) => {
    if (element.scrollWidth <= element.clientWidth) {
      return 0;
    }
    const style = getComputedStyle(element);
    const contentEnd =
      element.getBoundingClientRect().right -
      parseFloat(style.borderRightWidth) -
      parseFloat(style.paddingRight);
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
    if (text === null) {
      return Number.POSITIVE_INFINITY;
    }
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, text.textContent?.length ?? 0);
    const context = document.createElement('canvas').getContext('2d');
    if (context === null) {
      return Number.POSITIVE_INFINITY;
    }
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const ellipsis = context.measureText('…').width;
    return Math.max(0, range.getBoundingClientRect().right + ellipsis - contentEnd);
  });
}

function inkAroundClip(title: Locator, keptLines: number): Promise<InkAroundClip> {
  return title.evaluate((element, kept) => {
    const style = getComputedStyle(element);
    const context = document.createElement('canvas').getContext('2d');
    if (context === null) {
      return {
        lines: 0,
        firstCutLine: '',
        keptInkOutside: Number.POSITIVE_INFINITY,
        cutInkInside: Number.POSITIVE_INFINITY,
      };
    }
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const clip = element.getBoundingClientRect();
    const range = document.createRange();
    const glyphs: { line: number; letter: string; top: number; bottom: number }[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
      const value = text.textContent ?? '';
      for (let index = 0; index < value.length; index += 1) {
        const letter = value[index];
        if (/\s/.test(letter)) {
          continue;
        }
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const box = range.getClientRects()[0];
        if (box === undefined) {
          continue;
        }
        const metrics = context.measureText(letter);
        const ascentShare =
          metrics.fontBoundingBoxAscent /
          (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent);
        const baseline = box.top + box.height * ascentShare;
        glyphs.push({
          line: Math.round(box.top),
          letter,
          top: baseline - metrics.actualBoundingBoxAscent,
          bottom: baseline + metrics.actualBoundingBoxDescent,
        });
      }
    }
    const lineTops = [...new Set(glyphs.map((glyph) => glyph.line))].sort((a, b) => a - b);
    let keptInkOutside = Number.NEGATIVE_INFINITY;
    let cutInkInside = Number.NEGATIVE_INFINITY;
    for (const glyph of glyphs) {
      if (lineTops.indexOf(glyph.line) < kept) {
        keptInkOutside = Math.max(keptInkOutside, clip.top - glyph.top, glyph.bottom - clip.bottom);
      } else {
        cutInkInside = Math.max(cutInkInside, clip.bottom - glyph.top);
      }
    }
    const firstCutLine = glyphs
      .filter((glyph) => glyph.line === lineTops[kept])
      .map((glyph) => glyph.letter)
      .join('');
    return { lines: lineTops.length, firstCutLine, keptInkOutside, cutInkInside };
  }, keptLines);
}

function lastLetterPastTheBox(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
    const last = rects[rects.length - 1];
    if (last === undefined) {
      return Number.POSITIVE_INFINITY;
    }
    return (last.top + last.bottom) / 2 - element.getBoundingClientRect().bottom;
  });
}

function breaksInsideWords(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let breaks = 0;
    let previous: { top: number; letter: string } | null = null;
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
      const value = text.textContent ?? '';
      for (let index = 0; index < value.length; index += 1) {
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const rect = range.getClientRects()[0];
        if (rect === undefined) {
          continue;
        }
        const top = Math.round(rect.top);
        const letter = value[index];
        if (
          previous !== null &&
          top > previous.top &&
          !/\s/.test(previous.letter) &&
          !/\s/.test(letter)
        ) {
          breaks += 1;
        }
        previous = { top, letter };
      }
    }
    return breaks;
  });
}

test.describe('Given a visitor on the Aktuality tab on a computer', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when an older news card carries a long tag, then its date and its tag each keep one line', async ({
    page,
  }) => {
    await openNews(page, [article(1), article(2, { tag: LONG_TAG }), article(3)], {
      width: 1280,
      height: 900,
    });
    const card = page.locator('app-news-card').first();

    await expect(card.locator('.news-date')).toHaveText('25. 10. 2025');
    expect(await linesOf(card.locator('.news-date'))).toBe(1);
    expect(await linesOf(card.locator('.news-tag'))).toBe(1);
  });

  for (const width of [1920, 900]) {
    test(`when older news cards have signers of different lengths in a ${width} px window, then Kopírovat odkaz stands at the same place in every card`, async ({
      page,
    }) => {
      await openNews(
        page,
        [
          article(1),
          article(2, { signer: 'Eva Malá' }),
          article(3, { signer: 'Marie Novotná Dlouhá' }),
          article(4, { signer: 'Alžběta Procházková Svobodová' }),
        ],
        { width, height: 900 },
      );
      const cards = page.locator('app-news-card');
      await expect(cards).toHaveCount(3);

      const offsets: number[] = [];
      for (const card of await cards.all()) {
        const share = card.locator('.news-share').getByRole('button');
        await expect(share).toBeVisible();
        const [cardBox, shareBox] = [await boxOf(card), await boxOf(share)];
        offsets.push(cardBox.right - shareBox.right);
      }
      for (const offset of offsets) {
        expect(Math.abs(offset - offsets[0])).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
      }
    });
  }

  test('when the leading news has the longest title, then Číst celé stands within the first window', async ({
    page,
  }) => {
    const height = 800;
    await openNews(
      page,
      [article(1, { title: LONGEST_TITLE, perex: LONG_PEREX, signer: 'Eva Malá' }), article(2)],
      { width: 1280, height },
    );

    const more = page.locator('app-featured-news').getByRole('link', { name: /^Číst celé/ });
    await expect(more).toBeVisible();
    expect((await boxOf(more)).bottom).toBeLessThanOrEqual(height);
    await expect(page.locator('.featured-title')).toHaveText(LONGEST_TITLE);
  });

  for (const { photo, look } of [
    { photo: false, look: 'no photo' },
    { photo: true, look: 'a photo' },
  ]) {
    test(`when the leading news has ${look}, then its buttons stand under its text at its leading edge`, async ({
      page,
    }) => {
      await openNews(page, [article(1, { photo }), article(2)], { width: 1280, height: 900 });
      const featured = page.locator('app-featured-news');

      const title = await boxOf(featured.locator('.featured-title'));
      const share = await boxOf(featured.locator('.featured-share').getByRole('button'));
      const perex = await boxOf(featured.locator('.featured-perex'));
      expect(Math.abs(share.left - title.left)).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
      expect(share.top).toBeGreaterThanOrEqual(perex.bottom);
    });
  }

  test('when the leading news title runs past three lines, then its first three lines show their accents and descenders and nothing of the fourth shows, not even the ring of a capital Ů', async ({
    page,
  }) => {
    await openNews(page, [article(1, { title: TITLE_WITH_DESCENDERS_AND_RINGS }), article(2)], {
      width: 1280,
      height: 900,
    });

    const ink = await inkAroundClip(page.locator('.featured-title'), CLAMPED_TITLE_LINES);
    expect(ink.lines).toBeGreaterThan(CLAMPED_TITLE_LINES);
    expect(ink.firstCutLine).toContain(RING_LETTER);
    expect(ink.keptInkOutside).toBeLessThanOrEqual(0);
    expect(ink.cutInkInside).toBeLessThanOrEqual(0);
  });

  for (const { width, tags } of [
    { width: 1280, tags: 'each tag keeps one line' },
    { width: 1024, tags: 'each tag shows whole and the long one wraps' },
  ]) {
    test(`when the stories of the year mix long tags and none in a ${width} px window, then ${tags}, no title breaks inside a word and the titles of a row line up`, async ({
      page,
    }) => {
      await openNews(page, [article(1), article(2)], { width, height: 900 }, [
        story(1, LONG_TAG, 'Rehabilitační pobyt pro jejich nejmenšího syna'),
        story(2, null, 'Fenka Belinka'),
        story(3, 'Léčba', 'Nový vozík pro Michala, který se znovu učí chodit'),
        story(4, null, 'Rehabilitace pro Natálku a jejich maminku'),
      ]);
      const tiles = page.locator('app-year-stories .story');
      await expect(tiles).toHaveCount(4);

      const storyTags = page.locator('app-year-stories .story-tag');
      if (width === 1280) {
        for (const tag of await storyTags.all()) {
          expect(await linesOf(tag)).toBe(1);
        }
      } else {
        for (const tag of await storyTags.all()) {
          expect(await missingLettersOfTag(tag)).toBeLessThanOrEqual(0);
        }
        expect(await linesOf(storyTags.filter({ hasText: LONG_TAG }))).toBeGreaterThan(1);
      }
      const tops: number[] = [];
      for (const title of await page.locator('app-year-stories .story-title').all()) {
        expect(await breaksInsideWords(title)).toBe(0);
        tops.push((await boxOf(title)).top);
      }
      for (const top of tops) {
        expect(Math.abs(top - tops[0])).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
      }
    });
  }

  test('when an older news card has no photo and a short text beside cards with photos, then its button follows its text', async ({
    page,
  }) => {
    await openNews(
      page,
      [
        article(1),
        article(2, { perex: LONG_PEREX, signer: 'Eva Malá' }),
        article(3, { photo: false, perex: 'Krátce.', signer: 'Eva Malá' }),
        article(4, { perex: LONG_PEREX, signer: 'Eva Malá' }),
      ],
      { width: 1280, height: 900 },
    );
    const card = page.locator('app-news-card').nth(1);
    await expect(card.locator('img')).toHaveCount(0);

    const perex = await boxOf(card.locator('.news-perex'));
    const signer = await boxOf(card.locator('.signer'));
    const share = await boxOf(card.locator('.news-share').getByRole('button'));
    const textEnd = share.top >= signer.bottom ? signer.bottom : perex.bottom;
    expect(signer.top - perex.bottom).toBeLessThanOrEqual(NEAR_PX);
    expect(share.top - textEnd).toBeLessThanOrEqual(NEAR_PX);
  });
});

test.describe('Given a visitor on the Aktuality tab with enlarged text', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  for (const { width, height, rootFontSize, size } of [
    { width: 390, height: 844, rootFontSize: `${LARGE_TEXT}%`, size: `${LARGE_TEXT} % text` },
    {
      width: 834,
      height: 1194,
      rootFontSize: `${LARGEST_SYSTEM_TEXT_PX}px`,
      size: 'the largest text',
    },
    {
      width: 1024,
      height: 1366,
      rootFontSize: `${LARGEST_SYSTEM_TEXT_PX}px`,
      size: 'the largest text',
    },
  ]) {
    test(`when a news card carries a long tag at ${size} in a ${width} px window, then its whole tag shows and the card does not overflow`, async ({
      page,
    }) => {
      await enlargeText(page, rootFontSize);
      await openNews(page, [article(1), article(2, { tag: LONG_TAG }), article(3)], {
        width,
        height,
      });
      const card = page.locator('app-news-card').first();
      const tag = card.locator('.news-tag');
      await expect(tag).toHaveText(LONG_TAG);

      expect(await missingLettersOfTag(tag)).toBeLessThanOrEqual(0);
      const overflow = await card
        .locator('.news-card')
        .evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test(`when a story of the year carries a long tag at a ${ENLARGED_ROOT_PX} px root in an 834 px window, then its tag loses no letter`, async ({
    page,
  }) => {
    await enlargeText(page, `${ENLARGED_ROOT_PX}px`);
    await openNews(page, [article(1), article(2)], { width: 834, height: 1194 }, [
      story(1, LONG_TAG, 'Rehabilitační pobyt pro jejich nejmenšího syna'),
    ]);
    const tag = page.locator('app-year-stories .story-tag');
    await expect(tag).toHaveText(LONG_TAG);

    expect(await missingLettersOfTag(tag)).toBeLessThanOrEqual(0);
  });

  for (const { width, height } of [
    { width: 834, height: 1194 },
    { width: 1024, height: 1366 },
  ]) {
    test(`when a story of the year carries a long tag at the largest text in a ${width} px window, then its tag wraps whole`, async ({
      page,
    }) => {
      await enlargeText(page, `${LARGEST_SYSTEM_TEXT_PX}px`);
      await openNews(page, [article(1), article(2)], { width, height }, [
        story(1, LONG_TAG, 'Rehabilitační pobyt pro jejich nejmenšího syna'),
      ]);
      const tag = page.locator('app-year-stories .story-tag');
      await expect(tag).toHaveText(LONG_TAG);

      expect(await missingLettersOfTag(tag)).toBeLessThanOrEqual(0);
      expect(await linesOf(tag)).toBeGreaterThan(1);
    });
  }

  test('when the leading news has a long title at the largest text in an 834 px window, then the whole title shows', async ({
    page,
  }) => {
    await enlargeText(page, `${LARGEST_SYSTEM_TEXT_PX}px`);
    await openNews(page, [article(1, { title: LONGEST_TITLE }), article(2)], {
      width: 834,
      height: 1194,
    });

    expect(await lastLetterPastTheBox(page.locator('.featured-title'))).toBeLessThanOrEqual(0);
  });
});
