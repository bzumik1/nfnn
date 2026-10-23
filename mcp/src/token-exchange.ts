import { createHash } from 'node:crypto';
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server';
import type { AuthorizationServerDiscovery, FetchLike } from './authorization.js';
import { visitorHeaders } from './visitor.js';

export const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
export const CONNECTOR_CLIENT = 'connector';

export interface ExchangedToken {
  readonly apiToken: string;
  readonly donorId: string;
  readonly scopes: readonly string[];
  readonly expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export class TokenExchangeVerifier implements OAuthTokenVerifier {
  private readonly cache = new Map<string, AuthInfo>();

  constructor(
    private readonly discovery: AuthorizationServerDiscovery,
    private readonly backendUrl: string,
    private readonly fetch: FetchLike,
    private readonly logger: Logger,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const key = createHash('sha256').update(token).digest('hex');
    const cached = this.cache.get(key);
    const nowSeconds = Math.floor(this.now() / 1000);
    if (cached && cached.expiresAt !== undefined && cached.expiresAt > nowSeconds) {
      return cached;
    }
    this.cache.delete(key);
    const info = await this.exchange(token, nowSeconds);
    this.cache.set(key, info);
    this.evictExpired(nowSeconds);
    return info;
  }

  private async exchange(token: string, nowSeconds: number): Promise<AuthInfo> {
    const server = await this.discovery.discover();
    const body = new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT,
      subject_token: token,
      subject_token_type: ACCESS_TOKEN_TYPE,
      resource: server.apiResource,
    });
    let response: Response;
    try {
      response = await this.fetch(this.backendUrl + new URL(server.tokenEndpoint).pathname, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          ...visitorHeaders(),
        },
        body,
      });
    } catch (failure: unknown) {
      this.logger.warn(`The token exchange could not reach the backend: ${describe(failure)}`);
      throw new OAuthError(OAuthErrorCode.ServerError, 'the authorization server is not reachable');
    }
    const answer = (await response.json().catch(() => ({}))) as TokenResponse;
    if (response.status === 400) {
      this.logger.info(
        `The authorization server refused a connector token: ${answer.error ?? 'no error code'}`,
      );
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        answer.error_description ?? 'the token was refused',
      );
    }
    if (
      !response.ok ||
      typeof answer.access_token !== 'string' ||
      typeof answer.expires_in !== 'number'
    ) {
      this.logger.warn(`The token exchange answered ${response.status} without a usable token`);
      throw new OAuthError(OAuthErrorCode.ServerError, 'the authorization server gave no token');
    }
    const scopes = (answer.scope ?? '').split(' ').filter((scope) => scope.length > 0);
    const exchanged: ExchangedToken = {
      apiToken: answer.access_token,
      donorId: subjectOf(token) ?? 'unknown',
      scopes,
      expiresAt: nowSeconds + answer.expires_in,
    };
    this.logger.info(
      `Connector token of donor ${exchanged.donorId} exchanged for an API token with scope "${scopes.join(' ')}"`,
    );
    return {
      token,
      clientId: CONNECTOR_CLIENT,
      scopes: [...scopes],
      expiresAt: exchanged.expiresAt,
      resource: new URL(server.mcpResource),
      extra: { apiToken: exchanged.apiToken, donorId: exchanged.donorId },
    };
  }

  private evictExpired(nowSeconds: number): void {
    for (const [key, info] of this.cache) {
      if (info.expiresAt === undefined || info.expiresAt <= nowSeconds) {
        this.cache.delete(key);
      }
    }
  }
}

export function subjectOf(jwt: string): string | undefined {
  const parts = jwt.split('.');
  if (parts.length !== 3 || parts[1] === undefined) {
    return undefined;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      sub?: unknown;
    };
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

function describe(failure: unknown): string {
  return failure instanceof Error ? failure.constructor.name : 'unknown failure';
}
