import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { waitWhileNothingMayHappen } from './fixed-waits';
import { API_GENERATION } from '../src/app/core/version/api-generation';

const HELD =
  'Web mezitím dostal novou verzi, a tak jsme zprávu neodeslali. Zkopírujte si její text, načtěte stránku znovu a odešlete ji ještě jednou.';
const NOT_STORED = { 'Cache-Control': 'no-store' };
const SETTLE_MS = 1_500;

async function countLoads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const loads = Number(sessionStorage.getItem('e2e.loads') ?? '0') + 1;
    sessionStorage.setItem('e2e.loads', String(loads));
  });
}

function loads(page: Page): Promise<number> {
  return page.evaluate(() => Number(sessionStorage.getItem('e2e.loads') ?? '0'));
}

async function markThisDocument(page: Page): Promise<void> {
  await page.evaluate(() => Object.assign(window, { e2eSameDocument: true }));
}

function sameDocument(page: Page): Promise<boolean> {
  return page.evaluate(() => 'e2eSameDocument' in window);
}

async function fillContactForm(page: Page): Promise<void> {
  await page.locator('#contact-name').fill('Jana Nováková');
  await page.locator('#contact-email').fill('jana@example.cz');
  await page.locator('#contact-message').fill('Mám dotaz k projektu.');
}

test.describe('Given a visitor whose page was opened before the server changed its API', () => {
  test('when the About page loads, then every API call names the app revision', async ({
    page,
  }) => {
    const named: (string | null)[] = [];
    await page.route('**/api/content/home', async (route) => {
      named.push(await route.request().headerValue('Nfnn-App'));
      await route.fulfill({ json: { news: [], projects: [] } });
    });

    await page.goto('/o-nas');

    await expect.poll(() => named.length).toBeGreaterThan(0);
    expect(named.every((value) => value !== null && /^(?:[0-9a-f]{7,40}|dev)$/.test(value))).toBe(
      true,
    );
  });

  test('when an answer names a newer API generation and nothing is typed, then the page loads the new version by itself at the same address, shows no bar and loads only once for that generation while it still sends nothing', async ({
    page,
  }) => {
    const posted: unknown[] = [];
    await countLoads(page);
    await page.route('**/api/content/home', (route) =>
      route.fulfill({
        json: { news: [], projects: [] },
        headers: { ...NOT_STORED, 'Nfnn-Api': String(API_GENERATION + 1) },
      }),
    );
    await page.route('**/api/contact/messages', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });

    await page.goto('/o-nas');

    await expect.poll(() => loads(page).catch(() => 0)).toBe(2);
    await expect(page).toHaveURL(/\/o-nas$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Načíst novou verzi' })).toHaveCount(0);

    await fillContactForm(page);
    await page.getByRole('button', { name: 'Odeslat zprávu' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(HELD);
    await waitWhileNothingMayHappen(page, SETTLE_MS);
    expect(await loads(page)).toBe(2);
    expect(posted).toEqual([]);
  });

  test('when the first write after a deploy reaches a server of a newer API generation, then the server refuses it, the typed message stays, and leaving the page loads the new version', async ({
    page,
  }) => {
    const sent: (string | null)[] = [];
    await page.route('**/api/content/home', (route) =>
      route.fulfill({
        json: { news: [], projects: [] },
        headers: { ...NOT_STORED, 'Nfnn-Api': String(API_GENERATION) },
      }),
    );
    await page.route('**/api/contact/messages', async (route) => {
      sent.push(await route.request().headerValue('Nfnn-App-Api'));
      await route.fulfill({
        status: 426,
        contentType: 'application/problem+json',
        headers: { ...NOT_STORED, 'Nfnn-Api': String(API_GENERATION + 1) },
        json: {
          type: 'https://nfnn.cz/problems/app/update-required',
          title: 'Web mezitím dostal novou verzi',
          status: 426,
          detail: 'Nic jsme neodeslali. Načtěte stránku znovu a zkuste to ještě jednou.',
        },
      });
    });

    await page.goto('/o-nas');
    await markThisDocument(page);
    await fillContactForm(page);
    await page.getByRole('button', { name: 'Odeslat zprávu' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(HELD);
    await waitWhileNothingMayHappen(page, SETTLE_MS);
    expect(await sameDocument(page)).toBe(true);
    await expect(page.locator('#contact-message')).toHaveValue('Mám dotaz k projektu.');
    expect(sent).toEqual([String(API_GENERATION)]);

    await page
      .getByRole('navigation', { name: 'Hlavní sekce' })
      .getByRole('link', { name: 'Aktuality' })
      .click();

    await expect.poll(() => sameDocument(page).catch(() => true)).toBe(false);
    await expect(page).toHaveURL(/\/aktuality$/);
  });
});
