import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi } from './donor-session';

const SIZE_TOLERANCE = 0.5;

interface DrawnMark {
  element: string;
  width: number;
  height: number;
}

async function drawnMark(mark: Locator): Promise<DrawnMark> {
  await expect(mark).toBeVisible();
  return mark.evaluate((host) => {
    const drawn = host.matches('svg') ? host : (host.querySelector('svg') ?? host);
    const box = drawn.getBoundingClientRect();
    return { element: drawn.localName, width: box.width, height: box.height };
  });
}

async function serveFoundersNote(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/home',
    (route) =>
      route.fulfill({
        json: {
          news: [],
          projects: [],
          people: {
            featured: [],
            board: [],
            footnote: null,
            note: { text: 'Děkujeme všem, kdo pomáhají s námi.', signatures: [] },
          },
        },
      }),
  );
}

test.describe('Given a visitor on a computer who reads the quotes on Přispět and O nás', () => {
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await serveFoundersNote(page);
  });

  test('when they see both quotes, then both open with the same drawn quote mark of the same size', async ({
    page,
  }) => {
    await page.goto('/prispet');
    const donateMark = await drawnMark(page.locator('.donate-quote-mark'));

    await page.goto('/o-nas');
    const aboutMark = await drawnMark(page.locator('#o-nas .quote-mark'));

    expect(donateMark.element).toBe('svg');
    expect(aboutMark.element).toBe(donateMark.element);
    expect(Math.abs(aboutMark.width - donateMark.width)).toBeLessThanOrEqual(SIZE_TOLERANCE);
    expect(Math.abs(aboutMark.height - donateMark.height)).toBeLessThanOrEqual(SIZE_TOLERANCE);
  });
});

async function drawnColour(mark: Locator): Promise<string> {
  await expect(mark).toBeVisible();
  return mark.evaluate((host) => getComputedStyle(host.querySelector('svg') ?? host).fill);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Given a visitor on a computer in the ${colorScheme} appearance who reads the quotes on Přispět and O nás`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', colorScheme });

    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page);
      await serveFoundersNote(page);
    });

    test('when they see both quotes, then both quote marks take the same colour', async ({
      page,
    }) => {
      await page.goto('/prispet');
      const donateColour = await drawnColour(page.locator('.donate-quote-mark'));

      await page.goto('/o-nas');
      const aboutColour = await drawnColour(page.locator('#o-nas .quote-mark'));

      expect(aboutColour).toBe(donateColour);
    });
  });
}

interface MarkGap {
  gap: number;
  ownSpace: number;
}

async function gapUnderMark(mark: Locator, text: string): Promise<MarkGap> {
  await expect(mark).toBeVisible();
  return mark.evaluate((host, textSelector) => {
    const drawn = host.querySelector('svg') ?? host;
    const following = host.parentElement!.querySelector(textSelector)!;
    return {
      gap: following.getBoundingClientRect().top - drawn.getBoundingClientRect().bottom,
      ownSpace: parseFloat(getComputedStyle(host).marginBottom),
    };
  }, text);
}

test.describe('Given a visitor on a computer who reads the quotes on Přispět and O nás, measured for their spacing', () => {
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await serveFoundersNote(page);
  });

  test('when they see both quotes, then the text under each quote mark starts exactly the mark’s own space below the drawn mark', async ({
    page,
  }) => {
    await page.goto('/prispet');
    const donate = await gapUnderMark(page.locator('.donate-quote-mark'), 'p');

    await page.goto('/o-nas');
    const about = await gapUnderMark(page.locator('#o-nas .quote-mark'), '.quote-text');

    expect(Math.abs(donate.gap - donate.ownSpace)).toBeLessThanOrEqual(SIZE_TOLERANCE);
    expect(Math.abs(about.gap - about.ownSpace)).toBeLessThanOrEqual(SIZE_TOLERANCE);
  });
});

test.describe('Given a visitor on a phone who reads the founders’ note on O nás', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await serveFoundersNote(page);
  });

  test('when the note stands at the start of the line, then its quote mark starts where its text starts', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    const mark = page.locator('#o-nas .quote-mark');
    await expect(mark).toBeVisible();

    const starts = await mark.evaluate((host) => ({
      mark: (host.querySelector('svg') ?? host).getBoundingClientRect().left,
      text: host.parentElement!.querySelector('.quote-text p')!.getBoundingClientRect().left,
    }));

    expect(Math.abs(starts.mark - starts.text)).toBeLessThanOrEqual(SIZE_TOLERANCE);
  });
});
