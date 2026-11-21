import type { Locator, Page } from '@playwright/test';

import {
  article,
  donorWithDonations,
  mockAdministration,
  mockPublicContent,
  rememberedSession,
} from './baseline/screen-mocks';
import {
  mockDonorApi,
  noDonations,
  openSignInDialog,
  problem,
  rememberedDonorSession,
} from './donor-session';
import { expect, test } from './fixtures';
import {
  chunkLoadNotice,
  openAboutThenLoseNewChunks,
  openPolicyFromContact,
  withoutSessionStorage,
} from './lost-chunks';

const MS_PER_SECOND = 1000;
const APP_CLOCK_TICK_MS = 1;

interface LoadingSeen {
  skeleton: number | null;
  failure: number | null;
  appears: boolean;
  longestFrame: number;
}

const SERVER_ERROR = problem(500, 'server-error', 'Chyba serveru', 'Zkuste to prosím znovu.');
const BACKUPS = '/api/admin/operations/backups';
const PAYMENTS = '/api/admin/donations/payments';
const LARGEST_SYSTEM_TEXT_PX = 53;
const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const COMPUTER_ONLY =
  'the computer layout runs in the chromium project; the iphone project runs the phone journey of the article in this file';
const PHONE_WIDTH_IN_CHROMIUM =
  'the largest text at phone width is measured in the chromium project; the iphone project runs the phone journey of the article in this file';

interface BlockEdge {
  readonly style: string;
  readonly width: number;
  readonly edge: string;
  readonly ground: string;
}

async function blockEdge(alert: Locator): Promise<BlockEdge> {
  return alert.evaluate((element, transparent) => {
    const block = element.closest('.ui-notice--action') ?? element;
    let ground = getComputedStyle(document.documentElement).backgroundColor;
    for (let at = block.parentElement; at !== null; at = at.parentElement) {
      const fill = getComputedStyle(at).backgroundColor;
      if (fill !== transparent) {
        ground = fill;
        break;
      }
    }
    const style = getComputedStyle(block);
    return {
      style: style.borderTopStyle,
      width: Number.parseFloat(style.borderTopWidth),
      edge: style.borderTopColor,
      ground,
    };
  }, TRANSPARENT);
}

async function rememberAlert(alert: Locator): Promise<void> {
  await alert.evaluate((element) => {
    (window as unknown as { rememberedAlert: Element }).rememberedAlert = element;
  });
}

async function isRememberedAlert(alert: Locator): Promise<boolean> {
  return alert.evaluate(
    (element) => element === (window as unknown as { rememberedAlert: Element }).rememberedAlert,
  );
}

async function showLargestSystemText(page: Page): Promise<void> {
  await page.addInitScript((px) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `html { font-size: ${px}px; }`;
      document.head.append(style);
    });
  }, LARGEST_SYSTEM_TEXT_PX);
}

interface FailureBlock {
  readonly textInset: number;
  readonly buttonHeight: number;
  readonly buttonInset: number;
  readonly buttonInside: boolean;
}

async function failureBlock(alert: Locator): Promise<FailureBlock> {
  return alert.evaluate((element) => {
    const frame = element.closest('.ui-notice--action') ?? element;
    const button =
      frame.querySelector('button') ?? element.parentElement?.querySelector('button') ?? null;
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getClientRects()[0];
    const box = frame.getBoundingClientRect();
    const pressed = button?.getBoundingClientRect() ?? new DOMRect();
    return {
      textInset: Math.round(text.left - box.left),
      buttonHeight: Math.round(pressed.height),
      buttonInset: Math.round(box.right - pressed.right),
      buttonInside:
        pressed.left >= box.left &&
        pressed.right <= box.right + 0.5 &&
        pressed.top >= box.top &&
        pressed.bottom <= box.bottom + 0.5,
    };
  });
}

async function linesStartAt(text: Locator, edgeSelector: string): Promise<number[]> {
  const starts = await text.evaluate((element, selector) => {
    const edge = document.querySelector(selector)?.getBoundingClientRect().left ?? Number.NaN;
    const range = document.createRange();
    range.selectNodeContents(element);
    const lines = new Map<number, number>();
    for (const box of range.getClientRects()) {
      const line = Math.round(box.top + box.height / 2);
      lines.set(line, Math.min(lines.get(line) ?? box.left, box.left));
    }
    return [...lines.values()].map((start) => start - edge);
  }, edgeSelector);
  return starts.map((start) => (Math.abs(start) <= 2 ? 0 : Math.round(start)));
}

async function pressLeavesFocusOnPageAsIos(retry: Locator): Promise<void> {
  await retry.evaluate((button) => {
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      document.getElementById('obsah')?.focus({ preventScroll: true });
    });
    document.addEventListener(
      'click',
      () => {
        (window as unknown as { focusAtPress: string | null }).focusAtPress =
          document.activeElement?.id ?? null;
      },
      { capture: true },
    );
  });
}

async function pressUnavailable(page: Page, control: Locator): Promise<void> {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function focusAtPress(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown as { focusAtPress: string | null }).focusAtPress);
}

async function scrollTop(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

function failure(page: Page, text: string): Locator {
  return page.getByRole('alert').filter({ hasText: text });
}

test.describe('Given a donor on a computer whose portal data fail to load', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', COMPUTER_ONLY);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockDonorApi(page, donorWithDonations);
    await rememberedDonorSession(page);
  });

  test('when the overview, the accounts and the passkeys fail, then each failure is the same block with „Zkusit znovu“ inside it', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/donations/me/summary',
      (route) => route.fulfill(SERVER_ERROR),
    );
    await page.goto('/darce/prehled');
    const overview = await failureBlock(failure(page, 'Přehled darů se nepodařilo načíst.'));

    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-accounts',
      (route) => route.fulfill(SERVER_ERROR),
    );
    await page.goto('/darce/ucty');
    const accounts = await failureBlock(failure(page, 'Bankovní účty se nepodařilo načíst.'));

    await page.route(
      (url) => url.pathname === '/api/donors/me/passkeys',
      (route) => route.fulfill(SERVER_ERROR),
    );
    await page.goto('/darce/udaje');
    await page.getByRole('button', { name: 'Spravovat přístupové klíče' }).click();
    const passkeys = await failureBlock(failure(page, 'Zkuste to prosím znovu.'));

    expect(overview.buttonInside).toBe(true);
    expect(overview.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(accounts).toEqual(overview);
    expect(passkeys).toEqual(overview);
  });

  test('when the passkeys fail to load, then the Přístupové klíče row says so instead of loading for good', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/donors/me/passkeys',
      (route) => route.fulfill(SERVER_ERROR),
    );
    await page.goto('/darce/udaje');

    const row = page.locator('.account-row').filter({ hasText: 'Přístupové klíče' });
    await expect(row.locator('.account-value')).toHaveText('Nepodařilo se načíst');
  });

  test('when they press „Zkusit znovu“, then the failure stays with the focus on its busy button until the overview shows, and the focus then moves to the page heading', async ({
    page,
  }) => {
    let retried = false;
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route(
      (url) => url.pathname === '/api/donations/me/summary',
      async (route) => {
        if (!retried) {
          await route.fulfill(SERVER_ERROR);
          return;
        }
        await answered;
        await route.fallback();
      },
    );
    await page.goto('/darce/prehled');
    const retry = page.getByRole('button', { name: 'Zkusit znovu' });
    await expect(retry).toBeVisible();

    retried = true;
    await retry.click();

    await expect(page.locator('.dashboard-error button')).toBeFocused();
    await expect(page.locator('.dashboard-error button')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.dashboard-error button')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.dashboard-error [role="status"]')).toHaveText('Načítáme…');
    answer();
    await expect(failure(page, 'Přehled darů se nepodařilo načíst.')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeFocused();
  });

  test('when „Zkusit znovu“ fails once more, then a new alert says what failed and the same button keeps the focus', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/donations/me/summary',
      (route) => route.fulfill(SERVER_ERROR),
    );
    await page.goto('/darce/prehled');
    const alert = failure(page, 'Přehled darů se nepodařilo načíst.');
    await expect(alert).toBeVisible();
    await rememberAlert(alert);
    const retry = page.locator('.dashboard-error button');

    await retry.click();
    await expect(retry).toHaveAttribute('aria-busy', 'true');

    await expect(retry).not.toHaveAttribute('aria-busy', 'true');
    await expect(alert).toBeVisible();
    expect(await isRememberedAlert(alert)).toBe(false);
    await expect(retry).toBeFocused();
  });

  for (const appearance of [
    { name: 'the dark appearance', media: { colorScheme: 'dark' as const } },
    { name: 'forced colours', media: { forcedColors: 'active' as const } },
  ]) {
    test(`when the overview fails in ${appearance.name}, then the failure block keeps a visible edge against the page`, async ({
      page,
    }) => {
      await page.route(
        (url) => url.pathname === '/api/donations/me/summary',
        (route) => route.fulfill(SERVER_ERROR),
      );
      await page.goto('/darce/prehled');
      const alert = failure(page, 'Přehled darů se nepodařilo načíst.');
      await expect(alert).toBeVisible();

      await page.emulateMedia(appearance.media);

      await expect
        .poll(async () => {
          const edge = await blockEdge(alert);
          return (
            edge.style === 'solid' &&
            edge.width >= 1 &&
            edge.edge !== TRANSPARENT &&
            edge.edge !== edge.ground
          );
        })
        .toBe(true);
    });
  }
});

test.describe('Given a visitor on a computer whose news fail to load', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', COMPUTER_ONLY);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockPublicContent(page);
  });

  test('when the list and an article fail, then both show the same block with „Zkusit znovu“ on its right, and the article keeps a heading', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) => route.fulfill(SERVER_ERROR),
    );
    await page.route(
      (url) => url.pathname === `/api/content/news/${article.slug}`,
      (route) => route.fulfill(SERVER_ERROR),
    );

    await page.goto('/aktuality');
    const list = await failureBlock(failure(page, 'Aktuality se nepodařilo načíst.'));
    await page.goto(`/aktuality/${article.slug}`);
    const detail = await failureBlock(failure(page, 'Aktualitu se nepodařilo načíst.'));

    expect(list.buttonInside).toBe(true);
    expect(list.buttonInset).toBe(list.textInset);
    expect(detail).toEqual(list);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Aktualita se nenačetla' }),
    ).toBeVisible();
  });
});

test.describe('Given an administrator on a computer whose pages load slowly', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', COMPUTER_ONLY);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when Zálohy, Aktuality and Platby load slowly, then each loads as its card titles over skeleton rows, never as a plain sentence', async ({
    page,
  }) => {
    const never = new Promise<void>(() => undefined);
    for (const path of [BACKUPS, '/api/admin/content/news', PAYMENTS]) {
      await page.route(
        (url) => url.pathname === path,
        async () => {
          await never;
        },
      );
    }

    await page.goto('/sprava/zalohy');
    await expect(page.locator('app-skeleton .ui-card__title')).toHaveText([
      'Stav záloh',
      'Zálohy na serveru',
      'Klíč k zálohám',
      'Plán záloh',
    ]);

    await page.goto('/sprava/aktuality');
    await expect(page.locator('app-skeleton .ui-card__title')).toHaveText(['Všechny aktuality']);

    await page.goto('/sprava/platby');
    const payments = page.locator('section.payments-card');
    await expect(payments.locator('app-skeleton .ui-skeleton__line').first()).toBeVisible();
    await expect(payments.getByText('Načítáme platby…')).toHaveClass(/visually-hidden/);
  });

  test('when Zálohy fail after their skeleton showed, then the skeleton stands its minimum, the failure appears, and „Zkusit znovu“ keeps the focus until the status shows and then gives it to the heading', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const seen: LoadingSeen = { skeleton: null, failure: null, appears: false, longestFrame: 0 };
      (window as unknown as { loadingSeen: LoadingSeen }).loadingSeen = seen;
      const changes = new MutationObserver(() => {
        const now = performance.now();
        if (seen.skeleton === null && document.querySelector('app-skeleton') !== null) {
          seen.skeleton = now;
        }
        const shown = [...document.querySelectorAll('[role="alert"]')].find((alert) =>
          alert.textContent?.includes('Stav záloh se nepodařilo'),
        );
        if (seen.skeleton !== null && seen.failure === null && shown !== undefined) {
          seen.failure = now;
          seen.appears = shown.closest('.ui-skeleton-reveal') !== null;
          changes.disconnect();
        }
      });
      changes.observe(document, { childList: true, subtree: true, characterData: true });
      let previous: number | null = null;
      const frame = (time: number) => {
        if (previous !== null && seen.skeleton !== null) {
          seen.longestFrame = Math.max(seen.longestFrame, time - previous);
        }
        previous = time;
        if (seen.failure === null) {
          requestAnimationFrame(frame);
        }
      };
      requestAnimationFrame(frame);
    });
    let retried = false;
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route(
      (url) => url.pathname === BACKUPS,
      async (route) => {
        if (!retried) {
          await new Promise((wait) => setTimeout(wait, 450));
          await route.fulfill(SERVER_ERROR);
          return;
        }
        await answered;
        await route.fulfill({ json: backupsServed });
      },
    );

    await page.goto('/sprava/zalohy');
    await expect(failure(page, 'Stav záloh se nepodařilo načíst.')).toBeVisible();

    const seen = await page.evaluate(
      () => (window as unknown as { loadingSeen: LoadingSeen }).loadingSeen,
    );
    const minimumMs = await page.evaluate((msPerSecond) => {
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue('--duration-loading-min')
        .trim();
      const value = Number.parseFloat(token);
      return token.endsWith('ms') ? value : value * msPerSecond;
    }, MS_PER_SECOND);
    const renderLag = seen.longestFrame;
    expect(seen.skeleton).not.toBeNull();
    expect(seen.failure).not.toBeNull();
    expect(seen.failure! - seen.skeleton!).toBeGreaterThanOrEqual(
      minimumMs - renderLag - APP_CLOCK_TICK_MS,
    );
    expect(seen.appears).toBe(true);

    const retry = page.getByRole('button', { name: 'Zkusit znovu' });
    retried = true;
    await retry.click();
    await expect(page.locator('app-load-failure button')).toBeFocused();
    answer();
    await expect(page.getByText('Zálohování je v pořádku.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Zálohy' })).toBeFocused();
  });

  test('when Aktuality arrive after their skeleton showed, then the card title stays still and only what is under it fades in', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const seen: { title: number | null; under: number | null } = { title: null, under: null };
      (window as unknown as { revealSeen: typeof seen }).revealSeen = seen;
      const changes = new MutationObserver(() => {
        const title = document.getElementById('news-list-title');
        if (title === null) {
          return;
        }
        seen.title = title.getAnimations().length;
        seen.under = title.nextElementSibling?.getAnimations().length ?? 0;
        changes.disconnect();
      });
      changes.observe(document, { childList: true, subtree: true });
    });
    await mockAdministration(page);
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route(
      (url) => url.pathname === '/api/admin/content/news',
      async (route) => {
        await answered;
        await route.fallback();
      },
    );

    await page.goto('/sprava/aktuality');
    await expect(page.locator('app-skeleton .ui-card__title')).toHaveText(['Všechny aktuality']);
    answer();
    await expect(page.locator('#news-list-title')).toBeVisible();

    const seen = await page.evaluate(
      () => (window as unknown as { revealSeen: { title: number; under: number } }).revealSeen,
    );
    expect(seen).toEqual({ title: 0, under: 1 });
  });
});

test.describe('Given an administrator at phone width with the largest text whose payments fail to load', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', PHONE_WIDTH_IN_CHROMIUM);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await showLargestSystemText(page);
    await mockDonorApi(page);
    await rememberedSession(page);
    await page.route(
      (url) => url.pathname === PAYMENTS,
      (route) => route.fulfill(SERVER_ERROR),
    );
  });

  test('when Platby show their failure, then only the sentence is the alert and „Zkusit znovu“ fits inside the block', async ({
    page,
  }) => {
    await page.goto('/sprava/platby');
    const alert = failure(page, 'Platby se nepodařilo načíst.');
    await expect(alert).toBeVisible();

    await expect(alert).toHaveText('Platby se nepodařilo načíst.');
    expect((await failureBlock(alert)).buttonInside).toBe(true);
  });

  test('when they press „Zkusit znovu“ and it fails again, then the button is busy and keeps the focus, and a new alert says what failed', async ({
    page,
  }) => {
    await page.goto('/sprava/platby');
    const alert = failure(page, 'Platby se nepodařilo načíst.');
    await expect(alert).toBeVisible();
    await rememberAlert(alert);
    const retry = page.locator('app-load-failure button');

    await retry.click();
    await expect(retry).toHaveAttribute('aria-busy', 'true');
    await expect(retry).toBeFocused();

    await expect(retry).not.toHaveAttribute('aria-busy', 'true');
    await expect(alert).toBeVisible();
    expect(await isRememberedAlert(alert)).toBe(false);
    await expect(retry).toBeFocused();
  });

  test('when the press leaves the focus on the page as iOS does, then „Zkusit znovu“ takes it back while busy and the page does not move', async ({
    page,
  }) => {
    await page.goto('/sprava/platby');
    await expect(failure(page, 'Platby se nepodařilo načíst.')).toBeVisible();
    const retry = page.locator('app-load-failure button');
    await retry.scrollIntoViewIfNeeded();
    const before = await scrollTop(page);
    await pressLeavesFocusOnPageAsIos(retry);

    await retry.click();

    await expect(retry).toHaveAttribute('aria-busy', 'true');
    await expect(retry).toBeFocused();
    expect(await focusAtPress(page)).toBe('obsah');
    expect(await scrollTop(page)).toBe(before);
    await expect(retry).not.toHaveAttribute('aria-busy', 'true');
    await expect(retry).toBeFocused();
    await expect.poll(() => scrollTop(page)).toBe(before);
  });
});

test.describe('Given a visitor on a phone whose article fails to load', () => {
  test('when „Zkusit znovu“ fails once more and then loads the article, then each failure is a new alert, the button is busy each time and the article heading then takes the focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPublicContent(page);
    let loads = false;
    await page.route(
      (url) => url.pathname === `/api/content/news/${article.slug}`,
      async (route) => {
        if (!loads) {
          await route.fulfill(SERVER_ERROR);
          return;
        }
        await route.fallback();
      },
    );
    await page.goto(`/aktuality/${article.slug}`);
    const alert = failure(page, 'Aktualitu se nepodařilo načíst.');
    await expect(alert).toBeVisible();
    await rememberAlert(alert);
    const retry = page.locator('app-load-failure button');

    await retry.click();
    await expect(retry).toHaveAttribute('aria-busy', 'true');
    await expect(retry).not.toHaveAttribute('aria-busy', 'true');
    await expect(alert).toBeVisible();
    expect(await isRememberedAlert(alert)).toBe(false);

    loads = true;
    await retry.click();

    await expect(failure(page, 'Aktualitu se nepodařilo načíst.')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeFocused();
  });

  test('when the press leaves the focus on the page as iOS does, then „Zkusit znovu“ takes it back while busy, the page does not move and the article heading then takes the focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPublicContent(page);
    let loads = false;
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route(
      (url) => url.pathname === `/api/content/news/${article.slug}`,
      async (route) => {
        if (!loads) {
          await route.fulfill(SERVER_ERROR);
          return;
        }
        await answered;
        await route.fallback();
      },
    );
    await page.goto(`/aktuality/${article.slug}`);
    await expect(failure(page, 'Aktualitu se nepodařilo načíst.')).toBeVisible();
    const retry = page.locator('app-load-failure button');
    await retry.scrollIntoViewIfNeeded();
    const before = await scrollTop(page);
    await pressLeavesFocusOnPageAsIos(retry);

    loads = true;
    await retry.click();

    await expect(retry).toHaveAttribute('aria-busy', 'true');
    await expect(retry).toBeFocused();
    expect(await focusAtPress(page)).toBe('obsah');
    expect(await scrollTop(page)).toBe(before);
    answer();
    await expect(failure(page, 'Aktualitu se nepodařilo načíst.')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeFocused();
  });

  test('when a second press while „Načítáme…“ leaves the focus on the page as iOS does, then „Zkusit znovu“ takes it back, the page does not move and the article heading then takes the focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPublicContent(page);
    let loads = false;
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route(
      (url) => url.pathname === `/api/content/news/${article.slug}`,
      async (route) => {
        if (!loads) {
          await route.fulfill(SERVER_ERROR);
          return;
        }
        await answered;
        await route.fallback();
      },
    );
    await page.goto(`/aktuality/${article.slug}`);
    await expect(failure(page, 'Aktualitu se nepodařilo načíst.')).toBeVisible();
    const retry = page.locator('app-load-failure button');
    await retry.scrollIntoViewIfNeeded();
    const before = await scrollTop(page);
    await pressLeavesFocusOnPageAsIos(retry);
    loads = true;
    await retry.click();
    await expect(retry).toHaveAttribute('aria-busy', 'true');

    await pressUnavailable(page, retry);

    expect(await focusAtPress(page)).toBe('obsah');
    await expect(retry).toHaveAttribute('aria-busy', 'true');
    await expect(retry).toBeFocused();
    expect(await scrollTop(page)).toBe(before);
    answer();
    await expect(failure(page, 'Aktualitu se nepodařilo načíst.')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeFocused();
  });

  test('when a press offline leaves the focus on the page as iOS does, then „Zkusit znovu“ takes it back and the page does not move', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPublicContent(page);
    await page.route(
      (url) => url.pathname === `/api/content/news/${article.slug}`,
      (route) => route.fulfill(SERVER_ERROR),
    );
    await page.goto(`/aktuality/${article.slug}`);
    await expect(failure(page, 'Aktualitu se nepodařilo načíst.')).toBeVisible();
    const retry = page.locator('app-load-failure button');
    await retry.scrollIntoViewIfNeeded();
    const before = await scrollTop(page);
    await pressLeavesFocusOnPageAsIos(retry);
    await context.setOffline(true);
    await expect(retry).toHaveAttribute('aria-disabled', 'true');

    await pressUnavailable(page, retry);

    expect(await focusAtPress(page)).toBe('obsah');
    await expect(retry).toBeFocused();
    await expect(retry).not.toHaveAttribute('aria-busy', 'true');
    expect(await scrollTop(page)).toBe(before);
  });
});

test.describe('Given a visitor on a computer when a floating notice comes', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', COMPUTER_ONLY);

  test('when the app offers to load a missing page again, then the notice keeps a reading width in the middle instead of the whole window', async ({
    page,
  }) => {
    await withoutSessionStorage(page);
    await openAboutThenLoseNewChunks(page);

    await openPolicyFromContact(page);
    await expect(chunkLoadNotice(page)).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    const box = await chunkLoadNotice(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThan(1280 * 0.6);
    const main = (await page.locator('main').first().boundingBox())!;
    const middle = main.x + main.width / 2;
    expect(Math.abs(box!.x + box!.width / 2 - middle)).toBeLessThanOrEqual(1);
  });
});

test.describe('Given a donor on a computer in a card that mixes text and actions', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', COMPUTER_ONLY);

  test('when they have no gift yet, then the message, the button and the help start at one edge', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockDonorApi(page, noDonations);
    await rememberedDonorSession(page);
    await page.goto('/darce/dary');

    const empty = page.locator('.payments-empty-state');
    const message = empty.locator('.payments-empty');
    await expect(message).toBeVisible();
    const send = (await empty.getByRole('link', { name: 'Poslat dar' }).boundingBox())!;
    const help = (await empty.locator('app-missing-gift').boundingBox())!;

    expect(await linesStartAt(message, '.payments-empty-state app-missing-gift')).toEqual([0]);
    expect(Math.round(send.x - help.x)).toBe(0);
  });

  test('when they open the sign-in and the registration, then the lead and the consent start where the fields start', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockDonorApi(page);
    await openSignInDialog(page);
    const dialog = page.getByRole('dialog');

    const lead = dialog.locator('.sub').first();
    expect(await linesStartAt(lead, 'dialog form')).toEqual([0]);

    await dialog.getByRole('button', { name: 'Registrace', exact: true }).click();
    const consent = dialog.locator('.consent');
    await expect(consent).toBeVisible();
    const starts = await linesStartAt(consent, 'dialog .register-lead');
    expect(starts.every((start) => start === 0)).toBe(true);
  });
});

const backupsServed = {
  available: true,
  backups: [],
  lastBackup: {
    outcome: 'OK',
    startedAt: '2026-10-23T01:00:00Z',
    finishedAt: '2026-10-23T01:00:03Z',
    fileName: 'nfnn-2026-10-23_0300.dump.age',
    sizeBytes: 1590,
    tables: null,
    requestId: null,
    error: null,
  },
  lastTestRestore: null,
  lastRestore: null,
  restoreFiles: [],
  pendingRequests: 0,
  restorePending: false,
  problems: [],
  schedule: {
    backupTime: '03:00',
    testRestoreDay: 7,
    testRestoreTime: '04:00',
    applied: { backupTime: '03:00', testRestoreDay: 7, testRestoreTime: '04:00' },
  },
  key: { available: true, confirmed: true, confirmedAt: '2026-10-23T08:00:00Z' },
};
