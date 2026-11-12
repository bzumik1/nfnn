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
