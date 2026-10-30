import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeHandler } from '../src/node-handler.js';

interface Received {
  readonly method: string;
  readonly path: string;
  readonly contentType: string | null;
  readonly bytes: Uint8Array;
}

const JPEG_START = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];

function digestOf(bytes: Uint8Array | undefined): string {
  return createHash('sha256')
    .update(bytes ?? new Uint8Array())
    .digest('hex');
}

function photoOf(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(JPEG_START);
  for (let index = JPEG_START.length; index < size; index++) {
    bytes[index] = (index * 131) % 256;
  }
  return bytes;
}

describe('Given the connector served by Node over HTTP', () => {
  let server: Server;
  let baseUrl: string;
  const received: Received[] = [];
  const errors: Error[] = [];

  beforeEach(async () => {
    received.length = 0;
    errors.length = 0;
    server = createServer(
      nodeHandler(
        {
          fetch: async (request) => {
            const url = new URL(request.url);
            received.push({
              method: request.method,
              path: url.pathname,
              contentType: request.headers.get('content-type'),
              bytes: new Uint8Array(await request.arrayBuffer()),
            });
            return new Response(JSON.stringify({ answered: url.pathname }), {
              status: 201,
              headers: { 'content-type': 'application/json', 'x-answered-by': 'app' },
            });
          },
        },
        (error) => errors.push(error),
      ),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('when a photo file is put to the upload address, then the app gets its bytes unchanged and its answer goes back', async () => {
    const photo = photoOf(60_127);
    const response = await fetch(`${baseUrl}/mcp-photos`, {
      method: 'PUT',
      body: photo,
      headers: { 'content-type': 'image/jpeg', 'x-upload-ticket': 'ticket' },
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-answered-by')).toBe('app');
    expect(await response.json()).toEqual({ answered: '/mcp-photos' });
    expect(received).toHaveLength(1);
    expect(received[0]?.method).toBe('PUT');
    expect(received[0]?.contentType).toBe('image/jpeg');
    expect(received[0]?.bytes.byteLength).toBe(photo.byteLength);
    expect(digestOf(received[0]?.bytes)).toBe(digestOf(photo));
    expect(errors).toEqual([]);
  });

  it('when a photo of 10 MB is put, then the app gets all of it, more than the 4 MB a JSON-RPC message may have', async () => {
    const photo = photoOf(10 * 1024 * 1024);
    const response = await fetch(`${baseUrl}/mcp-photos`, {
      method: 'PUT',
      body: photo,
      headers: { 'content-type': 'image/jpeg' },
    });
    expect(response.status).toBe(201);
    expect(received[0]?.bytes.byteLength).toBe(photo.byteLength);
    expect(digestOf(received[0]?.bytes)).toBe(digestOf(photo));
  });

  it('when a photo is put with a Host that would make another path of the address, then the app still sees the upload address', async () => {
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve, reject) => {
      const put = request(
        `${baseUrl}/mcp-photos`,
        { method: 'PUT', headers: { host: 'x\\mcp#', 'content-type': 'image/jpeg' } },
        (answer) => {
          answer.resume();
          resolve(answer.statusCode ?? 0);
        },
      );
      put.on('error', reject);
      put.end(Buffer.from(JPEG_START));
    });
    expect(status).toBe(201);
    expect(received.map((entry) => entry.path)).toEqual(['/mcp-photos']);
  });

  it('when a JSON-RPC message is posted to the MCP endpoint, then the app gets it as before', async () => {
    const message =
      '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"name":"Nová naděje"}}';
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      body: message,
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(201);
    expect(received[0]?.path).toBe('/mcp');
    expect(new TextDecoder().decode(received[0]?.bytes)).toBe(message);
  });
});
