import { Locator, Page } from '@playwright/test';
import {
  donorWithDonations,
  mockAdministration,
  rememberedSession,
  serveEmptyAdministrationCopy,
} from './baseline/screen-mocks';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';
import {
  administrator,
  claudeConnection,
  donationItem,
  mockDonorApi,
  openDonorSection,
  rememberedDonorSession,
  session,
  signIn,
  whenAdministrationCopied,
} from './donor-session';

interface Look {
  height: number;
  fontSize: string;
  fontWeight: string;
  background: string;
  border: string;
}

function lookOf(control: Locator): Promise<Look> {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: Math.round(element.getBoundingClientRect().height * 10) / 10,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      background: style.backgroundColor,
      border: style.borderTopColor,
    };
  });
}

async function sizeOf(control: Locator): Promise<Pick<Look, 'height' | 'fontSize'>> {
  const { height, fontSize } = await lookOf(control);
  return { height, fontSize };
}

function gift(id: string, receivedAt: string, amountMinor: number) {
  return donationItem({ id, receivedAt, amountMinor, status: 'RECEIVED', receiptAvailable: true });
}

const twoYears = {
  summary: {
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
    lastReceivedAt: '2026-03-15',
    byYear: [
      { year: 2026, count: 2, totalAmountMinor: 150000 },
      { year: 2025, count: 1, totalAmountMinor: 25000 },
    ],
    yearlyReceiptsAvailableThrough: 2025,
    receiptsAvailableFrom: 2025,
  },
  list: {
    items: [
      gift('0192f0f1-0000-7000-8000-000000000004', '2026-03-15', 50000),
      gift('0192f0f1-0000-7000-8000-000000000003', '2026-01-10', 100000),
      gift('0192f0f1-0000-7000-8000-000000000002', '2025-11-05', 25000),
    ],
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
  },
  receipts: { singleNumber: '2026-000001' },
};

const failedBackups = {
  available: true,
  backups: [],
  lastBackup: null,
  lastTestRestore: null,
  lastRestore: null,
  restoreFiles: [],
  pendingRequests: 0,
  problems: ['BACKUP_MISSING'],
};

function linesOfText(block: Locator): Promise<number> {
  return block.evaluate((element) => {
    const rects: DOMRect[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || node.parentElement?.closest('.visually-hidden')) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...[...range.getClientRects()].filter((rect) => rect.width > 0));
    }
    rects.sort((a, b) => a.top - b.top);
    let lines = 0;
    let lineBottom = -Infinity;
    for (const rect of rects) {
      if (rect.top >= lineBottom) {
        lines += 1;
        lineBottom = rect.bottom;
      } else {
        lineBottom = Math.max(lineBottom, rect.bottom);
      }
    }
    return lines;
  });
}

async function freshInstallWithBackupKey(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/home',
    (route) => route.fulfill({ json: { news: [], projects: [] } }),
  );
  await page.route(
    (url) => url.pathname === '/api/operations/setup',
    (route) => route.fulfill({ json: { required: true, codeRequired: false } }),
  );
  await page.route(
    (url) => url.pathname === '/api/operations/setup/backup-key',
    (route) =>
      route.fulfill({
        json: {
          key: 'AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH',
          checkPositions: [2, 13, 24],
        },
      }),
  );
}

async function openUnlockedAdministration(page: Page, path: string): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await serveEmptyAdministrationCopy(page);
  await rememberedSession(page);
  const copied = whenAdministrationCopied(page);
  await page.goto(path);
  await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
  await copied();
}

async function rememberedAdministrator(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given a donor who has given in two years', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, twoYears);
  });

  test('when they look over the overview and Moje dary, then every small button has one height and one text size', async ({
    page,
  }) => {
    await signIn(page);
    const main = page.getByRole('main');
    const check = main.getByRole('button', { name: 'Zkontrolovat nové platby' });
    await expect(check).toBeVisible();
    const small = await sizeOf(check);

    expect(await sizeOf(main.getByRole('link', { name: 'Všechny dary' }))).toEqual(small);
    expect(await sizeOf(main.getByRole('button', { name: 'Kopírovat číslo účtu' }))).toEqual(small);

    await openDonorSection(page, 'Moje dary');
    const download = main.getByRole('button', { name: /^Stáhnout PDF\b/ }).first();
    await expect(download).toBeVisible();
    expect(await sizeOf(download)).toEqual(small);
  });

  test('when they find the yearly receipt in the overview, Moje dary and Potvrzení o daru, then its button has one height', async ({
    page,
  }) => {
    await signIn(page);
    const main = page.getByRole('main');
    const yearly = main.getByRole('button', { name: 'Stáhnout potvrzení za rok 2025 (PDF)' });
    await expect(yearly).toBeVisible();
    const inOverview = await sizeOf(yearly);

    await openDonorSection(page, 'Moje dary');
    await expect(yearly).toBeVisible();
    expect(await sizeOf(yearly)).toEqual(inOverview);

    await openDonorSection(page, 'Potvrzení o daru');
    await expect(yearly).toBeVisible();
    expect(await sizeOf(yearly)).toEqual(inOverview);
  });
});

test.describe('Given a donor whose gift of 10. 1. 2026 was paired by their account without a symbol', () => {
  for (const [section, path] of [
    ['Moje dary', '/darce/dary'],
    ['Potvrzení o daru', '/darce/potvrzeni'],
  ]) {
    test(`when they open ${section} at 1280 px, then the pairing label stays on the line of the gift's purpose beside the PDF button on one line`, async ({
      page,
    }) => {
      await mockDonorApi(page, donorWithDonations);
      await rememberedDonorSession(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);

      const row = page
        .getByRole('main')
        .getByRole('row')
        .filter({ hasText: 'Přiřazeno podle účtu 2900233333/2010' });
      const purpose = row.locator('.purpose');
      const download = row.getByRole('button', { name: /^Stáhnout PDF\b/ });
      await expect(purpose).toContainText('bez symbolu · účet');
      await expect(download).toBeVisible();

      expect(await linesOfText(purpose)).toBe(1);
      expect(await linesOfText(download)).toBe(1);
    });
  }
});

test.describe('Given an administrator with Claude connected', () => {
  test('when they open Údaje a zabezpečení, then the dates of the devices and the connected app share one size and weight, and the state line of the device data keeps the size of a card intro at the same weight', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donors/me/connections',
      (route) => route.fulfill({ json: { items: [claudeConnection] } }),
    );
    await signIn(page, administrator);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const deviceDates = page.locator('.device-meta').first();
    const connectionDates = page.locator('.connection-dates');
    const storedData = page.locator('.device-data-state');
    await expect(deviceDates).toContainText('naposledy použito');
    await expect(connectionDates).toContainText('23. 10. 2026');
    await expect(storedData).toContainText('aktualizováno');

    const { fontSize, fontWeight } = await lookOf(deviceDates);
    expect(await lookOf(connectionDates)).toMatchObject({ fontSize, fontWeight });
    expect((await lookOf(storedData)).fontWeight).toBe(fontWeight);
  });

  test('when the overview of the administration lists a failed check beside the message for the technician, then Zkusit znovu and Kopírovat look the same', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/admin/donors/administrators',
      (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/backups',
      (route) => route.fulfill({ json: failedBackups }),
    );
    await rememberedAdministrator(page);
    await page.goto('/sprava');

    const attention = page.getByRole('region', { name: 'Co potřebuje vaši pozornost' });
    const retry = attention.getByRole('button', { name: 'Zkusit znovu' }).first();
    const copy = attention.getByRole('button', { name: 'Kopírovat zprávu pro technika' });
    await expect(retry).toBeVisible();
    await expect(copy).toBeVisible();

    expect(await lookOf(retry)).toEqual(await lookOf(copy));
  });
});

test.describe('Given an administrator on a computer', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  for (const { place, path, primary, secondary } of [
    {
      place: 'Zálohy',
      path: '/sprava/zalohy',
      primary: 'Zálohovat teď',
      secondary: 'Spustit zkušební obnovu',
    },
    {
      place: 'a new article',
      path: '/sprava/aktuality/nova',
      primary: 'Uložit a zveřejnit',
      secondary: 'Uložit koncept',
    },
  ]) {
    test(`when they open ${place}, then ${primary} and ${secondary} beside it have one height`, async ({
      page,
    }) => {
      await openUnlockedAdministration(page, path);
      const main = page.getByRole('main');
      const first = main.getByRole('button', { name: primary });
      const second = main.getByRole('button', { name: secondary });
      await expect(first).toBeVisible();
      await expect(second).toBeVisible();

      expect((await lookOf(first)).height).toBe((await lookOf(second)).height);
    });
  }
});

test.describe('Given a freshly installed site showing the backup key in the first setup', () => {
  test('when the words of the key are shown, then Kopírovat looks the same as Stáhnout jako soubor beside it', async ({
    page,
  }) => {
    await freshInstallWithBackupKey(page);
    await page.goto('/prvni-nastaveni');

    const copy = page.getByRole('button', { name: 'Kopírovat slova klíče k zálohám' });
    const download = page.getByRole('button', { name: 'Stáhnout jako soubor' });
    await expect(copy).toBeVisible();
    await expect(download).toBeVisible();

    expect(await lookOf(copy)).toEqual(await lookOf(download));
  });
});

test.describe('Given a visitor on Aktuality', () => {
  test('when the news fail to load and then turn out empty, then the link of the empty notice is as tall as the retry button of the failed one', async ({
    page,
  }) => {
    await mockDonorApi(page);
    let failing = true;
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) =>
        failing
          ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
          : route.fulfill({ json: { items: [], page: 0, size: 10, total: 0, hasMore: false } }),
    );
    await page.goto('/aktuality');
    const retry = page.getByRole('button', { name: 'Zkusit znovu' });
    await expect(retry).toBeVisible();
    const failed = await sizeOf(retry);

    failing = false;
    await retry.click();

    const home = page.getByRole('link', { name: 'Zpět na úvodní stránku' });
    await expect(home).toBeVisible();
    expect(await sizeOf(home)).toEqual(failed);
  });
});
