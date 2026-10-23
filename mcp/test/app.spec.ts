import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ISSUER, READ_TOKEN } from './fake-backend.js';
import { MCP_URL, startApp, type TestApp } from './support.js';

describe('Given the MCP connector in front of the administration', () => {
  let stack: TestApp;

  beforeEach(async () => {
    stack = await startApp();
  });

  afterEach(async () => {
    await stack.stop();
  });

  it('when the backend has not answered its metadata yet, then health and the endpoint say so with 503', async () => {
    stack.backend.metadataAvailable = false;
    expect((await stack.app.fetch(new Request(`${ISSUER}/health`))).status).toBe(503);
    expect((await stack.app.fetch(new Request(MCP_URL, { method: 'POST' }))).status).toBe(503);
    stack.backend.metadataAvailable = true;
    expect((await stack.app.fetch(new Request(`${ISSUER}/health`))).status).toBe(200);
    await stack.app.fetch(new Request(`${ISSUER}/health`));
    expect(
      stack.logLines.filter((line) => line.includes('Authorization server discovered')),
    ).toEqual([`INFO Authorization server discovered: ${ISSUER}`]);
  });

  it('when the protected resource metadata is read, then it names the connector and the site as its authorization server', async () => {
    const response = await stack.app.fetch(
      new Request(`${ISSUER}/.well-known/oauth-protected-resource/mcp`),
    );
    expect(response.status).toBe(200);
    const document = (await response.json()) as Record<string, unknown>;
    expect(document['resource']).toBe(MCP_URL);
    expect(document['authorization_servers']).toEqual([ISSUER]);
    expect(document['scopes_supported']).toEqual(['admin:read', 'admin:write']);
  });

  it('when the authorization server metadata is asked from the connector, then the backend document is passed through', async () => {
    const response = await stack.app.fetch(
      new Request(`${ISSUER}/.well-known/oauth-authorization-server`),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { issuer: string }).issuer).toBe(ISSUER);
  });

  it('when a request comes without a token, then 401 points at the resource metadata and asks for reading and writing, so the administrator chooses on the site', async () => {
    const response = await stack.app.fetch(new Request(MCP_URL, { method: 'POST' }));
    expect(response.status).toBe(401);
    const challenge = response.headers.get('www-authenticate') ?? '';
    expect(challenge).toContain('Bearer');
    expect(challenge).toContain(
      `resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/mcp"`,
    );
    expect(challenge).toContain('scope="admin:read admin:write"');
    expect(((await response.json()) as { error: string }).error).toBe('invalid_token');
  });

  it('when the token is not one the site issued for the connector, then 401 invalid_token and nothing reaches the administration', async () => {
    const response = await stack.app.fetch(
      new Request(MCP_URL, {
        method: 'POST',
        headers: { authorization: 'Bearer not-a-connector-token' },
      }),
    );
    expect(response.status).toBe(401);
    expect(
      stack.backend.requests.filter((request) => request.path.startsWith('/api/admin')),
    ).toHaveLength(0);
    expect(
      stack.logLines.some((line) => line.includes('refused a connector token: invalid_grant')),
    ).toBe(true);
  });

  it('when another path is asked, then 404', async () => {
    expect((await stack.app.fetch(new Request(`${ISSUER}/api/admin/donors`))).status).toBe(404);
  });

  it('when a valid token is presented, then the token is exchanged once and the log names only the donor id', async () => {
    await stack.app.fetch(
      new Request(MCP_URL, { method: 'GET', headers: { authorization: `Bearer ${READ_TOKEN}` } }),
    );
    await stack.app.fetch(
      new Request(MCP_URL, { method: 'GET', headers: { authorization: `Bearer ${READ_TOKEN}` } }),
    );
    const exchanges = stack.backend.exchanges();
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0]?.body).toContain(
      'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange',
    );
    expect(exchanges[0]?.body).toContain(`resource=${encodeURIComponent(`${ISSUER}/api`)}`);
    expect(stack.logLines).toContain(
      'INFO Connector token of donor donor-jana exchanged for an API token with scope "admin:read"',
    );
    expect(stack.logLines.join('\n')).not.toContain(READ_TOKEN);
  });
});
