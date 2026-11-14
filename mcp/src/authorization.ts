import type { OAuthMetadata } from '@modelcontextprotocol/server';
import type { Logger } from './token-exchange.js';

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
const REFRESH_AFTER_MS = 30_000;
const FAILURE_REMEMBERED_MS = 5_000;
const FETCH_TIMEOUT_MS = 5_000;

interface Failure {
  readonly error: unknown;
  readonly at: number;
}

export class AuthorizationServerDiscovery {
  private known: AuthorizationServer | undefined;
  private knownAt = 0;
  private failure: Failure | undefined;
  private pending: Promise<AuthorizationServer> | undefined;

  constructor(
    private readonly backendUrl: string,
    private readonly fetch: FetchLike,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  current(): AuthorizationServer | undefined {
    return this.known;
  }

  async discover(): Promise<AuthorizationServer> {
    if (this.known && this.now() - this.knownAt < REFRESH_AFTER_MS) {
      return this.known;
    }
    if (this.failure && this.now() - this.failure.at < FAILURE_REMEMBERED_MS) {
      return this.lastKnownOr(this.failure.error);
    }
    this.pending ??= this.refresh().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async refresh(): Promise<AuthorizationServer> {
    try {
      this.known = await this.fetchMetadata();
      this.knownAt = this.now();
      this.failure = undefined;
      return this.known;
    } catch (error: unknown) {
      if (!this.failure) {
        this.logger.warn(
          `The authorization server metadata could not be read: ${error instanceof Error ? error.message : 'unknown failure'}`,
        );
      }
      this.failure = { error, at: this.now() };
      return this.lastKnownOr(error);
    }
  }

  private lastKnownOr(error: unknown): AuthorizationServer {
    if (this.known) {
      return this.known;
    }
    throw error;
  }

  private async fetchMetadata(): Promise<AuthorizationServer> {
    const timeout = new AbortController();
    const timer = setTimeout(() => {
      timeout.abort(new Error(`no answer to ${METADATA_PATH} within ${FETCH_TIMEOUT_MS} ms`));
    }, FETCH_TIMEOUT_MS);
    try {
      return await this.readMetadata(timeout.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  private async readMetadata(signal: AbortSignal): Promise<AuthorizationServer> {
    const response = await this.fetch(this.backendUrl + METADATA_PATH, {
      headers: { accept: 'application/json' },
      signal,
    });
    if (!response.ok) {
      throw new Error(`the backend answered ${response.status} to ${METADATA_PATH}`);
    }
    const metadata = (await response.json()) as Partial<OAuthMetadata>;
    if (typeof metadata.issuer !== 'string' || typeof metadata.token_endpoint !== 'string') {
      throw new Error('the authorization server metadata lacks issuer or token_endpoint');
    }
    const issuer = metadata.issuer.endsWith('/') ? metadata.issuer.slice(0, -1) : metadata.issuer;
    return {
      metadata: metadata as OAuthMetadata,
      issuer,
      tokenEndpoint: metadata.token_endpoint,
      scopesSupported: metadata.scopes_supported ?? [],
      mcpResource: `${issuer}/mcp`,
      apiResource: `${issuer}/api`,
    };
  }
}
