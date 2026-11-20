import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  administrator,
  claudeConnection,
  donationItem,
  mockDonorApi,
  openDonorSection,
  session,
  signIn,
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

test.describe('Given an administrator with Claude connected', () => {
  test('when they open Údaje a zabezpečení, then the dates of the devices, the connected app and the device data share one size and weight', async ({
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
    for (const dates of [connectionDates, storedData]) {
      expect(await lookOf(dates)).toMatchObject({ fontSize, fontWeight });
    }
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
