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
import { registerReadingTools } from './tools/reading.js';
import { WRITE_SCOPE, type ToolDependencies } from './tools/support.js';
import { registerWritingTools } from './tools/writing.js';

export const MCP_PATH = '/mcp';
export const READ_SCOPE = 'admin:read';
export const SERVER_NAME = 'nfnn';
export const RESOURCE_NAME = 'Správa Nové naděje';

export interface App {
  fetch(request: Request): Promise<Response>;
  close(): Promise<void>;
}

export interface AppDependencies extends ToolDependencies {
  readonly discovery: AuthorizationServerDiscovery;
  readonly verifier: OAuthTokenVerifier;
  readonly version: string;
}

export function createApp(deps: AppDependencies): App {
  const handler = createMcpHandler(
    () => {
      const server = new McpServer(
        { name: SERVER_NAME, version: deps.version },
        {
          instructions:
            'Tools of the administration of Nadační fond Nová naděje (nfnn.cz): the bank import, donations, donors, backups, the audit trail, the monthly report, the site content and the server logs. Amounts are in CZK, times in Prague time. Writing tools need the "admin:write" permission of the connection and are audited under the administrator who connected. Deleting content or account links, the administrator role, second-factor resets, older-symbol reversals, GDPR erasure and backup downloads are done only on the web at /sprava.',
        },
      );
      registerReadingTools(server, deps);
      registerWritingTools(server, deps);
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
      const auth = await authenticate(request, deps.verifier, server);
      if (auth instanceof Response) {
        return auth;
      }
      return handler.fetch(request, { authInfo: auth });
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
