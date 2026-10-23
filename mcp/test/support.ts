import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp, type App } from '../src/app.js';
import { AuthorizationServerDiscovery } from '../src/authorization.js';
import { BackendClient } from '../src/backend.js';
import { PhotoRefused, type Photo, type PhotoSource } from '../src/photos.js';
import { TokenExchangeVerifier, type Logger } from '../src/token-exchange.js';
import { FakeBackend, ISSUER } from './fake-backend.js';

export const MCP_URL = `${ISSUER}/mcp`;

export const PHOTO_URL = 'https://photos.example/tabor.jpg';
export const BROKEN_PHOTO_URL = 'https://photos.example/broken.jpg';

export class FakePhotoSource implements PhotoSource {
  readonly fetched: string[] = [];

  fetch(url: string): Promise<Photo> {
    this.fetched.push(url);
    if (url === PHOTO_URL) {
      return Promise.resolve({
        bytes: new TextEncoder().encode('jpeg-bytes'),
        contentType: 'image/jpeg',
      });
    }
    if (url === BROKEN_PHOTO_URL) {
      return Promise.resolve({
        bytes: new TextEncoder().encode('not-an-image'),
        contentType: 'image/jpeg',
      });
    }
    return Promise.reject(new PhotoRefused('the address points into a private network'));
  }
}

export interface TestClock {
  now: number;
}

export interface TestApp {
  readonly app: App;
  readonly backend: FakeBackend;
  readonly photos: FakePhotoSource;
  readonly clock: TestClock;
  readonly logLines: string[];
  stop(): Promise<void>;
}

export async function startApp(): Promise<TestApp> {
  const backend = new FakeBackend();
  await backend.start();
  const logLines: string[] = [];
  const logger: Logger = {
    info: (message) => logLines.push(`INFO ${message}`),
    warn: (message) => logLines.push(`WARN ${message}`),
  };
  const discovery = new AuthorizationServerDiscovery(backend.url, fetch);
  const photos = new FakePhotoSource();
  const clock: TestClock = { now: Date.now() };
  const app = createApp({
    discovery,
    verifier: new TokenExchangeVerifier(discovery, backend.url, fetch, logger, () => clock.now),
    backend: new BackendClient(backend.url, fetch),
    photos,
    logger,
    version: 'test',
    now: () => clock.now,
  });
  return {
    app,
    backend,
    photos,
    clock,
    logLines,
    stop: async () => {
      await app.close();
      await backend.stop();
    },
  };
}

export async function connect(app: App, token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    fetch: (input, init) => app.fetch(new Request(input, init)),
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
  return client;
}

export function textOf(result: { content: unknown }): string {
  const content = result.content as { type: string; text?: string }[];
  return content.map((block) => block.text ?? '').join('\n');
}
