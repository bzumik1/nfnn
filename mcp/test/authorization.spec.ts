import { describe, expect, it } from 'vitest';
import { AuthorizationServerDiscovery, type FetchLike } from '../src/authorization.js';
import { metadata } from './fake-backend.js';

const BACKEND = 'http://backend:8080';
const REFRESH_MS = 30_000;

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
    const discovery = new AuthorizationServerDiscovery(BACKEND, siteAt(site), () => clock.now);

    await discovery.discover();
    clock.now = REFRESH_MS - 1;
    const server = await discovery.discover();

    expect(server.issuer).toBe('https://nfnn.cz');
    expect(site.reads).toBe(1);
  });

  it('when the site restarted with another address, then the next discovery after the interval names it', async () => {
    const site = { issuer: 'https://nfnn.cz', up: true, reads: 0 };
    const clock = { now: 0 };
    const discovery = new AuthorizationServerDiscovery(BACKEND, siteAt(site), () => clock.now);

    await discovery.discover();
    site.issuer = 'http://localhost:8089';
    clock.now = REFRESH_MS;
    const server = await discovery.discover();

    expect(server.issuer).toBe('http://localhost:8089');
    expect(server.mcpResource).toBe('http://localhost:8089/mcp');
    expect(server.apiResource).toBe('http://localhost:8089/api');
  });

  it('when the site is restarting, then the last known server stays and the next request asks again', async () => {
    const site = { issuer: 'https://nfnn.cz', up: true, reads: 0 };
    const clock = { now: 0 };
    const discovery = new AuthorizationServerDiscovery(BACKEND, siteAt(site), () => clock.now);

    await discovery.discover();
    site.up = false;
    clock.now = REFRESH_MS;

    expect((await discovery.discover()).issuer).toBe('https://nfnn.cz');

    site.up = true;
    site.issuer = 'http://localhost:8089';
    clock.now = REFRESH_MS + 1;

    expect((await discovery.discover()).issuer).toBe('http://localhost:8089');
    expect(site.reads).toBe(3);
  });

  it('when the site was never reached, then the failure is reported', async () => {
    const site = { issuer: 'https://nfnn.cz', up: false, reads: 0 };
    const discovery = new AuthorizationServerDiscovery(BACKEND, siteAt(site), () => 0);

    await expect(discovery.discover()).rejects.toThrow('connection refused');
    expect(discovery.current()).toBeUndefined();
  });
});
