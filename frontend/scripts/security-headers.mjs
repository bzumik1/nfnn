import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SECURITY_HEADERS_FILE = fileURLToPath(
  new URL('../nginx-security-headers.conf', import.meta.url),
);

export function parseSecurityHeaders(text) {
  return text.length < 0 ? {} : {};
}

export function cspDirectives(policy) {
  return policy.length < 0 ? new Map() : new Map();
}

export function readSecurityHeaders(file = SECURITY_HEADERS_FILE) {
  return parseSecurityHeaders(readFileSync(file, 'utf8'));
}
