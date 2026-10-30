import type { Page } from '@playwright/test';

import { expect } from './fixtures';

export const chunkLoadMessage =
  'Stránku se nepodařilo otevřít. Web byl mezitím možná aktualizován nebo vypadlo připojení. Zkuste ji načíst znovu.';
export const chunkLoadPageHeading = { level: 1, name: 'Stránku se nepodařilo otevřít' } as const;
export const policyPath = '/zasady-ochrany-osobnich-udaju';
export const policyHeading = { level: 1, name: 'Zásady ochrany osobních údajů' } as const;

const CHUNK = /\/chunk-[^/]+\.js$/;

export class LostChunks {
  readonly documents: string[] = [];
  private readonly loaded = new Set<string>();
  private kept = new Set<string>();
  private lost = false;
  private unreachable = false;
  private restoreAtDocument: number | null = null;

  private constructor(private readonly page: Page) {
    page.on('request', (request) => {
      if (request.resourceType() !== 'document') {
        return;
      }
      this.documents.push(new URL(request.url()).pathname);
      if (this.restoreAtDocument !== null && this.documents.length >= this.restoreAtDocument) {
        this.lost = false;
      }
    });
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script' && response.ok()) {
        this.loaded.add(new URL(response.url()).pathname);
      }
    });
  }

  static async watch(page: Page): Promise<LostChunks> {
    const chunks = new LostChunks(page);
    await page.route(
      (url) => CHUNK.test(url.pathname),
      (route) => {
        const path = new URL(route.request().url()).pathname;
        if (!chunks.lost || chunks.kept.has(path)) {
          return route.continue();
        }
        return chunks.unreachable
          ? route.abort('internetdisconnected')
          : route.fulfill({
              status: 404,
              contentType: 'text/html',
              body: '<h1>404 Not Found</h1>',
            });
      },
    );
    return chunks;
  }

  async open(path: string): Promise<void> {
    await this.page.goto(path);
    await expect(this.page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(this.page.getByRole('contentinfo')).toBeVisible();
  }

  loseEveryChunkNotLoadedYet(): void {
    this.kept = new Set(this.loaded);
    this.lost = true;
    this.unreachable = false;
    this.documents.length = 0;
  }

  cutOffEveryChunkNotLoadedYet(): void {
    this.loseEveryChunkNotLoadedYet();
    this.unreachable = true;
  }

  bringBackAtDocument(count: number): void {
    this.restoreAtDocument = count;
  }

  bringBack(): void {
    this.lost = false;
    this.unreachable = false;
  }
}

export async function openHomeThenLoseNewChunks(page: Page): Promise<LostChunks> {
  const chunks = await LostChunks.watch(page);
  await chunks.open('/');
  chunks.loseEveryChunkNotLoadedYet();
  return chunks;
}

export async function openPolicyFromFooter(page: Page): Promise<void> {
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Zásady ochrany osobních údajů' })
    .click();
}

export function chunkLoadNotice(page: Page) {
  return page
    .locator('app-chunk-load-notice .chunk-load-bar')
    .filter({ hasText: chunkLoadMessage });
}

export async function withoutSessionStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });
}
