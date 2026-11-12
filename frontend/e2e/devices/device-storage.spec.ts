import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { FORGET_STORED_DATA, HELD_LOCKS } from './webdriver';

const ORIGIN = 'https://device-storage.test';

async function blankPageOfItsOwnOrigin(page: Page): Promise<void> {
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }),
  );
  await page.goto(`${ORIGIN}/`);
}

function runAsync<T>(page: Page, script: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([source, values]) =>
      new Promise<T>((resolve) =>
        new Function(source).call(null, ...(values as unknown[]), resolve),
      ),
    [script, args] as const,
  );
}

function storedDatabase(page: Page, name: string, keepOpen: boolean): Promise<void> {
  return page.evaluate(
    ([database, open]) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(database, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('records');
        request.onsuccess = () => {
          if (open) {
            request.result.onversionchange = null;
          } else {
            request.result.close();
          }
          resolve();
        };
        request.onerror = () => reject(request.error);
      }),
    [name, keepOpen] as const,
  );
}

function databaseNames(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await indexedDB.databases()).map((database) => database.name ?? '').sort(),
  );
}

test.describe('Given a Safari step that left databases on the device', () => {
  test('when the next step forgets the stored data, then no database is left', async ({ page }) => {
    await blankPageOfItsOwnOrigin(page);
    await storedDatabase(page, 'nfnn.device', false);
    await storedDatabase(page, 'nfnn.drafts', false);

    expect(await runAsync<string[]>(page, FORGET_STORED_DATA, 2_000)).toEqual([]);
    expect(await databaseNames(page)).toEqual([]);
  });

  test('when a connection that ignores the request keeps a database open, then forgetting names it instead of waiting for ever', async ({
    page,
  }) => {
    await blankPageOfItsOwnOrigin(page);
    await storedDatabase(page, 'nfnn.device', true);

    expect(await runAsync<string[]>(page, FORGET_STORED_DATA, 500)).toEqual([
      'nfnn.device: blocked',
    ]);
  });
});

test.describe('Given a Safari step that fails while the page holds a Web Lock', () => {
  test('when the failure is reported, then it names the held and the waiting locks', async ({
    page,
  }) => {
    await blankPageOfItsOwnOrigin(page);
    await page.evaluate(() => {
      void navigator.locks.request('nfnn.vault', () => new Promise(() => undefined));
      void navigator.locks.request('nfnn.vault', () => undefined);
    });

    await expect
      .poll(() => runAsync<string>(page, HELD_LOCKS))
      .toBe('held: nfnn.vault; waiting: nfnn.vault');
  });

  test('when no lock is held, then the report says none', async ({ page }) => {
    await blankPageOfItsOwnOrigin(page);

    expect(await runAsync<string>(page, HELD_LOCKS)).toBe('held: none; waiting: none');
  });
});
