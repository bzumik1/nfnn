import { TestBed } from '@angular/core/testing';

import { ChunkProbe } from './chunk-probe';

const CHUNK = `${location.origin}/chunk-BQ1Fwj_M.js`;
const CHROME = new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`);
const SAFARI = new TypeError('Importing a module script failed.');

const PROBE = { method: 'HEAD', cache: 'no-store', signal: expect.any(AbortSignal) };

function answer(
  status: number,
  contentType: string,
  { url = CHUNK, redirected = false }: { url?: string; redirected?: boolean } = {},
): Response {
  const response = new Response(null, { status, headers: { 'Content-Type': contentType } });
  Object.defineProperty(response, 'url', { value: url });
  Object.defineProperty(response, 'redirected', { value: redirected });
  return response;
}

function neverAnswered(_url: string, init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) =>
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
  );
}

describe('Given the probe that runs before an automatic reload', () => {
  let fetch: ReturnType<typeof vi.fn>;
  let probe: ChunkProbe;

  beforeEach(() => {
    fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    probe = TestBed.inject(ChunkProbe);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('when the error names the chunk, then it asks the server for that chunk without the cache', async () => {
    fetch.mockResolvedValue(answer(404, 'text/html'));

    await probe.reloadWouldLand(CHROME);

    expect(fetch).toHaveBeenCalledExactlyOnceWith(CHUNK, PROBE);
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

  it('when the server takes the request but never answers, then after four seconds a reload is only offered', async () => {
    vi.useFakeTimers();
    fetch.mockImplementation(neverAnswered);
    let verdict: boolean | undefined;
    void probe.reloadWouldLand(CHROME).then((lands) => (verdict = lands));

    await vi.advanceTimersByTimeAsync(3_999);
    expect(verdict).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(verdict).toBe(false);
  });

  it('when the chunk is redirected to a page, then a reload is only offered', async () => {
    fetch.mockResolvedValue(
      answer(200, 'text/html', { url: `${location.origin}/prihlaseni`, redirected: true }),
    );

    await expect(probe.reloadWouldLand(CHROME)).resolves.toBe(false);
  });

  it('when the chunk is redirected to an address the server does not know, then a reload is only offered', async () => {
    fetch.mockResolvedValue(
      answer(404, 'text/html', { url: `${location.origin}/jinde.js`, redirected: true }),
    );

    await expect(probe.reloadWouldLand(CHROME)).resolves.toBe(false);
  });

  it('when a page answers the chunk from another address, then a reload is only offered', async () => {
    fetch.mockResolvedValue(answer(200, 'text/html', { url: `${location.origin}/` }));

    await expect(probe.reloadWouldLand(CHROME)).resolves.toBe(false);
  });

  it('when the error names a chunk of another site, then it asks for the home page instead', async () => {
    fetch.mockResolvedValue(answer(200, 'text/html'));

    await probe.reloadWouldLand(
      new TypeError('Failed to fetch dynamically imported module: https://cdn.example/chunk-x.js'),
    );

    expect(fetch).toHaveBeenCalledExactlyOnceWith('/', PROBE);
  });

  describe('when the error names no chunk, as in Safari', () => {
    it('then it asks for the home page and a reload lands when the server answers with it', async () => {
      fetch.mockResolvedValue(answer(200, 'text/html', { url: `${location.origin}/` }));

      await expect(probe.reloadWouldLand(SAFARI)).resolves.toBe(true);
      expect(fetch).toHaveBeenCalledExactlyOnceWith('/', PROBE);
    });

    it('and the home page is redirected elsewhere, then a reload is only offered', async () => {
      fetch.mockResolvedValue(
        answer(200, 'text/html', { url: `${location.origin}/udrzba`, redirected: true }),
      );

      await expect(probe.reloadWouldLand(SAFARI)).resolves.toBe(false);
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
