import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Generator } from '@angular/service-worker/config';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../ngsw-config.json', import.meta.url), 'utf8'));
const SITE = 'https://nfnn.cz';
const DAY = 24 * 60 * 60 * 1000;

const ALLOWED_DATA = {
  'public-content': [
    '/api/content/home',
    '/api/content/news',
    '/api/content/news?page=0&size=6',
    '/api/content/news/vylet-do-zoo',
    '/api/content/projects',
    '/api/content/projects?page=1&size=12',
    '/api/content/projects/novy-voziky',
  ],
  'payment-details': ['/api/donations/payment-details'],
  'public-photos': [
    '/api/content/media/0192f4d2-1a6b-7c3d-9e8f-001122334455?w=640',
    '/api/content/media/0192f4d2-1a6b-7c3d-9e8f-001122334455',
  ],
};

const NEVER_CACHED = [
  '/api/donations/me',
  '/api/donations/me/summary',
  '/api/donations/me/receipts',
  '/api/donations/me/receipt-images/abc',
  '/api/donations/receipt-keys',
  '/api/donations/receipts/status',
  '/api/donors/me',
  '/api/donors/auth/refresh',
  '/api/admin/content/news',
  '/api/admin/content/news/1',
  '/api/admin/content/projects',
  '/api/admin/content/media/1',
  '/api/admin/donations/overview',
  '/api/operations/setup',
  '/api/operations/client-errors',
  '/api/content/home/../../donations/me',
  '/mcp',
  '/.well-known/oauth-authorization-server',
];

async function generatedManifest() {
  const empty = { list: async () => [], read: async () => '', hash: async () => '' };
  return new Generator(empty, '/').process(config);
}

function dataGroupOf(manifest, path) {
  const url = new URL(path, SITE).href;
  return (
    manifest.dataGroups.find((group) =>
      group.patterns.some((pattern) => new RegExp(pattern).test(url)),
    )?.name ?? null
  );
}

function isNavigation(manifest, path) {
  const include = manifest.navigationUrls.filter((spec) => spec.positive);
  const exclude = manifest.navigationUrls.filter((spec) => !spec.positive);
  const bare = path.replace(/[?#].*$/, '');
  return (
    include.some((spec) => new RegExp(spec.regex).test(bare)) &&
    !exclude.some((spec) => new RegExp(spec.regex).test(bare))
  );
}

function apiPathsOfTheApp() {
  const sources = globSync('src/app/**/*.ts', { cwd: frontend }).filter(
    (file) => !file.endsWith('.spec.ts') && !file.includes('/testing/'),
  );
  const paths = new Set();
  for (const file of sources) {
    const text = readFileSync(`${frontend}/${file}`, 'utf8');
    for (const [, path] of text.matchAll(/['`](\/api\/[^'`$]*)/g)) {
      paths.add(path);
    }
  }
  return [...paths].sort();
}

const PUBLIC_PREFIXES = [
  '/api/content/home',
  '/api/content/news',
  '/api/content/projects',
  '/api/content/media/',
  '/api/donations/payment-details',
];

function isPublic(path) {
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

describe('Given the service worker configuration', () => {
  it('when its data groups are read, then the public content is shown from its copy and refreshed behind it, the payment details wait a second for the network and are kept for at most a day, and the photos are kept, at most 300', async () => {
    const manifest = await generatedManifest();

    assert.deepEqual(
      manifest.dataGroups.map(({ name, strategy, maxSize, maxAge, timeoutMs, refreshAheadMs }) => ({
        name,
        strategy,
        maxSize,
        maxAge,
        timeoutMs,
        refreshAheadMs,
      })),
      [
        {
          name: 'public-content',
          strategy: 'performance',
          maxSize: 100,
          maxAge: 30 * DAY,
          timeoutMs: 5_000,
          refreshAheadMs: 0,
        },
        {
          name: 'payment-details',
          strategy: 'freshness',
          maxSize: 1,
          maxAge: DAY,
          timeoutMs: 1_000,
          refreshAheadMs: undefined,
        },
        {
          name: 'public-photos',
          strategy: 'performance',
          maxSize: 300,
          maxAge: 365 * DAY,
          timeoutMs: undefined,
          refreshAheadMs: undefined,
        },
      ],
    );
  });

  for (const [group, paths] of Object.entries(ALLOWED_DATA)) {
    for (const path of paths) {
      it(`when the app asks for ${path}, then the group ${group} keeps the answer`, async () => {
        assert.equal(dataGroupOf(await generatedManifest(), path), group);
      });
    }
  }

  for (const path of NEVER_CACHED) {
    it(`when the app asks for ${path}, then no data group keeps the answer`, async () => {
      assert.equal(dataGroupOf(await generatedManifest(), path), null);
    });
  }

  it('when every API path the app spells out is matched, then only the allowed public ones fall into a data group', async () => {
    const manifest = await generatedManifest();
    const paths = apiPathsOfTheApp();
    assert.ok(paths.length > 30, `the app spells out ${paths.length} API paths`);

    const kept = paths.filter((path) => dataGroupOf(manifest, path) !== null);

    assert.deepEqual(
      kept.filter((path) => !isPublic(path)),
      [],
    );
  });

  for (const path of [
    '/',
    '/darce/prehled',
    '/sprava/nastaveni',
    '/aplikace',
    '/overit',
    '/aktuality/vylet',
  ]) {
    it(`when ${path} is opened, then the worker answers it with the app page`, async () => {
      assert.equal(isNavigation(await generatedManifest(), path), true);
    });
  }

  for (const path of [
    '/api/donations/me',
    '/mcp',
    '/mcp-photos',
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-protected-resource/mcp',
    '/actuator/health',
    '/media/obrazek',
    '/robots.txt',
  ]) {
    it(`when ${path} is opened, then the worker leaves it to the server`, async () => {
      assert.equal(isNavigation(await generatedManifest(), path), false);
    });
  }

  it('when the asset groups are read, then none of them names an API, connector or worker path', () => {
    const files = config.assetGroups.flatMap((group) => group.resources.files ?? []);
    const urls = config.assetGroups.flatMap((group) => group.resources.urls ?? []);

    assert.deepEqual(urls, []);
    assert.deepEqual(
      files.filter((file) => /^\/(?:api|mcp|\.well-known|actuator)|ngsw/.test(file)),
      [],
    );
  });

  it('when a navigation is handled, then the worker answers from the cached app page without waiting for the network', () => {
    assert.equal(config.navigationRequestStrategy, 'performance');
    assert.equal(config.index, '/index.html');
  });

  it('when the build is listed, then the app shell with its fonts, logos and launch icon is kept at install, photos, icons and the receipt files only once asked for, and the worker files never', async () => {
    const shell = [
      '/index.html',
      '/boot-guard.js',
      '/manifest.webmanifest',
      '/favicon.svg',
      '/launch-icon.svg',
      '/images/logo.svg',
      '/images/logo-on-dark.svg',
      '/main-ABCDEFGH.js',
      '/polyfills-ABCDEFGH.js',
      '/chunk-ABCDEFGH.js',
      '/styles-ABCDEFGH.css',
      '/media/inter-latin-wght-normal-NRMW37G5.woff2',
    ];
    const later = [
      '/worker-ABCDEFGH.js',
      '/receipt-fonts/body.0123456789abcdef.ttf',
      '/images/hero-1024.webp',
      '/icon-192.png',
      '/icon-512.png',
      '/apple-touch-icon.png',
      '/favicon.ico',
      '/robots.txt',
      '/sitemap.xml',
    ];
    const never = ['/ngsw-worker.js', '/safety-worker.js', '/ngsw.json', '/startup/750x1334.png'];
    const listed = {
      list: async () => [...shell, ...later, ...never],
      read: async () => '',
      hash: async () => 'h',
    };

    const manifest = await new Generator(listed, '/').process(config);
    const groupOf = (path) =>
      manifest.assetGroups.find((group) => group.urls.includes(path))?.installMode ?? 'none';

    assert.deepEqual(
      Object.fromEntries(shell.map((path) => [path, groupOf(path)])),
      Object.fromEntries(shell.map((path) => [path, 'prefetch'])),
    );
    assert.deepEqual(
      Object.fromEntries(later.map((path) => [path, groupOf(path)])),
      Object.fromEntries(later.map((path) => [path, 'lazy'])),
    );
    assert.deepEqual(
      Object.fromEntries(never.map((path) => [path, groupOf(path)])),
      Object.fromEntries(never.map((path) => [path, 'none'])),
    );
  });
});
