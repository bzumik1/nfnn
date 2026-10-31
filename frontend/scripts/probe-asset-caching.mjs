import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const [baseUrl, distDir, nginxConf] = process.argv.slice(2);
if (!baseUrl || !distDir || !nginxConf) {
  console.error('usage: node scripts/probe-asset-caching.mjs <base-url> <dist-dir> <nginx.conf>');
  process.exit(2);
}

const IMMUTABLE = 'public, max-age=31536000, immutable';
const HASHED_BUNDLE = /^(?:chunk|main|polyfills|styles|worker)-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
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
];
const IMMUTABLE_RULE = 'add_header Cache-Control $immutable_cache_control always;';
const UNCACHED_ERROR = new Set(['no-store', 'no-cache']);
const APP_ROUTES = ['/', '/darce/prehled', '/sprava', '/aktuality/nejaka-zprava'];

const failures = [];
const fail = (message) => failures.push(message);

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [relative(distDir, path)];
  });
}

function expectedCacheControl(file) {
  if (file.startsWith('media/') || HASHED_BUNDLE.test(file)) {
    return IMMUTABLE;
  }
  if (file.startsWith('images/') || file.startsWith('receipt-fonts/')) {
    return 'public, max-age=3600';
  }
  return 'no-cache';
}

function expectedContentType(file) {
  return file.endsWith('.ttf') ? 'font/ttf' : null;
}

function immutableLocationPatterns(conf) {
  return [...conf.matchAll(/location\s+~\*?\s+"([^"]+)"\s*\{([^{}]*)\}/g)]
    .filter((match) => match[2].split('\n').some((line) => line.trim() === IMMUTABLE_RULE))
    .map((match) => new RegExp(match[1]));
}

async function request(path) {
  const response = await fetch(new URL(path, baseUrl), { redirect: 'manual' });
  const body = await response.text();
  return {
    status: response.status,
    cacheControl: response.headers.get('cache-control') ?? '',
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

const patterns = immutableLocationPatterns(readFileSync(nginxConf, 'utf8'));
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
  const contentType = expectedContentType(file);
  if (contentType !== null && answer.contentType !== contentType) {
    fail(`/${file} has Content-Type "${answer.contentType}", expected "${contentType}"`);
  }
  if (contentType !== null && answer.contentEncoding !== 'gzip') {
    fail(`/${file} is sent without gzip ("${answer.contentEncoding}")`);
  }
  if (!answer.csp) {
    fail(`/${file} carries no Content-Security-Policy`);
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
  if (!answer.csp) {
    fail(`missing ${path} carries no Content-Security-Policy`);
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
  `asset caching: ${hashed.length} hashed bundles immutable, ${built.length} built files checked, missing files answer 404`,
);
