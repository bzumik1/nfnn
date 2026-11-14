import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationServerDiscovery, type FetchLike } from '../src/authorization.js';
import type { Logger } from '../src/token-exchange.js';
import { metadata } from './fake-backend.js';

const BACKEND = 'http://backend:8080';
const REFRESH_MS = 30_000;
const FAILURE_REMEMBERED_MS = 5_000;
const FETCH_TIMEOUT_MS = 5_000;

function recording(lines: string[]): Logger {
  return {
    info: (message) => lines.push(`INFO ${message}`),
    warn: (message) => lines.push(`WARN ${message}`),
  };
}

const silent = recording([]);

function siteAt(site: { issuer: string; up: boolean; reads: number }): FetchLike {
  return async () => {
    site.reads += 1;
    if (!site.up) {
      throw new Error('connection refused');
    }
    return Response.json({ ...metadata(), issuer: site.issuer });
  };
}

describe('Given the connector discovering the site whose address can change in its settings', () => {
  it('when asked again within the refresh interval, then it answers from memory', async () => {
    const site = { issuer: 'https://nfnn.cz', up: true, reads: 0 };
    const clock = { now: 0 };
    const discovery = new AuthorizationServerDiscovery(
      BACKEND,
      siteAt(site),
      silent,
      () => clock.now,
    );

    await discovery.discover();
    clock.now = REFRESH_MS - 1;
    const server = await discovery.discover();

    expect(server.issuer).toBe('https://nfnn.cz');
    expect(site.reads).toBe(1);
  });

  it('when the site restarted with another address, then the next discovery after the interval names it', async () => {
    const site = { issuer: 'https://nfnn.cz', up: true, reads: 0 };
    const clock = { now: 0 };
    const discovery = new AuthorizationServerDiscovery(
      BACKEND,
      siteAt(site),
      silent,
      () => clock.now,
    );

    await discovery.discover();
    site.issuer = 'http://localhost:8089';
    clock.now = REFRESH_MS;
    const server = await discovery.discover();

    expect(server.issuer).toBe('http://localhost:8089');
    expect(server.mcpResource).toBe('http://localhost:8089/mcp');
    expect(server.apiResource).toBe('http://localhost:8089/api');
  });

  it('when the site is restarting, then the last known server stays and a request after the failure memory asks again', async () => {
    const site = { issuer: 'https://nfnn.cz', up: true, reads: 0 };
    const clock = { now: 0 };
    const discovery = new AuthorizationServerDiscovery(
      BACKEND,
      siteAt(site),
      silent,
      () => clock.now,
    );

    await discovery.discover();
    site.up = false;
    clock.now = REFRESH_MS;

    expect((await discovery.discover()).issuer).toBe('https://nfnn.cz');

    site.up = true;
    site.issuer = 'http://localhost:8089';
    clock.now = REFRESH_MS + FAILURE_REMEMBERED_MS;

    expect((await discovery.discover()).issuer).toBe('http://localhost:8089');
    expect(site.reads).toBe(3);
  });

  it('when the site was never reached, then the failure is reported', async () => {
    const site = { issuer: 'https://nfnn.cz', up: false, reads: 0 };
    const discovery = new AuthorizationServerDiscovery(BACKEND, siteAt(site), silent, () => 0);

    await expect(discovery.discover()).rejects.toThrow('connection refused');
    expect(discovery.current()).toBeUndefined();
  });
});

describe('Given the backend down while the connector reads its metadata', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('when the failure is younger than five seconds, then a request gets it without a new read', async () => {
    const site = { issuer: 'https://nfnn.cz', up: false, reads: 0 };
    const clock = { now: 0 };
    const discovery = new AuthorizationServerDiscovery(
      BACKEND,
      siteAt(site),
      silent,
      () => clock.now,
    );

    await expect(discovery.discover()).rejects.toThrow('connection refused');
    site.up = true;
    clock.now = FAILURE_REMEMBERED_MS - 1;
    await expect(discovery.discover()).rejects.toThrow('connection refused');
    clock.now = FAILURE_REMEMBERED_MS;

    expect((await discovery.discover()).issuer).toBe('https://nfnn.cz');
    expect(site.reads).toBe(2);
  });

  it('when the outage lasts over several reads, then it is warned once, and a later outage is warned again', async () => {
    const site = { issuer: 'https://nfnn.cz', up: false, reads: 0 };
    const clock = { now: 0 };
    const lines: string[] = [];
    const discovery = new AuthorizationServerDiscovery(
      BACKEND,
      siteAt(site),
      recording(lines),
      () => clock.now,
    );

    await expect(discovery.discover()).rejects.toThrow();
    clock.now = FAILURE_REMEMBERED_MS;
    await expect(discovery.discover()).rejects.toThrow();
    site.up = true;
    clock.now = 2 * FAILURE_REMEMBERED_MS;
    await discovery.discover();
    site.up = false;
    clock.now = 2 * FAILURE_REMEMBERED_MS + REFRESH_MS;
    await discovery.discover();

    expect(site.reads).toBe(4);
    expect(lines).toEqual([
      'WARN The authorization server metadata could not be read: connection refused',
      'WARN The authorization server metadata could not be read: connection refused',
    ]);
  });

  it('when the backend never answers, then the read is aborted after five seconds', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const silentBackend: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        signal = init?.signal ?? undefined;
        signal?.addEventListener('abort', () => reject(signal?.reason as Error));
      });
    const discovery = new AuthorizationServerDiscovery(BACKEND, silentBackend, silent, () => 0);

    const discovering = discovery.discover();
    const outcome = expect(discovering).rejects.toThrow(
      'no answer to /.well-known/oauth-authorization-server within 5000 ms',
    );
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(signal?.aborted).toBe(true);
    await outcome;
  });
});

describe('Given the connector bounding each metadata read with a timer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('when a read succeeds, then its timer is cleared', async () => {
    vi.useFakeTimers();
    const site = { issuer: 'https://nfnn.cz', up: true, reads: 0 };
    const discovery = new AuthorizationServerDiscovery(BACKEND, siteAt(site), silent, () => 0);

    await discovery.discover();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('when a read fails, then its timer is cleared', async () => {
    vi.useFakeTimers();
    const site = { issuer: 'https://nfnn.cz', up: false, reads: 0 };
    const discovery = new AuthorizationServerDiscovery(BACKEND, siteAt(site), silent, () => 0);

    await expect(discovery.discover()).rejects.toThrow('connection refused');

    expect(vi.getTimerCount()).toBe(0);
  });
});
