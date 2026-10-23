import type { Client } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ISSUER, MEDIA_ID, READ_TOKEN, WRITE_TOKEN } from './fake-backend.js';
import { connect, startApp, textOf, type TestApp } from './support.js';

const UPLOAD_URL = `${ISSUER}/mcp-photos`;

describe('Given an administrator connected with the writing permission who asked for an upload link', () => {
  let stack: TestApp;
  let client: Client;
  let ticket: string;

  beforeEach(async () => {
    stack = await startApp();
    client = await connect(stack.app, WRITE_TOKEN);
    const link = JSON.parse(
      textOf(await client.callTool({ name: 'nfnn_photo_upload_link', arguments: {} })),
    ) as { headers: Record<string, string> };
    ticket = link.headers['X-Upload-Ticket'] ?? '';
  });

  afterEach(async () => {
    await client.close();
    await stack.stop();
  });

  function put(body: string | Uint8Array, headers: Record<string, string>): Promise<Response> {
    return stack.app.fetch(new Request(UPLOAD_URL, { method: 'PUT', body, headers }));
  }

  it('when the photo is put with the ticket, then the administration gets it under the administrator and the id comes back once', async () => {
    const response = await put('jpeg-bytes', {
      'x-upload-ticket': ticket,
      'content-type': 'image/jpeg',
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: MEDIA_ID,
      url: `/media/${MEDIA_ID}`,
      width: 1600,
      height: 1200,
    });
    const upload = stack.backend.requests.find(
      (request) => request.path === '/api/admin/content/media',
    );
    expect(upload?.authorization).toBe('Bearer api-token-write');
    expect(upload?.body).toContain('jpeg-bytes');
    expect(stack.logLines).toContain(
      `INFO Photo upload answered donor donor-jana about media ${MEDIA_ID}`,
    );

    const again = await put('jpeg-bytes', {
      'x-upload-ticket': ticket,
      'content-type': 'image/jpeg',
    });
    expect(again.status).toBe(401);
    expect(((await again.json()) as { error: string }).error).toContain('nfnn_photo_upload_link');
  });

  it('when the ticket is missing, unknown or expired, then 401 and nothing reaches the administration', async () => {
    expect((await put('jpeg-bytes', { 'content-type': 'image/jpeg' })).status).toBe(401);
    expect(
      (await put('jpeg-bytes', { 'x-upload-ticket': 'guess', 'content-type': 'image/jpeg' }))
        .status,
    ).toBe(401);
    stack.clock.now += 10 * 60 * 1000;
    expect(
      (await put('jpeg-bytes', { 'x-upload-ticket': ticket, 'content-type': 'image/jpeg' })).status,
    ).toBe(401);
    expect(
      stack.backend.requests.filter((request) => request.path === '/api/admin/content/media'),
    ).toHaveLength(0);
  });

  it('when the body is not an image, is too large or comes another way, then it is refused before the administration', async () => {
    const wrongType = await put('text', {
      'x-upload-ticket': ticket,
      'content-type': 'text/plain',
    });
    expect(wrongType.status).toBe(415);

    const second = JSON.parse(
      textOf(await client.callTool({ name: 'nfnn_photo_upload_link', arguments: {} })),
    ) as { headers: Record<string, string> };
    const tooLarge = await put(new Uint8Array(10 * 1024 * 1024 + 1), {
      'x-upload-ticket': second.headers['X-Upload-Ticket'] ?? '',
      'content-type': 'image/png',
    });
    expect(tooLarge.status).toBe(413);

    const get = await stack.app.fetch(new Request(UPLOAD_URL));
    expect(get.status).toBe(405);
    expect(
      stack.backend.requests.filter((request) => request.path === '/api/admin/content/media'),
    ).toHaveLength(0);
  });

  it('when the administration refuses the image, then its problem is passed on', async () => {
    const response = await put('not-an-image', {
      'x-upload-ticket': ticket,
      'content-type': 'image/jpeg',
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(
      '400 content/unsupported-image',
    );
  });
});

describe('Given the MCP connector receiving requests', () => {
  let stack: TestApp;

  beforeEach(async () => {
    stack = await startApp();
  });

  afterEach(async () => {
    await stack.stop();
  });

  it('when requests come, then mcp.log names each JSON-RPC method, the tool, the donor, the status and the time, never the arguments', async () => {
    const client = await connect(stack.app, READ_TOKEN);
    await client.callTool({ name: 'nfnn_find_donors', arguments: { query: 'nováková' } });
    await client.close();
    await stack.app.fetch(new Request(`${ISSUER}/mcp`, { method: 'POST' }));

    const requests = stack.logLines.filter((line) => line.startsWith('INFO MCP '));
    expect(requests).toContain('INFO MCP POST initialize for donor donor-jana: 200 in 0 ms');
    expect(requests).toContain(
      'INFO MCP POST tools/call:nfnn_find_donors for donor donor-jana: 200 in 0 ms',
    );
    expect(requests).toContain('INFO MCP POST unreadable for unauthenticated: 401 in 0 ms');
    expect(stack.logLines.join('\n')).not.toContain('nováková');
  });
});
