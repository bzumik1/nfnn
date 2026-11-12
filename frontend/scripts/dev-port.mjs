import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export const CI_PORT = 4200;
export const DERIVED_PORT_RANGE = { first: 42000, last: 48999 };

export function devPort({ root, env = process.env }) {
  const chosen = env.NFNN_DEV_PORT;
  if (chosen !== undefined && chosen !== '') {
    return chosenPort(chosen);
  }
  if (env.CI) {
    return CI_PORT;
  }
  return derivedPort(root);
}

function chosenPort(value) {
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(`NFNN_DEV_PORT must be a port number from 1 to 65535, not "${value}"`);
  }
  return port;
}

export function checkoutMarkerPath(root) {
  return `/__nfnn-checkout/${rootDigest(root).toString('hex')}`;
}

function derivedPort(root) {
  const digest = rootDigest(root);
  const size = DERIVED_PORT_RANGE.last - DERIVED_PORT_RANGE.first + 1;
  return DERIVED_PORT_RANGE.first + (digest.readUInt32BE(0) % size);
}

function rootDigest(root) {
  return createHash('sha256').update(canonicalPath(root)).digest();
}

function canonicalPath(root) {
  try {
    return realpathSync.native(root);
  } catch {
    return resolve(root);
  }
}
