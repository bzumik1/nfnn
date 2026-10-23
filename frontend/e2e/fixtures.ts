import { expect, test as base } from '@playwright/test';

export const unmockedApi = {
  status: 404,
  contentType: 'application/problem+json',
  body: JSON.stringify({
    type: 'https://nfnn.cz/problems/e2e/unmocked',
    title: 'Not mocked',
    detail: 'The end-to-end test registered no answer for this request.',
    status: 404,
  }),
};

export const test = base.extend<{ offlineApi: void }>({
  offlineApi: [
    async ({ page }, use) => {
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        (route) => route.fulfill(unmockedApi),
      );
      await page.route(
        (url) => url.pathname === '/api/operations/setup',
        (route) => route.fulfill({ json: { required: false, codeRequired: true } }),
      );
      await page.route(
        (url) => url.pathname === '/api/content/home',
        (route) => route.fulfill({ json: { news: [], projects: [] } }),
      );
      await use();
    },
    { auto: true },
  ],
});

export { expect };
