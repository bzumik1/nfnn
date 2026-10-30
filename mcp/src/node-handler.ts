import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { PHOTO_UPLOAD_PATH } from './photo-upload.js';

export interface FetchHandler {
  fetch(request: Request): Promise<Response>;
}

export function nodeHandler(
  app: FetchHandler,
  onerror: (error: Error) => void,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const mcp = toNodeHandler(app, { onerror });
  return async (request, response) => {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== PHOTO_UPLOAD_PATH) {
      await mcp(request, response);
      return;
    }
    let answer: Response;
    try {
      answer = await app.fetch(binaryRequest(request));
    } catch (thrown: unknown) {
      onerror(thrown instanceof Error ? thrown : new Error(String(thrown)));
      answer = Response.json({ error: 'The photo could not be received.' }, { status: 500 });
    }
    response.writeHead(answer.status, Object.fromEntries(answer.headers));
    response.end(Buffer.from(await answer.arrayBuffer()));
  };
}

function binaryRequest(request: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || name.startsWith(':')) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      headers.append(name, item);
    }
  }
  const method = (request.method ?? 'GET').toUpperCase();
  const init: RequestInit & { duplex?: 'half' } = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
    init.duplex = 'half';
  }
  return new Request(`http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`, init);
}
