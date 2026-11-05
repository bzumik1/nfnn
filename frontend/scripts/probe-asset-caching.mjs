import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { immutableLocations } from './immutable-locations.mjs';
import { readSecurityHeaders } from './security-headers.mjs';

const [baseUrl, distDir, nginxConf] = process.argv.slice(2);
if (!baseUrl || !distDir || !nginxConf) {
  console.error('usage: node scripts/probe-asset-caching.mjs <base-url> <dist-dir> <nginx.conf>');
  process.exit(2);
}

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHELL_AT_EDGE = 'max-age=0, stale-if-error=604800';
const HOURLY_AT_EDGE = 'max-age=3600, stale-if-error=604800';
const CONTENT_SECURITY_POLICY = readSecurityHeaders()['Content-Security-Policy'];
const HASHED_BUNDLE = /^(?:chunk|main|polyfills|styles|worker)-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
const HASHED_RECEIPT_FONT = /^receipt-fonts\/(?:body|body-bold|heading)\.[0-9a-f]{16}\.ttf$/;
const NEVER_IMMUTABLE = [
  'index.html',
  'ngsw.json',
  'ngsw-worker.js',
  'safety-worker.js',
  'worker-basic.min.js',
  'manifest.webmanifest',
  'manifest.json',
  'favicon.ico',
  'robots.txt',
  'nested/chunk-ABCDEFGH.js',
  'ngsw-ABCDEFGH.js',
];
const MISSING_HASHED = [
  '/chunk-Zz_-9aBc.js',
  '/chunk-ZZZZZZZZ.js',
  '/styles-Ab-c_D12.css',
  '/worker-Zz_-9aBc.js',
];
const MISSING_ASSETS = [
  '/missing-probe.js',
  '/favicon-missing.png',
  '/ngsw.json',
  '/ngsw-worker.js',
  '/manifest.webmanifest',
  '/fonts/missing-probe.woff2',
  '/images/missing-probe.webp',
  '/media/missing-probe.woff2',
  '/receipt-fonts/missing-probe.ttf',
  '/receipt-fonts/body.0123456789abcdef.ttf',
  '/receipt-fonts/body.ttf',
];
const UNCACHED_ERROR = new Set(['no-store', 'no-cache']);
const APP_ROUTES = ['/', '/overit', '/darce/prehled', '/sprava', '/aktuality/nejaka-zprava'];

const failures = [];
const fail = (message) => failures.push(message);

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [relative(distDir, path)];
  });
}

function expectedCacheControl(file) {
  if (file.startsWith('media/') || HASHED_BUNDLE.test(file) || HASHED_RECEIPT_FONT.test(file)) {
    return IMMUTABLE;
  }
  if (file.startsWith('images/') || file.startsWith('receipt-fonts/')) {
    return 'public, max-age=3600';
  }
  return 'no-cache';
}

function expectedEdgeCacheControl(file) {
  const browser = expectedCacheControl(file);
  if (browser === 'no-cache') {
    return SHELL_AT_EDGE;
  }
  return browser === IMMUTABLE ? '' : HOURLY_AT_EDGE;
}

function expectedContentType(file) {
  return file.endsWith('.ttf') ? 'font/ttf' : null;
}

async function request(path, headers = {}) {
  const response = await fetch(new URL(path, baseUrl), { redirect: 'manual', headers });
  const body = await response.text();
  return {
    status: response.status,
    cacheControl: response.headers.get('cache-control') ?? '',
    edge: response.headers.get('cloudflare-cdn-cache-control') ?? '',
    validator: response.headers.get('etag') ?? response.headers.get('last-modified') ?? '',
    contentType: response.headers.get('content-type') ?? '',
    contentEncoding: response.headers.get('content-encoding') ?? '',
    csp: response.headers.get('content-security-policy') ?? '',
    server: response.headers.get('server') ?? '',
    body,
  };
}

const built = files(distDir).sort();
const hashed = built.filter((file) => HASHED_BUNDLE.test(file));
if (hashed.length === 0) {
  fail(`no hashed bundle found in ${distDir}`);
}

const { bundles: patterns, receiptFonts: fontPatterns } = immutableLocations(
  readFileSync(nginxConf, 'utf8'),
);
const receiptFonts = built.filter(
  (file) => file.startsWith('receipt-fonts/') && file.endsWith('.ttf'),
);
if (receiptFonts.length === 0) {
  fail(`no receipt font found in ${distDir}`);
}
for (const file of receiptFonts) {
  if (!HASHED_RECEIPT_FONT.test(file)) {
    fail(`the receipt font /${file} carries no content hash in its name`);
  }
}
if (fontPatterns.length !== 1) {
  fail(
    `expected one regex location with the immutable rule for /receipt-fonts/, found ${fontPatterns.length}`,
  );
} else {
  const [pattern] = fontPatterns;
  for (const file of receiptFonts) {
    if (!pattern.test(`/${file}`)) {
      fail(`the receipt font rule ${pattern} does not match the built file /${file}`);
    }
  }
  for (const path of ['/receipt-fonts/body.ttf', '/receipt-fonts/OFL-inter.txt']) {
    if (pattern.test(path)) {
      fail(`the receipt font rule ${pattern} matches ${path}, which must not be immutable`);
    }
  }
}
if (patterns.length !== 1) {
  fail(
    `expected one regex location with the immutable rule in ${nginxConf}, found ${patterns.length}`,
  );
} else {
  const [pattern] = patterns;
  for (const file of hashed) {
    if (!pattern.test(`/${file}`)) {
      fail(`the immutable rule ${pattern} does not match the built file /${file}`);
    }
  }
  for (const name of NEVER_IMMUTABLE) {
    if (pattern.test(`/${name}`)) {
      fail(`the immutable rule ${pattern} matches /${name}, which must stay revalidated`);
    }
  }
}

for (const file of built) {
  const answer = await request(`/${file}`);
  const expected = expectedCacheControl(file);
  if (answer.status !== 200) {
    fail(`/${file} answered ${answer.status}`);
  }
  if (answer.cacheControl !== expected) {
    fail(`/${file} has Cache-Control "${answer.cacheControl}", expected "${expected}"`);
  }
  const edge = expectedEdgeCacheControl(file);
  if (answer.edge !== edge) {
    fail(`/${file} has Cloudflare-CDN-Cache-Control "${answer.edge}", expected "${edge}"`);
  }
  if (edge !== '' && answer.validator === '') {
    fail(`/${file} carries neither ETag nor Last-Modified, so Cloudflare cannot revalidate it`);
  }
  const contentType = expectedContentType(file);
  if (contentType !== null && answer.contentType !== contentType) {
    fail(`/${file} has Content-Type "${answer.contentType}", expected "${contentType}"`);
  }
  if (contentType !== null && answer.contentEncoding !== 'gzip') {
    fail(`/${file} is sent without gzip ("${answer.contentEncoding}")`);
  }
  if (answer.csp !== CONTENT_SECURITY_POLICY) {
    fail(`/${file} carries the Content-Security-Policy "${answer.csp}", not the snippet's`);
  }
  if (answer.server !== 'nginx') {
    fail(`/${file} names the server as "${answer.server}", expected "nginx" without its version`);
  }
}

for (const path of [...MISSING_HASHED, ...MISSING_ASSETS]) {
  if (built.includes(path.slice(1))) {
    continue;
  }
  const answer = await request(path);
  if (answer.status !== 404) {
    fail(`missing ${path} answered ${answer.status} ${answer.contentType}, expected 404`);
  }
  if (answer.body.includes('<app-root')) {
    fail(`missing ${path} answered with the app's index.html`);
  }
  if (!UNCACHED_ERROR.has(answer.cacheControl)) {
    fail(`missing ${path} answered with "${answer.cacheControl}", so its 404 could be kept`);
  }
  if (answer.edge !== '' && answer.edge !== 'no-store') {
    fail(
      `missing ${path} answered with Cloudflare-CDN-Cache-Control "${answer.edge}", so Cloudflare could keep its 404`,
    );
  }
  if (answer.csp !== CONTENT_SECURITY_POLICY) {
    fail(`missing ${path} carries the Content-Security-Policy "${answer.csp}", not the snippet's`);
  }
}

for (const path of APP_ROUTES) {
  const answer = await request(path);
  if (answer.status !== 200 || !answer.body.includes('<app-root')) {
    fail(`the app route ${path} answered ${answer.status} without the app`);
  }
  if (answer.cacheControl !== 'no-cache') {
    fail(`the app route ${path} has Cache-Control "${answer.cacheControl}", expected "no-cache"`);
  }
  if (answer.edge !== SHELL_AT_EDGE) {
    fail(
      `the app route ${path} has Cloudflare-CDN-Cache-Control "${answer.edge}", expected "${SHELL_AT_EDGE}", so Cloudflare could not serve it during an outage`,
    );
  }
  if (answer.validator === '') {
    fail(`the app route ${path} carries neither ETag nor Last-Modified`);
  }
  if (answer.csp !== CONTENT_SECURITY_POLICY) {
    fail(
      `the app route ${path} carries the Content-Security-Policy "${answer.csp}", not the snippet's`,
    );
  }
}

const revalidated = ['/', `/${built.find((file) => file.startsWith('images/'))}`];
for (const path of revalidated) {
  const first = await request(path, { 'accept-encoding': 'gzip' });
  const again = await request(path, {
    'accept-encoding': 'gzip',
    'if-none-match': first.validator,
  });
  if (again.status !== 304) {
    fail(`${path} answered ${again.status} to If-None-Match with its own ETag, expected 304`);
  }
  if (again.edge !== first.edge || first.edge === '') {
    fail(
      `${path} lost its Cloudflare-CDN-Cache-Control on the 304 ("${again.edge}", the 200 had "${first.edge}")`,
    );
  }
}

const api = await request('/api/probe-Zz_-9aBc.js');
if (api.cacheControl.includes('immutable') || api.body.includes('<app-root')) {
  fail(`/api/probe-Zz_-9aBc.js was answered by the static files, not by the backend`);
}

if (failures.length > 0) {
  for (const message of failures) {
    console.error(`::error::${message}`);
  }
  console.error(`${failures.length} asset caching check(s) failed`);
  process.exit(1);
}
console.log(
  `asset caching: ${hashed.length} hashed bundles and ${receiptFonts.length} receipt fonts immutable, ${built.length} built files checked, the app shell and the hourly files served stale by Cloudflare during an outage, missing files answer 404`,
);
