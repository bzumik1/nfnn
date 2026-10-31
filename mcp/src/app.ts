import {
  bearerAuthChallengeResponse,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  McpServer,
  oauthMetadataResponse,
  verifyBearerToken,
  type AuthInfo,
  type AuthMetadataOptions,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server';
import type { AuthorizationServer, AuthorizationServerDiscovery } from './authorization.js';
import type { BackendClient } from './backend.js';
import { PHOTO_UPLOAD_PATH, receivePhoto } from './photo-upload.js';
import type { PhotoSource } from './photos.js';
import { forVisitor } from './visitor.js';
import type { Logger } from './token-exchange.js';
import { registerReadingTools } from './tools/reading.js';
import { WRITE_SCOPE, type ToolDependencies } from './tools/support.js';
import { registerWritingTools } from './tools/writing.js';
import { UploadTickets } from './upload-tickets.js';

export const MCP_PATH = '/mcp';
export const READ_SCOPE = 'admin:read';
export const SERVER_NAME = 'nfnn';
export const RESOURCE_NAME = 'Správa Nové naděje';

export interface App {
  fetch(request: Request): Promise<Response>;
  close(): Promise<void>;
}

export interface AppDependencies {
  readonly backend: BackendClient;
  readonly logger: Logger;
  readonly photos: PhotoSource;
  readonly discovery: AuthorizationServerDiscovery;
  readonly verifier: OAuthTokenVerifier;
  readonly version: string;
  readonly now?: () => number;
}

export function createApp(deps: AppDependencies): App {
  const now = deps.now ?? (() => Date.now());
  const tools: ToolDependencies = {
    backend: deps.backend,
    logger: deps.logger,
    photos: deps.photos,
    tickets: new UploadTickets(now),
    publicUrl: () => deps.discovery.current()?.issuer,
  };
  const handler = createMcpHandler(
    () => {
      const site = deps.discovery.current()?.issuer;
      const server = new McpServer(
        {
          name: SERVER_NAME,
          version: deps.version,
          ...(site && {
            icons: [{ src: `${site}/favicon.svg`, mimeType: 'image/svg+xml', sizes: ['any'] }],
          }),
        },
        {
          instructions:
            'Tools of the administration of Nadační fond Nová naděje (nfnn.cz): the bank import, donations, donors, backups, the audit trail, the issued donation receipts, the monthly report, the site content and the server logs. Answers are compact JSON: amounts are numbers of crowns (CZK, fields named without "Minor"), instants ISO 8601 in Prague time with their offset, days YYYY-MM-DD. Lists come a page at a time and say how to ask for the next one. Writing tools need the "admin:write" permission of the connection and are audited under the administrator who connected, naming the connected application. Photos for news and projects are uploaded with nfnn_upload_photo (from a public address) or nfnn_photo_upload_link (a file); photos of people (the About photo, the portraits of the people of the foundation) and their web signatures only with nfnn_photo_upload_link, never from a public address. A receipt comes as the data it certifies, never as a PDF, which only a browser draws. Deleting content or account links, the administrator role, second-factor resets, older-symbol reversals, GDPR erasure, backup downloads, viewing the backup key, restoring a backup, uploading or removing the receipt signature, withdrawing a key of the verification QR codes and replacing a receipt already issued are done only on the web at /sprava; the exceptions are the About photo, which nfnn_update_about can also remove, and the people of the foundation, whom nfnn_remove_person can remove and whose web signatures (public images for the site, never the receipt signature) nfnn_set_web_signature and nfnn_remove_web_signature set and remove.',
        },
      );
      registerReadingTools(server, tools);
      registerWritingTools(server, tools);
      return server;
    },
    { onerror: (error) => deps.logger.warn(`MCP handler error: ${error.constructor.name}`) },
  );

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === '/health') {
        return health(deps);
      }
      if (url.pathname === PHOTO_UPLOAD_PATH) {
        return receivePhoto(request, tools);
      }
      const server = await discovered(deps);
      if (!server) {
        return json(503, { error: 'the authorization server is not reachable yet' });
      }
      if (url.pathname.startsWith('/.well-known/')) {
        return (
          oauthMetadataResponse(request, metadataOptions(server)) ??
          json(404, { error: 'not found' })
        );
      }
      if (url.pathname !== MCP_PATH) {
        return json(404, { error: 'not found' });
      }
      const started = now();
      const methods = await methodsOf(request);
      const auth = await forVisitor(request, () => authenticate(request, deps.verifier, server));
      const response =
        auth instanceof Response ? auth : await handler.fetch(request, { authInfo: auth });
      const donor =
        auth instanceof Response ? 'unauthenticated' : `donor ${String(auth.extra?.['donorId'])}`;
      deps.logger.info(
        `MCP ${request.method} ${methods} for ${donor}: ${response.status} in ${Math.round(now() - started)} ms`,
      );
      return response;
    },
    close: () => handler.close(),
  };
}

async function authenticate(
  request: Request,
  verifier: OAuthTokenVerifier,
  server: AuthorizationServer,
): Promise<AuthInfo | Response> {
  const mcpResource = new URL(server.mcpResource);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpResource);
  const [authorization] = (request.headers.get('authorization') ?? '').split(',');
  try {
    return await verifyBearerToken(authorization || undefined, {
      verifier,
      requiredScopes: [READ_SCOPE],
      resourceMetadataUrl,
      expectedResource: mcpResource,
    });
  } catch (error: unknown) {
    return bearerAuthChallengeResponse(error, {
      requiredScopes: [READ_SCOPE, WRITE_SCOPE],
      resourceMetadataUrl,
    });
  }
}

async function methodsOf(request: Request): Promise<string> {
  if (request.method !== 'POST') {
    return request.method === 'GET' ? 'stream' : 'session';
  }
  try {
    const parsed: unknown = await request.clone().json();
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    return messages.map(methodOf).join(',') || 'empty';
  } catch {
    return 'unreadable';
  }
}

function methodOf(message: unknown): string {
  const record =
    typeof message === 'object' && message !== null ? (message as Record<string, unknown>) : {};
  const method = record['method'];
  if (typeof method !== 'string') {
    return 'response';
  }
  if (!/^[A-Za-z/_]{1,64}$/.test(method)) {
    return 'unknown';
  }
  const params = record['params'];
  const tool =
    typeof params === 'object' && params !== null
      ? (params as Record<string, unknown>)['name']
      : undefined;
  return method === 'tools/call'
    ? `tools/call:${typeof tool === 'string' && /^[a-z0-9_]{1,64}$/.test(tool) ? tool : 'unknown'}`
    : method;
}

function metadataOptions(server: AuthorizationServer): AuthMetadataOptions {
  return {
    oauthMetadata: server.metadata,
    resourceServerUrl: new URL(server.mcpResource),
    scopesSupported: [READ_SCOPE, WRITE_SCOPE],
    resourceName: RESOURCE_NAME,
    dangerouslyAllowInsecureIssuerUrl: !server.issuer.startsWith('https://'),
  };
}

async function discovered(deps: AppDependencies): Promise<AuthorizationServer | undefined> {
  const before = deps.discovery.current()?.issuer;
  try {
    const server = await deps.discovery.discover();
    if (server.issuer !== before) {
      deps.logger.info(`Authorization server discovered: ${server.issuer}`);
    }
    return server;
  } catch (failure: unknown) {
    deps.logger.warn(
      `The authorization server metadata could not be read: ${failure instanceof Error ? failure.message : 'unknown failure'}`,
    );
    return undefined;
  }
}

async function health(deps: AppDependencies): Promise<Response> {
  const server = await discovered(deps);
  return server
    ? json(200, { status: 'UP', issuer: server.issuer })
    : json(503, { status: 'DOWN' });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
