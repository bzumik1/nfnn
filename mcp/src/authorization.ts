import type { OAuthMetadata } from '@modelcontextprotocol/server';

export interface AuthorizationServer {
  readonly metadata: OAuthMetadata;
  readonly issuer: string;
  readonly tokenEndpoint: string;
  readonly scopesSupported: readonly string[];
  readonly mcpResource: string;
  readonly apiResource: string;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const METADATA_PATH = '/.well-known/oauth-authorization-server';

export class AuthorizationServerDiscovery {
  private known: AuthorizationServer | undefined;
  private pending: Promise<AuthorizationServer> | undefined;

  constructor(
    private readonly backendUrl: string,
    private readonly fetch: FetchLike,
  ) {}

  current(): AuthorizationServer | undefined {
    return this.known;
  }

  async discover(): Promise<AuthorizationServer> {
    if (this.known) {
      return this.known;
    }
    this.pending ??= this.fetchMetadata().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async fetchMetadata(): Promise<AuthorizationServer> {
    const response = await this.fetch(this.backendUrl + METADATA_PATH, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`the backend answered ${response.status} to ${METADATA_PATH}`);
    }
    const metadata = (await response.json()) as Partial<OAuthMetadata>;
    if (typeof metadata.issuer !== 'string' || typeof metadata.token_endpoint !== 'string') {
      throw new Error('the authorization server metadata lacks issuer or token_endpoint');
    }
    const issuer = metadata.issuer.endsWith('/') ? metadata.issuer.slice(0, -1) : metadata.issuer;
    this.known = {
      metadata: metadata as OAuthMetadata,
      issuer,
      tokenEndpoint: metadata.token_endpoint,
      scopesSupported: metadata.scopes_supported ?? [],
      mcpResource: `${issuer}/mcp`,
      apiResource: `${issuer}/api`,
    };
    return this.known;
  }
}
