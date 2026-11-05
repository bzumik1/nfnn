import { expect, test } from './fixtures';
import { API_GENERATION } from '../src/app/core/version/api-generation';
import { UPDATE_NOTICE as NOTICE, updateNotice } from './app-update';
const HELD =
  'Web mezitím dostal novou verzi, a tak jsme zprávu neodeslali. Zkopírujte si její text, načtěte stránku znovu a odešlete ji ještě jednou.';
const NOT_STORED = { 'Cache-Control': 'no-store' };

test.describe('Given a visitor whose page was opened before the server changed its API', () => {
  test('when the home page loads, then every API call names the app revision', async ({ page }) => {
    const named: (string | null)[] = [];
    await page.route('**/api/content/home', async (route) => {
      named.push(await route.request().headerValue('Nfnn-App'));
      await route.fulfill({ json: { news: [], projects: [] } });
    });

    await page.goto('/');

    await expect.poll(() => named.length).toBeGreaterThan(0);
    expect(named.every((value) => value !== null && /^(?:[0-9a-f]{7,40}|dev)$/.test(value))).toBe(
      true,
    );
  });

  test('when an answer names a newer API generation, then the site says so, sends nothing and loads the new version on request', async ({
    page,
  }) => {
    let generation = API_GENERATION + 1;
    const posted: unknown[] = [];
    await page.route('**/api/content/home', (route) =>
      route.fulfill({
        json: { news: [], projects: [] },
        headers: { ...NOT_STORED, 'Nfnn-Api': String(generation), 'Nfnn-Revision': '0123abc' },
      }),
    );
    await page.route('**/api/contact/messages', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });

    await page.goto('/');
    const notice = page.locator('[aria-live="polite"]').filter({ hasText: NOTICE });
    await expect(notice.getByText(NOTICE)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: NOTICE })).toHaveCount(0);

    await page.locator('#contact-name').fill('Jana Nováková');
    await page.locator('#contact-email').fill('jana@example.cz');
    await page.locator('#contact-message').fill('Mám dotaz k projektu.');
    await page.getByRole('button', { name: 'Odeslat zprávu' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(HELD);
    expect(posted).toEqual([]);

    generation = API_GENERATION;
    await Promise.all([
      page.waitForResponse('**/api/content/home'),
      notice.getByRole('button', { name: 'Načíst novou verzi' }).click(),
    ]);

    await expect(page.locator('#contact-name')).toBeVisible();
    await expect(page.getByText(NOTICE)).toHaveCount(0);
  });

  test('when the first write after a deploy reaches a server of a newer API generation, then the server refuses it and the site asks to load the new version', async ({
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

    await page.goto('/');
    await page.locator('#contact-name').fill('Jana Nováková');
    await page.locator('#contact-email').fill('jana@example.cz');
    await page.locator('#contact-message').fill('Mám dotaz k projektu.');
    await page.getByRole('button', { name: 'Odeslat zprávu' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(HELD);
    await expect(updateNotice(page)).toBeVisible();
    expect(sent).toEqual([String(API_GENERATION)]);
  });
});
