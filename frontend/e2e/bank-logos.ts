import { Request } from '@playwright/test';
import type { RouteTarget } from './fixtures';

export const LOGO_IMAGE_ID = '019a7c00-0000-7000-8000-0000000000aa';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export interface BankLogoRequests {
  readonly list: Request[];
  readonly images: Request[];
}

export async function mockBankLogos(
  page: RouteTarget,
  items: { code: string; imageId: string }[],
): Promise<BankLogoRequests> {
  const requests: BankLogoRequests = { list: [], images: [] };
  await page.route(
    (url) => url.pathname === '/api/donations/bank-logos',
    (route) => {
      requests.list.push(route.request());
      return route.fulfill({ json: { items } });
    },
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/donations/bank-logos/images/'),
    (route) => {
      requests.images.push(route.request());
      return route.fulfill({
        body: ONE_PIXEL_PNG,
        contentType: 'image/png',
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      });
    },
  );
  return requests;
}
