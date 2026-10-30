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

const SERVER_PAYMENT_PATHS = '/api/donations/payment-';
const PAYMENT_DETAILS_PATH = '/api/donations/payment-details';

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
      const askedForServerPayment: string[] = [];
      await page.route(
        (url) =>
          url.pathname.startsWith(SERVER_PAYMENT_PATHS) && url.pathname !== PAYMENT_DETAILS_PATH,
        (route) => {
          askedForServerPayment.push(new URL(route.request().url()).pathname);
          return route.fulfill(unmockedApi);
        },
      );
      await use();
      expect(
        askedForServerPayment,
        'the browser draws every QR payment from the payment details and asks the server for nothing else under /api/donations/payment-',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
