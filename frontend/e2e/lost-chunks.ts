import type { Page } from '@playwright/test';

import { expect } from './fixtures';

export const chunkLoadNoticeText =
  'Stránku se nepodařilo otevřít. Web mezitím mohl dostat novou verzi, nebo vypadlo připojení.';

export interface LostChunks {
  readonly documents: () => readonly string[];
  readonly restore: () => Promise<void>;
}

export async function openHomeThenLoseNewChunks(page: Page): Promise<LostChunks> {
  const loadedScripts = new Set<string>();
  const documents: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'document') {
      documents.push(new URL(request.url()).pathname);
    }
  });
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script' && response.ok()) {
      loadedScripts.add(new URL(response.url()).pathname);
    }
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');

  const newChunk = (url: URL) =>
    /\/chunk-[^/]+\.js$/.test(url.pathname) && !loadedScripts.has(url.pathname);
  await page.route(newChunk, (route) =>
    route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404 Not Found</h1>' }),
  );

  return {
    documents: () => [...documents],
    restore: () => page.unroute(newChunk),
  };
}

export async function openPolicyFromFooter(page: Page): Promise<void> {
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Zásady ochrany osobních údajů' })
    .click();
}

export function chunkLoadNotice(page: Page) {
  return page.getByRole('alert').filter({ hasText: chunkLoadNoticeText });
}
