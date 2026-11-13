import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAYMENT_ROUTE_SCRIPT = readFileSync(
  new URL('../service-worker/payment-route.js', import.meta.url),
  'utf8',
);

export const APP_BADGE_SCRIPT = readFileSync(
  new URL('../service-worker/app-badge.js', import.meta.url),
  'utf8',
);

export const WORKER_PREFIX = PAYMENT_ROUTE_SCRIPT + APP_BADGE_SCRIPT;

const WORKER = 'ngsw-worker.js';
const MANIFEST = 'ngsw.json';

export function wrapServiceWorker(file) {
  const worker = readFileSync(file, 'utf8');
  if (worker.startsWith(WORKER_PREFIX)) {
    return false;
  }
  writeFileSync(file, WORKER_PREFIX + worker);
  return true;
}

export function wrapServiceWorkers(dist) {
  if (!existsSync(dist)) {
    return [];
  }
  return readdirSync(dist, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(dist, entry.name, 'browser', WORKER))
    .filter((file) => existsSync(file) && wrapServiceWorker(file));
}

export function unwrappedServiceWorkers(dist) {
  if (!existsSync(dist)) {
    return [];
  }
  return readdirSync(dist, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(dist, entry.name, 'browser'))
    .filter((browser) => existsSync(join(browser, MANIFEST)))
    .map((browser) => join(browser, WORKER))
    .filter((file) => !existsSync(file) || !readFileSync(file, 'utf8').startsWith(WORKER_PREFIX));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  for (const file of wrapServiceWorkers(dist)) {
    console.log(`Payment route and badge added to ${file}`);
  }
  const unwrapped = unwrappedServiceWorkers(dist);
  if (unwrapped.length > 0) {
    console.error(
      `A build with ngsw.json has no service worker with the payment route and the badge: ${unwrapped.join(', ')}`,
    );
    process.exit(1);
  }
}
