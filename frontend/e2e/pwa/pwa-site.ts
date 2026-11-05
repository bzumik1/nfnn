import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  Dirent,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const FRONTEND = join(__dirname, '..', '..');
export const PROBE_WORKER = '/pwa-probe-sw.js';
export const PROBE_MANIFEST = '/pwa-probe.json';
export const MARKER = '/pwa-marker.txt';
export const VARIANTS = ['a', 'b'] as const;
export type Variant = (typeof VARIANTS)[number];

const SERVED = 'html';
const STARTUP_ATTEMPTS = 100;
const STARTUP_PAUSE_MS = 100;
const PORT_ATTEMPTS = 3;
export const CONTAINER_LABEL = 'nfnn-pwa';

export interface PwaSite {
  readonly url: string;
  readonly variant: Variant;
  switchTo(variant: Variant): void;
  remove(path: string): void;
  filesOnlyIn(variant: Variant): readonly string[];
  takeDown(): Promise<void>;
  bringUp(): Promise<void>;
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

export function builtDist(): string {
  return resolve(FRONTEND, process.env.E2E_DIST ?? 'dist/frontend/browser');
}

export function nginxImage(): string {
  const dockerfile = readFileSync(join(FRONTEND, 'Dockerfile'), 'utf8');
  const image = /^FROM (nginx:\S+)\s*$/m.exec(dockerfile)?.[1];
  if (image === undefined) {
    throw new Error('frontend/Dockerfile names no nginx base image');
  }
  return image;
}

function probeWorker(version: string, precache: readonly string[]): string {
  return `const VERSION = ${JSON.stringify(version)};
const CACHE = 'pwa-probe-' + VERSION;
const PRECACHE = ${JSON.stringify(precache)};
const NETWORK_ONLY = (url) => url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/mcp';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('message', (event) => {
  const reply = (answer) => event.ports[0] && event.ports[0].postMessage(answer);
  if (event.data === 'version') {
    reply({ version: VERSION });
  } else if (event.data === 'skip-waiting') {
    event.waitUntil(self.skipWaiting());
  } else if (event.data === 'log-error') {
    console.error('pwa probe worker error ' + VERSION);
  } else if (event.data && event.data.fetch) {
    event.waitUntil(
      fetch(event.data.fetch).then(
        (response) => response.text().then((body) => reply({ status: response.status, body })),
        (error) => reply({ failed: String(error) }),
      ),
    );
  }
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (NETWORK_ONLY(url)) {
    event.respondWith(fetch(event.request));
  } else if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
  } else {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
  }
});
`;
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const LATER_VARIANT_SECONDS = 60;

function writeVariantFile(folder: string, path: string, content: string, variant: Variant): void {
  const file = join(folder, path.slice(1));
  writeFileSync(file, content);
  const written = Math.floor(Date.now() / 1000) + VARIANTS.indexOf(variant) * LATER_VARIANT_SECONDS;
  utimesSync(file, written, written);
}

export function filesOf(folder: string): readonly string[] {
  return (readdirSync(folder, { recursive: true, withFileTypes: true }) as Dirent[])
    .filter((entry) => entry.isFile())
    .map((entry) => `/${relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/')}`)
    .sort();
}

export function writeProbeVariant(folder: string, variant: Variant): void {
  writeVariantFile(folder, MARKER, `${variant}\n`, variant);
  const precache = filesOf(folder).filter(
    (path) => path !== PROBE_WORKER && path !== PROBE_MANIFEST,
  );
  const hashes = Object.fromEntries(
    precache.map((path) => [path, sha256(readFileSync(join(folder, path.slice(1))))]),
  );
  const manifest = JSON.stringify({ files: hashes }, null, 2);
  const version = sha256(manifest).slice(0, 16);
  writeVariantFile(folder, PROBE_MANIFEST, manifest, variant);
  writeVariantFile(folder, PROBE_WORKER, probeWorker(version, precache), variant);
}

export function probeVersion(folder: string): string {
  return sha256(readFileSync(join(folder, PROBE_MANIFEST.slice(1)), 'utf8')).slice(0, 16);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address !== null
          ? resolve(address.port)
          : reject(new Error('no free port')),
      );
    });
  });
}

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilAnswering(url: string, container: string): Promise<void> {
  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt++) {
    if (await answers(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, STARTUP_PAUSE_MS));
  }
  const logs = await run('docker', ['logs', container]).catch((error: Error) => ({
    stdout: '',
    stderr: error.message,
  }));
  const tail = `${logs.stdout}${logs.stderr}`.split('\n').slice(-20).join('\n');
  throw new Error(`nginx in ${container} did not answer ${url}:\n${tail}`);
}

function servedLink(root: string, variant: Variant): void {
  const next = join(root, `${SERVED}.next`);
  rmSync(next, { force: true });
  symlinkSync(variant, next);
  renameSync(next, join(root, SERVED));
}

async function startContainer(root: string): Promise<{ port: number; container: string }> {
  for (let attempt = 1; ; attempt++) {
    const port = await freePort();
    const container = `nfnn-pwa-${port}`;
    try {
      await run('docker', [
        'run',
        '-d',
        '--name',
        container,
        '--label',
        CONTAINER_LABEL,
        '-p',
        `127.0.0.1:${port}:80`,
        '--add-host',
        'backend:127.0.0.1',
        '--add-host',
        'mcp:127.0.0.1',
        '-v',
        `${root}:/usr/share/nginx:ro`,
        '-v',
        `${join(FRONTEND, 'nginx.conf')}:/etc/nginx/conf.d/default.conf:ro`,
        '-v',
        `${join(FRONTEND, 'nginx-security-headers.conf')}:/etc/nginx/snippets/security-headers.conf:ro`,
        '--tmpfs',
        '/logs',
        nginxImage(),
      ]);
      return { port, container };
    } catch (error) {
      await run('docker', ['rm', '-f', container]).catch(() => undefined);
      if (
        attempt >= PORT_ATTEMPTS ||
        !/port is already allocated|address already in use/i.test(String(error))
      ) {
        throw error;
      }
    }
  }
}

export async function startPwaSite(dist: string): Promise<PwaSite> {
  if (!existsSync(join(dist, 'index.html'))) {
    throw new Error(
      `The pwa project serves the production build, and ${dist} has no index.html: run npm run build first (or set E2E_DIST)`,
    );
  }
  const root = mkdtempSync(join(tmpdir(), 'nfnn-pwa-'));
  chmodSync(root, 0o755);
  const stash = join(root, 'removed');
  mkdirSync(stash);
  for (const variant of VARIANTS) {
    cpSync(dist, join(root, variant), { recursive: true });
    writeProbeVariant(join(root, variant), variant);
  }
  servedLink(root, 'a');
  const { port, container } = await startContainer(root);
  const url = `http://localhost:${port}`;
  let current: Variant = 'a';
  const removed: { from: string; kept: string }[] = [];
  const site: PwaSite = {
    url,
    get variant() {
      return current;
    },
    switchTo(variant) {
      servedLink(root, variant);
      current = variant;
    },
    remove(path) {
      const from = join(root, current, path.replace(/^\//, ''));
      const kept = join(stash, `${removed.length}`);
      renameSync(from, kept);
      removed.push({ from, kept });
    },
    filesOnlyIn(variant) {
      const other = variant === 'a' ? 'b' : 'a';
      return filesOf(join(root, variant)).filter((path) => {
        const mine = join(root, variant, path.slice(1));
        const theirs = join(root, other, path.slice(1));
        return !existsSync(theirs) || !readFileSync(theirs).equals(readFileSync(mine));
      });
    },
    async takeDown() {
      await run('docker', ['stop', '--time', '0', container]);
    },
    async bringUp() {
      await run('docker', ['start', container]);
      await waitUntilAnswering(`${url}/`, container);
    },
    async reset() {
      for (const { from, kept } of removed.splice(0).reverse()) {
        mkdirSync(dirname(from), { recursive: true });
        renameSync(kept, from);
      }
      site.switchTo('a');
      if (!(await answers(`${url}/`))) {
        await site.bringUp();
      }
    },
    async dispose() {
      await run('docker', ['rm', '-f', container]).catch(() => undefined);
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        return;
      }
    },
  };
  try {
    await waitUntilAnswering(`${url}/`, container);
  } catch (error) {
    await site.dispose();
    throw error;
  }
  return site;
}
