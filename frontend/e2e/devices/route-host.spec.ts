import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, testWithoutBrowser as test } from '../fixtures';
import { RouteHost } from './route-host';

interface Exchange {
  head: string;
  closedByHost: boolean;
}

function postOverKeepAlive(baseUrl: string, path: string): Promise<Exchange> {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((done, failed) => {
    const socket = connect(Number(port), hostname);
    let received = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => (received += chunk));
    socket.on('error', failed);
    socket.on('end', () => done({ head: received.split('\r\n\r\n')[0], closedByHost: true }));
    socket.on('connect', () =>
      socket.write(
        `POST ${path} HTTP/1.1\r\nHost: ${hostname}:${port}\r\nConnection: keep-alive\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}`,
      ),
    );
  });
}

test.describe('Given the host that serves the app and its mocks to Safari', () => {
  let folder: string;
  let host: RouteHost;
  let baseUrl: string;

  test.beforeEach(async () => {
    folder = mkdtempSync(join(tmpdir(), 'nfnn-route-host-'));
    writeFileSync(join(folder, 'index.html'), '<!doctype html><html><head></head></html>');
    host = new RouteHost(folder);
    baseUrl = await host.start();
  });

  test.afterEach(async () => {
    await host.stop();
    rmSync(folder, { recursive: true, force: true });
  });

  test('when Safari asks over a connection it would keep open, then the host answers and closes it, so no later request lands on a connection the host is closing', async () => {
    await host.routes.route('**/api/admin/unlock', (route) => route.fulfill({ status: 204 }));

    const exchange = await postOverKeepAlive(baseUrl, '/api/admin/unlock');

    expect(exchange.head).toMatch(/^HTTP\/1\.1 204 /);
    expect(exchange.head.toLowerCase()).toContain('connection: close');
    expect(exchange.closedByHost).toBe(true);
  });
});
