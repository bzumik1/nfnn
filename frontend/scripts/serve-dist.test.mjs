import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkoutMarkerPath } from './dev-port.mjs';
import { readSecurityHeaders } from './security-headers.mjs';

const SCRIPT = fileURLToPath(new URL('./serve-dist.mjs', import.meta.url));
const CHECKOUT_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.on('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

function serving(server) {
  return new Promise((done, fail) => {
    server.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Serving')) {
        done();
      }
    });
    server.on('exit', (code) => fail(new Error(`serve-dist exited with ${code}`)));
  });
}

describe('Given the e2e server serving a build of this checkout', () => {
  let server;
  let origin;

  before(async () => {
    const dist = mkdtempSync(join(tmpdir(), 'nfnn-serve-dist-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>app</title>');
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [SCRIPT, dist, String(port)], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await serving(server);
  });

  after(() => {
    server.removeAllListeners('exit');
    server.kill();
  });

  it("when the checkout's own marker is asked for, then it answers 200, so Playwright may reuse it", async () => {
    const answer = await fetch(origin + checkoutMarkerPath(CHECKOUT_ROOT));

    assert.equal(answer.status, 200);
  });

  it("when the checkout's own marker is answered, then it carries the security headers of every answer and names no path", async () => {
    const answer = await fetch(origin + checkoutMarkerPath(CHECKOUT_ROOT));

    for (const [name, value] of Object.entries(readSecurityHeaders())) {
      assert.equal(answer.headers.get(name), value, name);
    }
    assert.equal(answer.headers.get('cache-control'), 'no-store');
    assert.equal(await answer.text(), 'ok');
  });

  it("when another checkout's marker is asked for, then it answers 404, so Playwright never reuses it", async () => {
    const answer = await fetch(origin + checkoutMarkerPath('/somewhere/else/nfnn-web'));

    assert.equal(answer.status, 404);
  });
});
