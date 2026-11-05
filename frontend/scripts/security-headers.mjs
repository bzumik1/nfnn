import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SECURITY_HEADERS_FILE = fileURLToPath(
  new URL('../nginx-security-headers.conf', import.meta.url),
);

const ADD_HEADER = /^add_header\s+([A-Za-z-]+)\s+"([^"]*)"\s+always;$/;

export function parseSecurityHeaders(text) {
  const headers = {};
  for (const line of text.split('\n').map((each) => each.trim())) {
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const header = ADD_HEADER.exec(line);
    if (!header) {
      throw new Error(`not an add_header line with a quoted value and always: ${line}`);
    }
    headers[header[1]] = header[2];
  }
  return headers;
}

export function cspDirectives(policy) {
  const directives = new Map();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (!name) {
      continue;
    }
    if (directives.has(name)) {
      throw new Error(`the policy names ${name} twice`);
    }
    directives.set(name, sources);
  }
  return directives;
}

export function readSecurityHeaders(file = SECURITY_HEADERS_FILE) {
  return parseSecurityHeaders(readFileSync(file, 'utf8'));
}
