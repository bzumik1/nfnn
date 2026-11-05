import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAYMENT_ROUTE_SCRIPT = readFileSync(
  new URL('../service-worker/payment-route.js', import.meta.url),
  'utf8',
);

const WORKER = 'ngsw-worker.js';

export function wrapServiceWorker(file) {
  const worker = readFileSync(file, 'utf8');
  if (worker.startsWith(PAYMENT_ROUTE_SCRIPT)) {
    return false;
  }
  writeFileSync(file, PAYMENT_ROUTE_SCRIPT + worker);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  for (const file of wrapServiceWorkers(dist)) {
    console.log(`Payment route added to ${file}`);
  }
}
