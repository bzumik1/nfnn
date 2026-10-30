import { TestBed } from '@angular/core/testing';

import { ChunkProbe } from './chunk-probe';

const CHUNK = `${location.origin}/chunk-BQ1Fwj_M.js`;
const CHROME = new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`);
const SAFARI = new TypeError('Importing a module script failed.');

function answer(status: number, contentType: string): Response {
  return new Response(null, { status, headers: { 'Content-Type': contentType } });
}

describe('Given the probe that runs before an automatic reload', () => {
  let fetch: ReturnType<typeof vi.fn>;
  let probe: ChunkProbe;

  beforeEach(() => {
    fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    probe = TestBed.inject(ChunkProbe);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('when the error names the chunk, then it asks the server for that chunk without the cache', async () => {
    fetch.mockResolvedValue(answer(404, 'text/html'));

    await probe.reloadWouldLand(CHROME);

    expect(fetch).toHaveBeenCalledExactlyOnceWith(CHUNK, { method: 'HEAD', cache: 'no-store' });
  });

  it('when the server no longer has the chunk, then a reload would land on the new version', async () => {
    fetch.mockResolvedValue(answer(404, 'text/plain'));

    await expect(probe.reloadWouldLand(CHROME)).resolves.toBe(true);
  });

  it('when the server answers the chunk with a page, then a reload would land on the new version', async () => {
    fetch.mockResolvedValue(answer(200, 'text/html; charset=utf-8'));

    await expect(probe.reloadWouldLand(CHROME)).resolves.toBe(true);
  });

  it('when the server still has the chunk, then a reload is only offered', async () => {
    fetch.mockResolvedValue(answer(200, 'text/javascript'));

    await expect(probe.reloadWouldLand(CHROME)).resolves.toBe(false);
  });

  it('when the server fails, then a reload is only offered', async () => {
    fetch.mockResolvedValue(answer(502, 'text/html'));

    await expect(probe.reloadWouldLand(CHROME)).resolves.toBe(false);
  });

  it('when the request does not reach the server, then a reload is only offered', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(probe.reloadWouldLand(CHROME)).resolves.toBe(false);
  });

  it('when the error names a chunk of another site, then it asks for the home page instead', async () => {
    fetch.mockResolvedValue(answer(200, 'text/html'));

    await probe.reloadWouldLand(
      new TypeError('Failed to fetch dynamically imported module: https://cdn.example/chunk-x.js'),
    );

    expect(fetch).toHaveBeenCalledExactlyOnceWith('/', { method: 'HEAD', cache: 'no-store' });
  });

  describe('when the error names no chunk, as in Safari', () => {
    it('then it asks for the home page and a reload lands when the server answers with it', async () => {
      fetch.mockResolvedValue(answer(200, 'text/html'));

      await expect(probe.reloadWouldLand(SAFARI)).resolves.toBe(true);
      expect(fetch).toHaveBeenCalledExactlyOnceWith('/', { method: 'HEAD', cache: 'no-store' });
    });

    it('and the home page does not come back, then a reload is only offered', async () => {
      fetch.mockResolvedValue(answer(503, 'text/html'));

      await expect(probe.reloadWouldLand(SAFARI)).resolves.toBe(false);
    });

    it('and the request does not reach the server, then a reload is only offered', async () => {
      fetch.mockRejectedValue(new TypeError('Load failed'));

      await expect(probe.reloadWouldLand(SAFARI)).resolves.toBe(false);
    });
  });
});
