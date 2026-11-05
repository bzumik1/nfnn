import { BrowserContext, expect, Page, test as base } from '@playwright/test';
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

export const testWithoutBrowser = base;

const CSP_VIOLATION_BINDING = '__nfnnCspViolation';

export interface CspViolation {
  directive: string;
  blocked: string;
  page: string;
}

export const ADMINISTRATION_UNLOCK_PATH = '/api/admin/donors/devices/current/unlock';
export const ADMINISTRATION_COPY_RECORD_PATH =
  '/api/admin/donors/devices/current/administration-copy';
export const ADMINISTRATION_LOCKED = 'Správa je zamčená';

export async function unlockAdministration(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Použít heslo' }).click();
  await page.locator('#zamek-heslo').fill('correct horse battery');
  await page.locator('#zamek-kod').fill('123456');
  await page.getByRole('button', { name: 'Odemknout', exact: true }).click();
}

export const test = base.extend<{
  offlineApi: void;
  cspViolations: CspViolation[];
  unlocksAdministration: boolean;
  administrationUnlock: void;
}>({
  unlocksAdministration: [true, { option: true }],
  administrationUnlock: [
    async ({ page, unlocksAdministration, offlineApi }, use) => {
      void offlineApi;
      await page.route(
        (url) => url.pathname === ADMINISTRATION_COPY_RECORD_PATH,
        (route) => route.fulfill({ status: 204 }),
      );
      if (unlocksAdministration) {
        await page.route(
          (url) => url.pathname === ADMINISTRATION_UNLOCK_PATH,
          (route) => route.fulfill({ status: 204 }),
        );
        await page.addLocatorHandler(
          page.getByRole('heading', { level: 1, name: ADMINISTRATION_LOCKED }),
          () => unlockAdministration(page),
        );
      }
      await use();
    },
    { auto: true },
  ],
  cspViolations: [
    async ({ context }, use) => {
      const violations: CspViolation[] = [];
      await context.exposeBinding(CSP_VIOLATION_BINDING, (_source, violation: CspViolation) => {
        violations.push(violation);
      });
      await context.addInitScript((binding) => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const report = (window as unknown as Record<string, (violation: CspViolation) => void>)[
            binding
          ];
          report?.({
            directive: event.effectiveDirective,
            blocked: event.blockedURI,
            page: location.pathname,
          });
        });
      }, CSP_VIOLATION_BINDING);
      await use(violations);
      for (const open of context.pages()) {
        await open
          .evaluate(() => new Promise((settled) => setTimeout(settled)))
          .catch(() => undefined);
      }
      expect(
        violations,
        'no page breaks the Content-Security-Policy or Trusted Types of the frontend nginx',
      ).toEqual([]);
    },
    { auto: true },
  ],
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
