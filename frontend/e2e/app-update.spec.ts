import { expect, test } from './fixtures';
import { API_GENERATION } from '../src/app/core/version/api-generation';

const NOTICE = 'Web má novou verzi. Než budete cokoli odesílat, načtěte ji.';

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
        headers: { 'Nfnn-Api': String(generation), 'Nfnn-Revision': '0123abc' },
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
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
    expect(posted).toEqual([]);

    generation = API_GENERATION;
    await Promise.all([
      page.waitForEvent('load'),
      notice.getByRole('button', { name: 'Načíst novou verzi' }).click(),
    ]);

    await expect(page.locator('#contact-name')).toBeVisible();
    await expect(page.getByText(NOTICE)).toHaveCount(0);
  });
});
