import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cspDirectives, parseSecurityHeaders, readSecurityHeaders } from './security-headers.mjs';

describe('Given an nginx snippet of security headers', () => {
  it('when it is read, then every add_header line becomes a header with its value', () => {
    const snippet = `
      add_header X-Content-Type-Options "nosniff" always;
      add_header Content-Security-Policy "default-src 'self'; object-src 'none'" always;
    `;

    assert.deepEqual(parseSecurityHeaders(snippet), {
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; object-src 'none'",
    });
  });

  it('when a line is not an add_header with a quoted value and always, then the snippet is refused, so the e2e server never runs without a header nginx sends', () => {
    assert.throws(
      () => parseSecurityHeaders('add_header X-Frame-Options SAMEORIGIN;'),
      /add_header/,
    );
  });

  it('when a policy is split into directives, then each names its sources in order', () => {
    const directives = cspDirectives(
      "default-src 'self'; img-src 'self' data:;  trusted-types a b",
    );

    assert.deepEqual(
      [...directives],
      [
        ['default-src', ["'self'"]],
        ['img-src', ["'self'", 'data:']],
        ['trusted-types', ['a', 'b']],
      ],
    );
  });

  it('when a directive is named twice, then the policy is refused, because the browser would ignore the second', () => {
    assert.throws(() => cspDirectives("script-src 'self'; script-src 'none'"), /script-src/);
  });
});

describe('Given the security headers the frontend nginx sends', () => {
  const policy = cspDirectives(readSecurityHeaders()['Content-Security-Policy']);

  it('when a page assigns a string to a script sink, then Trusted Types refuse it', () => {
    assert.deepEqual(policy.get('require-trusted-types-for'), ["'script'"]);
  });

  it('when a policy is created, then only the site policy for worker addresses and Angular own policy are allowed, each once', () => {
    assert.deepEqual(policy.get('trusted-types'), ['default', 'angular']);
  });

  it('when a worker or the web app manifest is loaded, then only the site itself may serve it', () => {
    assert.deepEqual(policy.get('worker-src'), ["'self'"]);
    assert.deepEqual(policy.get('manifest-src'), ["'self'"]);
  });

  it('when scripts and workers are loaded, then no eval, inline script, blob or data address is allowed', () => {
    for (const directive of ['default-src', 'script-src', 'worker-src']) {
      for (const source of ["'unsafe-eval'", "'unsafe-inline'", 'blob:', 'data:', '*']) {
        assert.ok(!policy.get(directive).includes(source), `${directive} must not allow ${source}`);
      }
    }
    assert.deepEqual(policy.get('script-src'), ["'self'"]);
  });

  it('when a plugin or a frame of another site is asked for, then nothing is allowed', () => {
    assert.deepEqual(policy.get('object-src'), ["'none'"]);
    assert.deepEqual(policy.get('frame-ancestors'), ["'self'"]);
    assert.deepEqual(policy.get('base-uri'), ["'self'"]);
  });
});
