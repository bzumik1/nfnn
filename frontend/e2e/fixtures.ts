import { BrowserContext, expect, test as base } from '@playwright/test';
import { FOUNDATION_PAYMENT_DETAILS } from './qr-matrices';

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

export type RouteTarget = Pick<BrowserContext, 'route'>;

const SERVER_PAYMENT_PATHS = '/api/donations/payment-';
const PAYMENT_DETAILS_PATH = '/api/donations/payment-details';

export const NO_SERVER_PAYMENT =
  'the browser draws every QR payment from the payment details and asks the server for nothing else under /api/donations/payment-';

export async function routeApiDefaults(target: RouteTarget): Promise<readonly string[]> {
  await target.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(unmockedApi),
  );
  await target.route(
    (url) => url.pathname === '/api/operations/setup',
    (route) => route.fulfill({ json: { required: false, codeRequired: true } }),
  );
  await target.route(
    (url) => url.pathname === '/api/content/home',
    (route) => route.fulfill({ json: { news: [], projects: [] } }),
  );
  await target.route(
    (url) => url.pathname === PAYMENT_DETAILS_PATH,
    (route) => route.fulfill({ json: FOUNDATION_PAYMENT_DETAILS }),
  );
  const askedForServerPayment: string[] = [];
  await target.route(
    (url) => url.pathname.startsWith(SERVER_PAYMENT_PATHS) && url.pathname !== PAYMENT_DETAILS_PATH,
    (route) => {
      askedForServerPayment.push(new URL(route.request().url()).pathname);
      return route.fulfill(unmockedApi);
    },
  );
  return askedForServerPayment;
}

export const test = base.extend<{ offlineApi: void }>({
  offlineApi: [
    async ({ page }, use) => {
      const askedForServerPayment = await routeApiDefaults(page);
      await use();
      expect(askedForServerPayment, NO_SERVER_PAYMENT).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
