import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openRequests, quietNetwork } from './settled';

async function openPageFetching(page: Page, address: string): Promise<void> {
  await page.route('https://example.test/page', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><script>fetch(${JSON.stringify(address)})</script></body></html>`,
    }),
  );
  await page.goto('https://example.test/page');
}

test.describe('Given a page that waits for the network to go quiet', () => {
  test('when every request has answered, then the wait ends', async ({ page }) => {
    const open = openRequests(page);
    await page.route('https://example.test/answered', (route) => route.fulfill({ body: 'ok' }));
    await openPageFetching(page, 'https://example.test/answered');

    await quietNetwork(page, open, 5_000);

    expect(open()).toEqual([]);
  });

  test('when a request never answers, then the wait fails naming that request', async ({
    page,
  }) => {
    const open = openRequests(page);
    await page.route('https://example.test/never*', () => undefined);
    await openPageFetching(page, 'https://example.test/never?from=test');

    await expect(quietNetwork(page, open, 1_000)).rejects.toThrow(
      'the network did not go quiet within 1000 ms (document complete); still open: GET https://example.test/never',
    );
  });
});
