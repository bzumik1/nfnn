import { createMcpHandler, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/server';
import { createMcpServer, MCP_PATH } from './app.js';
import { BackendClient } from './backend.js';
import { PhotoRefused } from './photos.js';
import type { ToolDependencies } from './tools/support.js';
import { UploadTickets } from './upload-tickets.js';

const UNREACHABLE_ORIGIN = 'http://127.0.0.1:9';

const listingOnly: ToolDependencies = {
  backend: new BackendClient(UNREACHABLE_ORIGIN, () =>
    Promise.reject(new Error('listing the tools reaches no backend')),
  ),
  logger: { info: () => undefined, warn: () => undefined },
  photos: { fetch: () => Promise.reject(new PhotoRefused('listing the tools fetches no photo')) },
  tickets: new UploadTickets(),
  publicUrl: () => undefined,
};

export async function connectorToolList(): Promise<unknown[]> {
  const tools = (await ask('tools/list', {}))['tools'];
  if (!Array.isArray(tools)) {
    throw new Error('the connector answered tools/list without a tool list');
  }
  return tools;
}

export async function connectorInstructions(): Promise<string> {
  const instructions = (
    await ask('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'tool-list', version: '0' },
    })
  )['instructions'];
  if (typeof instructions !== 'string') {
    throw new Error('the connector answered initialize without instructions');
  }
  return instructions;
}

async function ask(method: string, params: object): Promise<Record<string, unknown>> {
  const handler = createMcpHandler(() => createMcpServer(listingOnly, 'tool-list', undefined));
  try {
    const response = await handler.fetch(
      new Request(`${UNREACHABLE_ORIGIN}${MCP_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }),
    );
    return resultOf(await response.text(), method);
  } finally {
    await handler.close();
  }
}

function resultOf(answer: string, method: string): Record<string, unknown> {
  const data = answer
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length))
    .join('');
  const message = JSON.parse(data || answer) as { result?: Record<string, unknown> };
  if (!message.result) {
    throw new Error(`the connector answered ${method} without a result: ${answer.slice(0, 200)}`);
  }
  return message.result;
}
