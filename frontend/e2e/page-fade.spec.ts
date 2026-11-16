import { Locator, Page } from '@playwright/test';
import { stepBack } from './app-history';
import { article, donorWithDonations, mockPublicContent } from './baseline/screen-mocks';
import { mockDonorApi, openAccountItem, rememberedDonorSession } from './donor-session';
import { expect, test } from './fixtures';

interface FadeFrame {
  readonly path: string;
  readonly copy: number | null;
  readonly copyAt: number | null;
  readonly content: number;
  readonly header: string;
  readonly copyHeaderShown: boolean;
  readonly copyHidden: boolean;
  readonly ground: string;
  readonly headingFocused: boolean;
  readonly top: number;
}

declare global {
  interface Window {
    nfnnFadeFrames: FadeFrame[];
  }
}

async function slowAnimations(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
}

async function watchFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.nfnnFadeFrames = [];
    const opacityOf = (element: Element | null): number | null =>
      element === null ? null : Number(getComputedStyle(element).opacity);
    const groundBehind = (overlay: Element | null): string => {
      const own = overlay === null ? '' : getComputedStyle(overlay).backgroundColor;
      return own !== '' && own !== 'rgba(0, 0, 0, 0)'
        ? own
        : getComputedStyle(document.body).backgroundColor;
    };
    const sample = (): void => {
      const overlay = document.querySelector('.page-fade');
      const copy = overlay?.querySelector('.page-fade__copy') ?? null;
      const copyHeader = copy?.querySelector('app-header header') ?? null;
      const header = document.querySelector('app-header header');
      const content = document.querySelector('main#obsah');
      const focused = document.activeElement;
      window.nfnnFadeFrames.push({
        path: location.pathname,
        copy: opacityOf(copy),
        copyAt: copy?.querySelector('.page-fade__main')?.getBoundingClientRect().top ?? null,
        content: opacityOf(content) ?? 0,
        header:
          header === null
            ? ''
            : `${getComputedStyle(header).opacity} ${header.getBoundingClientRect().top}`,
        copyHeaderShown:
          copyHeader !== null && getComputedStyle(copyHeader).visibility !== 'hidden',
        copyHidden:
          overlay === null ||
          (overlay.hasAttribute('inert') && overlay.getAttribute('aria-hidden') === 'true'),
        ground: groundBehind(overlay),
        headingFocused: focused?.tagName === 'H1' && content?.contains(focused) === true,
        top: window.scrollY,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

function framesOf(page: Page): Promise<FadeFrame[]> {
  return page.evaluate(() => window.nfnnFadeFrames);
}

async function settledOn(page: Page, path: string): Promise<FadeFrame[]> {
  await expect(page).toHaveURL(path);
  await expect
    .poll(async () =>
      (await framesOf(page)).filter(
        (frame) => frame.path === path && frame.copy === null && frame.content === 1,
      ),
    )
    .not.toHaveLength(0);
  await expect(page.locator('.page-fade')).toHaveCount(0);
  return framesOf(page);
}

function expectFadeThrough(frames: FadeFrame[], to: string): void {
  const leaving = frames.filter((frame) => frame.copy !== null);
  expect(leaving.some((frame) => frame.copy! > 0 && frame.copy! < 1)).toBe(true);
  expect(frames.some((frame) => frame.path === to && frame.content > 0 && frame.content < 1)).toBe(
    true,
  );
  expect(
    frames.filter((frame) => frame.copy !== null && frame.copy > 0 && frame.content > 0),
  ).toEqual([]);
  expect(frames.every((frame) => frame.copyHidden && !frame.copyHeaderShown)).toBe(true);
  expect(new Set(frames.map((frame) => frame.header)).size).toBe(1);
  expect(
    leaving.filter((frame) => frame.path === to && frame.copy! < 1 && !frame.headingFocused),
  ).toEqual([]);
}

async function fadeOver(page: Page): Promise<void> {
  await expect(page.locator('.page-fade')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/page-fade-/);
}

async function expectNoFade(page: Page, path: string | RegExp): Promise<void> {
  await expect(page).toHaveURL(path);
  await expect.poll(async () => (await framesOf(page)).length).toBeGreaterThan(20);
  const frames = await framesOf(page);
  expect(frames.filter((frame) => frame.copy !== null || frame.content !== 1)).toEqual([]);
}

function tab(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Hlavní sekce' }).getByRole('link', {
    name,
    exact: true,
  });
}

function section(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Můj účet' }).getByRole('link', { name });
}

test.describe('Given a visitor on a computer that animates', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test.beforeEach(async ({ page }) => {
    await mockPublicContent(page);
    await mockDonorApi(page, donorWithDonations);
  });

  test('when they open Aktuality from the tab bar, then only the content fades out and the new content fades in, never both at once, the header stands still and the heading has the focus from the start', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    await expect(tab(page, 'O nás')).toHaveAttribute('aria-current', 'page');
    await slowAnimations(page);
    await watchFrames(page);

    await tab(page, 'Aktuality').click();

    expectFadeThrough(await settledOn(page, '/aktuality'), '/aktuality');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('when they open Přispět far down O nás, then the page stays where it was until the old content is gone and the new page shows from its top', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    await page.locator('app-donate-band').scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    await slowAnimations(page);
    await watchFrames(page);

    await tab(page, 'Přispět').click();

    const frames = await settledOn(page, '/prispet');
    const left = frames.filter((frame) => frame.copy !== null);
    expect(left.length).toBeGreaterThan(0);
    expect(new Set(left.map((frame) => frame.copyAt)).size).toBe(1);
    expect(left[0].copyAt).toBeLessThan(-300);
    expect(left.filter((frame) => frame.top === 0)).toEqual([]);
    expect(
      frames.filter((frame) => frame.path === '/prispet' && frame.content > 0 && frame.top !== 0),
    ).toEqual([]);
  });

  test('when they click another tab while the content fades, then that tab opens', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    await expect(tab(page, 'O nás')).toHaveAttribute('aria-current', 'page');
    await slowAnimations(page);

    await tab(page, 'Aktuality').click();
    await expect(page.locator('.page-fade')).toHaveCount(1);
    await tab(page, 'Pomáháme').click();

    await expect(page).toHaveURL('/projekty');
    await expect(tab(page, 'Pomáháme')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.page-fade')).toHaveCount(0);
    await expect(page.locator('main#obsah')).toHaveCSS('opacity', '1');
  });

  test('when they step back from an article, then the list shows at once', async ({ page }) => {
    await page.goto('/aktuality');
    await page.getByRole('main').getByRole('link', { name: article.title }).first().click();
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await fadeOver(page);
    await watchFrames(page);

    await stepBack(page);

    await expectNoFade(page, '/aktuality');
  });

  test('when they follow a link to a section of the same page, then the page does not fade', async ({
    page,
  }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await watchFrames(page);

    await page.getByRole('navigation', { name: 'Obsah' }).getByRole('link').first().click();

    await expectNoFade(page, /#spravce$/);
  });

  test('when they ask the system for less motion, then the pages swap at once', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/o-nas');
    await expect(tab(page, 'O nás')).toHaveAttribute('aria-current', 'page');
    await watchFrames(page);

    await tab(page, 'Aktuality').click();

    await expectNoFade(page, '/aktuality');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('when they open their account from a public page, then the content fades through to it', async ({
    page,
  }) => {
    await rememberedDonorSession(page);
    await page.goto('/o-nas');
    await expect(tab(page, 'O nás')).toHaveAttribute('aria-current', 'page');
    await watchFrames(page);

    await openAccountItem(page, 'Můj přehled');

    const frames = await settledOn(page, '/darce/prehled');
    expect(frames.some((frame) => frame.copy !== null)).toBe(true);
    expect(
      frames.filter((frame) => frame.copy !== null && frame.copy > 0 && frame.content > 0),
    ).toEqual([]);
  });
});

test.describe('Given a visitor on a computer that animates, reading the news', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test.beforeEach(async ({ page }) => {
    await mockPublicContent(page);
    await mockDonorApi(page, donorWithDonations);
  });

  test('when they press Zpět on an article opened without a step before it, then the list shows at once, as Zpět never fades', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${article.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
    await watchFrames(page);

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();

    await expectNoFade(page, '/aktuality');
  });

  test('when they go home by the logo from O nás, then the old content keeps its own ground until it is gone', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    await expect(tab(page, 'O nás')).toHaveAttribute('aria-current', 'page');
    const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await slowAnimations(page);
    await watchFrames(page);

    await page
      .getByRole('banner')
      .getByRole('link', { name: 'Nová naděje – nadační fond' })
      .click();

    const covering = (await settledOn(page, '/')).filter(
      (frame) => frame.copy !== null && frame.copy > 0,
    );
    expect(covering.length).toBeGreaterThan(0);
    expect(covering.filter((frame) => frame.ground !== ground)).toEqual([]);
  });
});

test.describe('Given a visitor with an iPad on its side', () => {
  test.use({
    viewport: { width: 1180, height: 820 },
    hasTouch: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await mockPublicContent(page);
    await mockDonorApi(page, donorWithDonations);
  });

  test('when they tap Aktuality, then the content fades through, and a tap while it fades shows the new page at once', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    await expect(tab(page, 'O nás')).toHaveAttribute('aria-current', 'page');
    await slowAnimations(page);

    await tab(page, 'Aktuality').tap();
    await expect(page.locator('.page-fade')).toHaveCount(1);
    await tab(page, 'Aktuality').tap();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.locator('.page-fade')).toHaveCount(0);
    await expect(page.locator('main#obsah')).toHaveCSS('opacity', '1');
  });
});

test.describe('Given a visitor with an iPad upright', () => {
  test.use({
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await mockPublicContent(page);
    await mockDonorApi(page, donorWithDonations);
  });

  test('when they tap Aktuality, then the pages swap without a fade', async ({ page }) => {
    await page.goto('/o-nas');
    await expect(tab(page, 'O nás')).toHaveAttribute('aria-current', 'page');
    await watchFrames(page);

    await tab(page, 'Aktuality').tap();

    await expectNoFade(page, '/aktuality');
  });
});

test.describe('Given a donor in their account on a computer that animates', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, donorWithDonations);
    await rememberedDonorSession(page);
    await page.goto('/darce/prehled');
    await expect(section(page, 'Můj přehled')).toHaveAttribute('aria-current', 'page');
  });

  test('when they open Moje dary from the side navigation, then only the content fades through, the navigation stands still and switches at once', async ({
    page,
  }) => {
    await slowAnimations(page);
    await watchFrames(page);

    await section(page, 'Moje dary').click();

    await expect(section(page, 'Moje dary')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.page-fade')).toHaveCount(1);
    expectFadeThrough(await settledOn(page, '/darce/dary'), '/darce/dary');
  });

  test('when they click another section while the content fades, then that section opens', async ({
    page,
  }) => {
    await slowAnimations(page);

    await section(page, 'Moje dary').click();
    await expect(page.locator('.page-fade')).toHaveCount(1);
    await section(page, 'Potvrzení o daru').click();

    await expect(page).toHaveURL('/darce/potvrzeni');
    await expect(page.locator('.page-fade')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });
});
