import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { AuthorizationServerDiscovery, type FetchLike } from '../src/authorization.js';
import { subjectOf, TokenExchangeVerifier, type Logger } from '../src/token-exchange.js';
import { ISSUER, metadata, READ_TOKEN } from './fake-backend.js';

const BACKEND = 'http://backend:8080';
const silent: Logger = { info: () => undefined, warn: () => undefined };

function fetchAnswering(token: (form: URLSearchParams) => Response | Promise<Response>): FetchLike {
  return async (input, init) => {
    const url = String(input);
    if (url === `${BACKEND}/.well-known/oauth-authorization-server`) {
      return Response.json(metadata());
    }
    if (url === `${BACKEND}/api/donors/oauth/token`) {
      return token(new URLSearchParams(String(init?.body)));
    }
    throw new Error(`unexpected ${url}`);
  };
}

function verifier(fetch: FetchLike, clock: { now: number }): TokenExchangeVerifier {
  return new TokenExchangeVerifier(
    new AuthorizationServerDiscovery(BACKEND, fetch),
    BACKEND,
    fetch,
    silent,
    () => clock.now,
  );
}

describe('Given the connector verifying tokens by exchanging them at the site', () => {
  it('when the site issues an API token, then the auth info carries the scopes, the expiry, the resource and the API token', async () => {
    const clock = { now: Date.parse('2026-10-23T07:00:00Z') };
    const info = await verifier(
      fetchAnswering(() =>
        Response.json({ access_token: 'api', expires_in: 900, scope: 'admin:read admin:write' }),
      ),
      clock,
    ).verifyAccessToken(READ_TOKEN);
    expect(info.scopes).toEqual(['admin:read', 'admin:write']);
    expect(info.expiresAt).toBe(Math.floor(clock.now / 1000) + 900);
    expect(info.resource?.href).toBe(`${ISSUER}/mcp`);
    expect(info.extra).toEqual({ apiToken: 'api', donorId: 'donor-jana' });
  });

  it('when the same token comes again while more than five minutes are left, then no second exchange is made, and with less one is', async () => {
    const clock = { now: Date.parse('2026-10-23T07:00:00Z') };
    let exchanges = 0;
    const subject = verifier(
      fetchAnswering(() => {
        exchanges += 1;
        return Response.json({
          access_token: `api-${exchanges}`,
          expires_in: 900,
          scope: 'admin:read',
        });
      }),
      clock,
    );
    await subject.verifyAccessToken(READ_TOKEN);
    await subject.verifyAccessToken(READ_TOKEN);
    expect(exchanges).toBe(1);
    clock.now += 599_000;
    await subject.verifyAccessToken(READ_TOKEN);
    expect(exchanges).toBe(1);
    clock.now += 2_000;
    expect((await subject.verifyAccessToken(READ_TOKEN)).extra?.['apiToken']).toBe('api-2');
    expect(exchanges).toBe(2);
  });

  it('when the site refuses the token, then the verifier reports an invalid token', async () => {
    const refused = verifier(
      fetchAnswering(() =>
        Response.json({ error: 'invalid_grant', error_description: 'unknown' }, { status: 400 }),
      ),
      { now: 0 },
    ).verifyAccessToken(READ_TOKEN);
    await expect(refused).rejects.toSatisfy(
      (error: unknown) => error instanceof OAuthError && error.code === OAuthErrorCode.InvalidToken,
    );
  });

  it('when the site cannot be reached or answers without a token, then the verifier reports a server error', async () => {
    const unreachable = verifier(
      fetchAnswering(() => {
        throw new TypeError('fetch failed');
      }),
      { now: 0 },
    ).verifyAccessToken(READ_TOKEN);
    await expect(unreachable).rejects.toSatisfy(
      (error: unknown) => error instanceof OAuthError && error.code === OAuthErrorCode.ServerError,
    );
    const broken = verifier(
      fetchAnswering(() => Response.json({}, { status: 503 })),
      { now: 0 },
    ).verifyAccessToken(READ_TOKEN);
    await expect(broken).rejects.toSatisfy(
      (error: unknown) => error instanceof OAuthError && error.code === OAuthErrorCode.ServerError,
    );
  });

  it('when the subject of a token is read, then malformed tokens give nothing', () => {
    expect(subjectOf(READ_TOKEN)).toBe('donor-jana');
    expect(subjectOf('not.a.jwt')).toBeUndefined();
    expect(subjectOf('nope')).toBeUndefined();
  });
});
