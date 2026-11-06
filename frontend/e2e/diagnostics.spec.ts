import { readFile } from 'node:fs/promises';
import type { Download, Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { donor, mockDonorApi, openAccountItem, openSignInDialog, session } from './donor-session';

const FILE_NAME = /^nfnn-diagnostika-\d{4}-\d{2}-\d{2}-\d{4}\.json$/;
const MAIN_SCRIPT = /\/main-[A-Za-z0-9_-]{8}\.js$/;
const BOOT_TIMEOUT_MS = 15_000;
const PERSONAL = [donor.name, donor.email, donor.variableSymbol, donor.id, 'Dlouhá', 'token-1'];

async function savedFile(download: Download): Promise<{ name: string; text: string }> {
  return {
    name: download.suggestedFilename(),
    text: await readFile(await download.path(), 'utf8'),
  };
}

interface SharedFile {
  readonly name: string;
  readonly type: string;
  readonly text: string;
}

function sharesFiles(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'iphone';
}

async function shareSheetOfAnIphone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shared: unknown[] = [];
    Object.assign(window, { nfnnSharedFiles: shared });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data: ShareData) => (data.files?.length ?? 0) > 0,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        for (const file of data.files ?? []) {
          shared.push({ name: file.name, type: file.type, text: await file.text() });
        }
      },
    });
  });
}

async function sharedFiles(page: Page): Promise<SharedFile[]> {
  return page.evaluate(
    () => (window as unknown as { nfnnSharedFiles: SharedFile[] }).nfnnSharedFiles,
  );
}

async function delivered(
  page: Page,
  scope: Locator,
  testInfo: TestInfo,
  { secondTap }: { secondTap: boolean },
): Promise<{ name: string; text: string }> {
  const press = scope.getByRole('button', { name: 'Stáhnout diagnostický soubor' });
  if (!sharesFiles(testInfo)) {
    const download = page.waitForEvent('download');
    await press.click();
    return savedFile(await download);
  }
  await press.click();
  if (secondTap) {
    await scope.getByRole('button', { name: 'Sdílet diagnostický soubor' }).click();
  }
  await expect.poll(async () => (await sharedFiles(page)).length).toBe(1);
  const [file] = await sharedFiles(page);
  expect(file.type).toBe('application/json');
  return file;
}

test.beforeEach(async ({ page }, testInfo) => {
  if (sharesFiles(testInfo)) {
    await shareSheetOfAnIphone(page);
  }
});

const TOUCHED_BY_EVERY_PRESS = 'nfnn.public-activity';

async function browserStores(page: Page): Promise<unknown> {
  return page.evaluate(
    async (touched) => ({
      local: Object.entries(localStorage).sort(),
      tab: Object.entries(sessionStorage)
        .filter(([key]) => key !== touched)
        .sort(),
      cookie: document.cookie,
      databases: (await indexedDB.databases()).map((database) => database.name).sort(),
    }),
    TOUCHED_BY_EVERY_PRESS,
  );
}

async function answerSignIn(page: Page, kind: 'BROWSER' | 'PUBLIC'): Promise<void> {
  await page.route('**/api/donors/auth/login', async (route) => {
    const answer = session(200);
    await route.fulfill({
      ...answer,
      body: JSON.stringify({ ...JSON.parse(answer.body), session: kind }),
    });
  });
}

function expectNoPersonalData(text: string): void {
  for (const value of PERSONAL) {
    expect(text).not.toContain(value);
  }
}

test.describe('Given a signed-in donor on Údaje a zabezpečení', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await answerSignIn(page, 'BROWSER');
    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await openAccountItem(page, 'Údaje a zabezpečení');
  });

  test('when they download the diagnostic file, then a JSON file of closed values is saved, or shared on an iPhone, and nothing is sent', async ({
    page,
  }, testInfo) => {
    const card = page.locator('section', {
      has: page.getByRole('heading', { name: 'Když web nefunguje' }),
    });
    const sent: string[] = [];
    page.on('request', (request) => sent.push(new URL(request.url()).pathname));

    const { name, text } = await delivered(page, card, testInfo, { secondTap: true });

    expect(name).toMatch(FILE_NAME);
    const file = JSON.parse(text);
    expect(file).toMatchObject({
      format: 'nfnn-diagnostics',
      version: 1,
      source: 'account-page',
      page: '/darce/udaje',
      app: { started: true, codeArrived: true },
      platform: { browser: expect.any(String), os: expect.any(String) },
      session: { account: 'donor', kind: 'BROWSER', administrationUnlocked: null },
    });
    expectNoPersonalData(text);
    expect(sent.filter((path) => path.startsWith('/api/'))).toEqual([]);
  });
});

test.describe('Given a donor signed in on someone else’s computer', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await answerSignIn(page, 'PUBLIC');
    await openSignInDialog(page);
    await page.getByRole('button', { name: 'Cizí počítač?' }).click();
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await openAccountItem(page, 'Údaje a zabezpečení');
  });

  test('when they download the diagnostic file, then it names no role and stores nothing in the browser', async ({
    page,
  }, testInfo) => {
    const before = await browserStores(page);

    const { text } = await delivered(page, page.locator('body'), testInfo, { secondTap: true });

    const file = JSON.parse(text);
    expect(file.session).toEqual({
      account: 'signed-in',
      kind: 'PUBLIC',
      administrationUnlocked: null,
    });
    expect(file.deviceCopy?.administration ?? null).toBeNull();
    expectNoPersonalData(text);
    expect(await browserStores(page)).toEqual(before);
    expect((before as { databases: string[] }).databases).toEqual([]);
  });
});

test.describe('Given the app script of the site never arrives', () => {
  test('when the watchdog shows its panel, then the diagnostic file it offers names the start and the bundle, and nothing else of the page', async ({
    page,
  }, testInfo) => {
    await page.route(MAIN_SCRIPT, (route) => route.abort());
    await page.clock.install();
    await page.goto('/obnova-hesla#token=kanarek-7781-tajemstvi');
    const reloaded = page.waitForEvent('load');
    await page.clock.fastForward(BOOT_TIMEOUT_MS);
    await reloaded;
    await page.clock.fastForward(BOOT_TIMEOUT_MS);
    const panel = page.getByRole('alert');
    await expect(panel.getByRole('heading', { name: 'Web se nenačetl' })).toBeVisible();

    const { name, text } = await delivered(page, panel, testInfo, { secondTap: false });

    expect(name).toMatch(FILE_NAME);
    expect(text).not.toContain('kanarek');
    expect(JSON.parse(text)).toMatchObject({
      format: 'nfnn-diagnostics',
      source: 'boot-panel',
      page: '/obnova-hesla',
      app: { revision: 'unknown', bundle: expect.stringMatching(/^main-[A-Z0-9]{8}\.js$/) },
      reloads: { boot: 15 },
      boot: {
        recovered: true,
        previous: { panelShown: false, codeArrived: false, waitedSeconds: 15, secondsAgo: 15 },
      },
      session: null,
      deviceCopy: null,
      events: [],
    });
  });
});
