import type { Page, Request } from '@playwright/test';

export function requestsInFlight(page: Page): () => number {
  const open = new Set<Request>();
  page.on('request', (request) => open.add(request));
  page.on('requestfinished', (request) => open.delete(request));
  page.on('requestfailed', (request) => open.delete(request));
  return () => open.size;
}

export interface QuietWatch {
  nextFrames: () => Promise<unknown>;
  inFlight: () => number;
  timeoutMs: number;
  now?: () => number;
}

export async function untilQuiet({
  nextFrames,
  inFlight,
  timeoutMs,
  now = Date.now,
}: QuietWatch): Promise<void> {
  const deadline = now() + timeoutMs;
  let quietRounds = 0;
  while (quietRounds < 2) {
    const waiting = inFlight();
    if (waiting > 0 && now() > deadline) {
      throw new Error(`the page still waits for ${waiting} requests`);
    }
    await nextFrames();
    quietRounds = inFlight() === 0 ? quietRounds + 1 : 0;
  }
}

export function settled(page: Page, inFlight: () => number, timeoutMs: number): Promise<void> {
  return untilQuiet({
    nextFrames: () =>
      page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      ),
    inFlight,
    timeoutMs,
  });
}

export function openRequests(page: Page): () => string[] {
  const open = new Set<Request>();
  page.on('request', (request) => open.add(request));
  page.on('requestfinished', (request) => open.delete(request));
  page.on('requestfailed', (request) => open.delete(request));
  return () =>
    [...open].map((request) => {
      const url = new URL(request.url());
      return `${request.method()} ${url.origin}${url.pathname}`;
    });
}

export async function quietNetwork(
  page: Page,
  open: () => string[],
  timeoutMs: number,
): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout: timeoutMs });
  } catch {
    const document = await page.evaluate(() => window.document.readyState).catch(() => 'gone');
    throw new Error(
      `the network did not go quiet within ${timeoutMs} ms (document ${document}); still open: ${open().join(', ') || 'nothing'}`,
    );
  }
}
