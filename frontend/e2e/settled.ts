import type { Page, Request } from '@playwright/test';

export function requestsInFlight(page: Page): () => number {
  const open = new Set<Request>();
  page.on('request', (request) => open.add(request));
  page.on('requestfinished', (request) => open.delete(request));
  page.on('requestfailed', (request) => open.delete(request));
  return () => open.size;
}

export async function settled(
  page: Page,
  inFlight: () => number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let quietRounds = 0;
  while (quietRounds < 2) {
    if (Date.now() > deadline) {
      throw new Error(`the page still waits for ${inFlight()} requests`);
    }
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    quietRounds = inFlight() === 0 ? quietRounds + 1 : 0;
  }
}
