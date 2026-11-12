import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import jsQR from 'jsqr';
import { buildFallbackWorker, FALLBACK_WORKER_FILE } from './build-fallback-worker.mjs';

const sharedCase = (file, name) =>
  JSON.parse(
    readFileSync(new URL(`../../shared-cases/${file}`, import.meta.url), 'utf8'),
  ).cases.find((candidate) => candidate.name === name);

const served = sharedCase('payment/details.json', "the foundation's account").expected;
const configured = (name) =>
  new RegExp(`\\$\\{${name}:([^}]+)\\}`).exec(
    readFileSync(
      new URL('../../backend/src/main/resources/application.yml', import.meta.url),
      'utf8',
    ),
  )?.[1];

const built = await buildFallbackWorker();
const worker = (await import(`data:text/javascript,${encodeURIComponent(built)}`)).default;

const realFetch = globalThis.fetch;
let originAnswer;
let originRequests;

beforeEach(() => {
  originRequests = [];
  originAnswer = () => new Response('<app-root></app-root>', { status: 200 });
  globalThis.fetch = async (request) => {
    originRequests.push(request);
    return originAnswer(request);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const context = () => ({ passThroughOnException() {} });

const navigation = (path, init = {}) =>
  new Request(`https://nfnn.cz${path}`, {
    ...init,
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'sec-fetch-mode': 'navigate',
      ...init.headers,
    },
  });

const fallbackPage = async () => {
  originAnswer = () => new Response('Bad gateway', { status: 502 });
  const response = await worker.fetch(navigation('/'), {}, context());
  return { response, html: await response.text() };
};

function modulesOf(svg) {
  const size = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)?.[1]);
  const dark = new Set();
  for (const [, x, y] of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    dark.add(`${x},${y}`);
  }
  return { size, dark };
}

function decode(svg) {
  const { size, dark } = modulesOf(svg);
  const scale = 6;
  const width = size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < width; row++) {
    for (let column = 0; column < width; column++) {
      if (dark.has(`${Math.floor(column / scale)},${Math.floor(row / scale)}`)) {
        const offset = (row * width + column) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      }
    }
  }
  return jsQR(pixels, width, width)?.data;
}

describe('Given the fallback Worker built from this checkout', () => {
  it('when it is compared with the committed file, then the committed file is up to date', () => {
    assert.equal(
      readFileSync(FALLBACK_WORKER_FILE, 'utf8'),
      built,
      'run `npm run edge:fallback` in frontend/ and commit deploy/cloudflare/nfnn-fallback-worker.mjs',
    );
  });

  it('when it is read, then it holds no import or reference to another origin', () => {
    assert.doesNotMatch(built, /^\s*import\s/m);
    assert.doesNotMatch(built, /https?:\/\/(?!nfnn\.cz\b|www\.w3\.org\/2000\/svg)/);
  });

  it("when the backend's configured account is read, then the shared case the page is built from names the same account", () => {
    assert.equal(served.account.number, configured('BANK_ACCOUNT_NUMBER'));
    assert.equal(served.account.iban, configured('BANK_IBAN'));
  });

  describe('when the origin answers a page normally', () => {
    it('then the visitor gets the origin answer unchanged', async () => {
      const answer = new Response('<app-root></app-root>', { status: 200 });
      originAnswer = () => answer;
      const request = navigation('/aktuality/zprava');
      const response = await worker.fetch(request, {}, context());
      assert.equal(response, answer);
      assert.equal(originRequests.length, 1);
      assert.equal(originRequests[0], request);
    });
  });

  for (const status of [502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]) {
    it(`when the origin answers a page navigation with ${status}, then the visitor gets the fallback page`, async () => {
      originAnswer = () => new Response('down', { status });
      const request = navigation('/darce/prehled');
      const response = await worker.fetch(request, {}, context());
      assert.equal(originRequests.length, 1);
      assert.equal(originRequests[0], request);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('nfnn-fallback'), 'outage');
      assert.match(await response.text(), /Web je dočasně nedostupný/);
    });
  }

  it('when the origin cannot be reached at all, then the visitor gets the fallback page', async () => {
    originAnswer = () => {
      throw new TypeError('network connection lost');
    };
    const response = await worker.fetch(navigation('/'), {}, context());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('nfnn-fallback'), 'outage');
  });

  it('when a browser without Sec-Fetch-Mode asks for HTML of a page that is down, then it gets the fallback page', async () => {
    originAnswer = () => new Response('down', { status: 522 });
    const request = new Request('https://nfnn.cz/', { headers: { accept: 'text/html' } });
    const response = await worker.fetch(request, {}, context());
    assert.equal(response.status, 503);
  });

  it('when the origin answers an outage with a body, then the Worker cancels that body', async () => {
    let cancelled = false;
    originAnswer = () =>
      new Response(new ReadableStream({ cancel: () => (cancelled = true) }), { status: 502 });
    await worker.fetch(navigation('/'), {}, context());
    assert.equal(cancelled, true);
  });

  it('when a HEAD request for a page meets an outage, then the fallback headers come without a body', async () => {
    originAnswer = () => new Response(null, { status: 521 });
    const request = navigation('/', { method: 'HEAD' });
    const response = await worker.fetch(request, {}, context());
    assert.equal(originRequests.length, 1);
    assert.equal(originRequests[0], request);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('nfnn-fallback'), 'outage');
    assert.equal(await response.text(), '');
  });

  for (const status of [200, 304, 404, 429, 500, 501, 505]) {
    it(`when the origin answers a page navigation with ${status}, then that answer passes through`, async () => {
      const answer = new Response(status === 304 ? null : 'origin', { status });
      originAnswer = () => answer;
      assert.equal(await worker.fetch(navigation('/'), {}, context()), answer);
    });
  }

  for (const path of [
    '/api/content/home',
    '/api/donations/payment-details',
    '/mcp',
    '/mcp-photos',
    '/.well-known/oauth-authorization-server',
    '/actuator/health',
    '/media/0190a5f2-0000-7000-8000-000000000000',
    '/images/hero-1024.webp',
    '/receipt-fonts/body.0123456789abcdef.ttf',
  ]) {
    it(`when ${path} meets an outage, then its error passes through untouched`, async () => {
      const answer = new Response('down', { status: 502 });
      originAnswer = () => answer;
      assert.equal(await worker.fetch(navigation(path), {}, context()), answer);
    });
  }

  it('when a script or a fetch of the app meets an outage, then its error passes through', async () => {
    const answer = new Response('down', { status: 522 });
    originAnswer = () => answer;
    const script = new Request('https://nfnn.cz/main-ABCDEFGH.js', {
      headers: { accept: '*/*', 'sec-fetch-mode': 'cors' },
    });
    assert.equal(await worker.fetch(script, {}, context()), answer);
  });

  for (const headers of [
    { accept: 'text/html', 'sec-fetch-mode': 'cors' },
    { accept: 'text/html', 'sec-fetch-mode': 'no-cors' },
    {},
  ]) {
    it(`when a request with ${JSON.stringify(headers)} meets an outage, then its error passes through`, async () => {
      const answer = new Response('down', { status: 522 });
      originAnswer = () => answer;
      const request = new Request('https://nfnn.cz/aktuality', { headers });
      assert.equal(await worker.fetch(request, {}, context()), answer);
    });
  }

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    it(`when a ${method} to a page path meets an outage, then the error passes through`, async () => {
      const answer = new Response('down', { status: 502 });
      originAnswer = () => answer;
      const body = method === 'OPTIONS' ? undefined : 'x';
      const request = navigation('/kontakt', { method, body });
      assert.equal(await worker.fetch(request, {}, context()), answer);
    });
  }

  it('when a request passes, then the Worker forwards the very request it received', async () => {
    const request = navigation('/api/donors/auth/login', { method: 'POST', body: '{}' });
    await worker.fetch(request, {}, context());
    assert.equal(originRequests[0], request);
  });

  it('when the Worker runs, then it asks Cloudflare to pass the request to the origin if it fails itself', async () => {
    let passThrough = false;
    await worker.fetch(navigation('/'), {}, { passThroughOnException: () => (passThrough = true) });
    assert.equal(passThrough, true);
  });

  describe('when the fallback page is served', () => {
    it('then it is not stored anywhere, says when to try again and keeps crawlers away', async () => {
      const { response } = await fallbackPage();
      assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('retry-after'), '120');
      assert.equal(response.headers.get('x-robots-tag'), 'noindex');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('strict-transport-security'), 'max-age=63072000');
    });

    it('then its policy allows nothing but its own stylesheet, by hash', async () => {
      const { response, html } = await fallbackPage();
      const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
      assert.equal(styles.length, 1);
      const hash = createHash('sha256').update(styles[0]).digest('base64');
      assert.equal(
        response.headers.get('content-security-policy'),
        `default-src 'none'; style-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      );
    });

    it('then it is Czech and carries no script, inline style attribute or outside resource', async () => {
      const { html } = await fallbackPage();
      assert.match(html, /^<!doctype html>\n<html lang="cs">/);
      assert.doesNotMatch(html, /<script|\son\w+=|\sstyle=|<link|<img|<iframe|url\(/i);
      const links = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
      assert.deepEqual(links.sort(), ['/', 'mailto:info@nfnn.cz']);
    });

    it("then it names the foundation's account and IBAN as the payment details serve them", async () => {
      const { html } = await fallbackPage();
      assert.ok(html.includes(`>${served.account.number}<`), served.account.number);
      const grouped = served.account.iban.replace(/(.{4})(?=.)/g, '$1 ');
      assert.ok(html.includes(`>${grouped}<`), grouped);
      assert.ok(html.includes('info@nfnn.cz'));
    });

    it("then its QR code pays the foundation's donation without an amount and asks for an instant payment", async () => {
      const { html } = await fallbackPage();
      const svg = /<svg[^>]*class="qr"[\s\S]*?<\/svg>/.exec(html)?.[0];
      assert.ok(svg, 'a QR code drawn as inline SVG');
      const [header, version, ...fields] = decode(svg).split('*');
      assert.deepEqual([header, version], ['SPD', '1.0']);
      assert.deepEqual(Object.fromEntries(fields.map((field) => field.split(/:(.*)/s, 2))), {
        ACC: served.account.iban,
        CC: served.currency,
        PT: 'IP',
        RN: served.account.recipientName,
        MSG: served.messages.donation,
      });
      assert.match(svg, /role="img"/);
      assert.match(svg, /aria-label="[^"]+"/);
    });
  });
});
