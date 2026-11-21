import type { Locator, Page } from '@playwright/test';

import {
  article,
  donorWithDonations,
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

function failure(page: Page, text: string): Locator {
  return page.getByRole('alert').filter({ hasText: text });
}

test.describe('Given a donor on a computer whose portal data fail to load', () => {
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
    answer();
    await expect(failure(page, 'Přehled darů se nepodařilo načíst.')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeFocused();
  });
});

test.describe('Given a visitor on a computer whose news fail to load', () => {
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
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when Zálohy, Aktuality and Platby load slowly, then each loads as its card titles over skeleton rows, never as a plain sentence', async ({
    page,
  }) => {
    const never = new Promise<void>(() => undefined);
    for (const path of [BACKUPS, '/api/admin/content/news', '/api/admin/donations/payments']) {
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
});

test.describe('Given a visitor on a computer when a floating notice comes', () => {
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
