import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp, type App } from '../src/app.js';
import { AuthorizationServerDiscovery } from '../src/authorization.js';
import { BackendClient } from '../src/backend.js';
import { LogReader } from '../src/logs.js';
import { TokenExchangeVerifier, type Logger } from '../src/token-exchange.js';
import { FakeBackend, ISSUER } from './fake-backend.js';

export const MCP_URL = `${ISSUER}/mcp`;

export interface TestApp {
  readonly app: App;
  readonly backend: FakeBackend;
  readonly logLines: string[];
  stop(): Promise<void>;
}

export async function startApp(logsDir = '/nonexistent-logs'): Promise<TestApp> {
  const backend = new FakeBackend();
  await backend.start();
  const logLines: string[] = [];
  const logger: Logger = {
    info: (message) => logLines.push(`INFO ${message}`),
    warn: (message) => logLines.push(`WARN ${message}`),
  };
  const discovery = new AuthorizationServerDiscovery(backend.url, fetch);
  const app = createApp({
    discovery,
    verifier: new TokenExchangeVerifier(discovery, backend.url, fetch, logger),
    backend: new BackendClient(backend.url, fetch),
    logs: new LogReader(logsDir),
    logger,
    version: 'test',
  });
  return {
    app,
    backend,
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
