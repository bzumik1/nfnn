import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

function policyOf(snippet) {
  const header = snippet.match(/add_header Content-Security-Policy "([^"]+)" always;/);
  assert.ok(header, 'the snippet sets a Content-Security-Policy');
  return Object.fromEntries(
    header[1]
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources]),
  );
}

describe('Given the security headers of the frontend nginx', () => {
  const policy = policyOf(
    readFileSync(new URL('../nginx-security-headers.conf', import.meta.url), 'utf8'),
  );

  it('when its scripts are read, then only the site runs them and only WebAssembly may be compiled, never eval or inline script', () => {
    assert.deepEqual(policy['script-src'], ["'self'", "'wasm-unsafe-eval'"]);
  });

  it('when every directive is read, then none allows unsafe-eval and the fallback and plugins stay closed', () => {
    for (const [name, sources] of Object.entries(policy)) {
      assert.ok(!sources.includes("'unsafe-eval'"), `${name} allows 'unsafe-eval'`);
    }
    assert.deepEqual(policy['default-src'], ["'self'"]);
    assert.deepEqual(policy['object-src'], ["'none'"]);
  });
});
