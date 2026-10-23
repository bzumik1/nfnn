import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';

export const ISSUER = 'https://nfnn.example';
export const READ_TOKEN = jwt('donor-jana', 'admin:read');
export const WRITE_TOKEN = jwt('donor-jana', 'admin:read admin:write');
export const API_TOKEN_OF: Record<string, string> = {
  [READ_TOKEN]: 'api-token-read',
  [WRITE_TOKEN]: 'api-token-write',
};
export const PAYMENT_ID = '019a0000-0000-7000-8000-000000000001';
export const DONOR_ID = '019a0000-0000-7000-8000-000000000002';
export const UNKNOWN_ID = '019a0000-0000-7000-8000-00000000ffff';

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | undefined;
  readonly body: string;
}

export class FakeBackend {
  readonly requests: RecordedRequest[] = [];
  metadataAvailable = true;
  private server: Server | undefined;
  url = '';

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const address = this.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('no port');
    }
    this.url = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  exchanges(): RecordedRequest[] {
    return this.requests.filter((request) => request.path === '/api/donors/oauth/token');
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks).toString('utf8');
    const url = new URL(request.url ?? '/', 'http://backend');
    const recorded: RecordedRequest = {
      method: request.method ?? 'GET',
      path: url.pathname + url.search,
      authorization: request.headers['authorization'],
      body,
    };
    this.requests.push(recorded);
    const [status, answer] = this.route(recorded, url, body);
    response.writeHead(status, {
      'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
    });
    response.end(answer === undefined ? '' : JSON.stringify(answer));
  }

  private route(request: RecordedRequest, url: URL, body: string): [number, unknown] {
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return this.metadataAvailable ? [200, metadata()] : [503, { error: 'down' }];
    }
    if (url.pathname === '/api/donors/oauth/token') {
      return tokenExchange(new URLSearchParams(body));
    }
    if (url.pathname === '/actuator/info') {
      return [200, { build: { revision: 'abc1234' } }];
    }
    if (url.pathname === '/actuator/health') {
      return [200, { status: 'UP' }];
    }
    if (!url.pathname.startsWith('/api/admin/')) {
      return [404, problem(404, 'not-found', 'Nenalezeno')];
    }
    const token = request.authorization?.replace('Bearer ', '');
    if (token !== 'api-token-read' && token !== 'api-token-write') {
      return [401, problem(401, 'auth/unauthenticated', 'Přihlaste se')];
    }
    if (request.method !== 'GET' && token !== 'api-token-write') {
      return [403, problem(403, 'auth/forbidden', 'Přístup odepřen', 'Chybí oprávnění.')];
    }
    return adminRoute(request, url, body);
  }
}

function adminRoute(request: RecordedRequest, url: URL, body: string): [number, unknown] {
  switch (`${request.method} ${url.pathname}`) {
    case 'GET /api/admin/donations/import-state':
      return [
        200,
        {
          coveredFrom: '2026-07-20',
          coveredTo: '2026-10-22',
          lastSucceededAt: '2026-10-23T05:00:00Z',
          consecutiveFailures: 0,
        },
      ];
    case 'GET /api/admin/operations/backups':
      return [
        200,
        {
          available: true,
          backups: [
            {
              fileName: 'nfnn-2026-10-23_0300.dump',
              kind: 'DAILY',
              sizeBytes: 1590,
              createdAt: '2026-10-23T01:00:03Z',
            },
          ],
          lastBackup: { outcome: 'OK', finishedAt: '2026-10-23T01:00:03Z' },
          lastTestRestore: null,
          lastRestore: null,
          restoreFiles: [],
          pendingRequests: 0,
          problems: [],
        },
      ];
    case 'GET /api/admin/donations/overview':
      return [
        200,
        {
          year: Number(url.searchParams.get('year') ?? 2026),
          received: { count: 1, totalMinor: 99900, currency: 'CZK' },
        },
      ];
    case 'GET /api/admin/donations/payments':
      return [
        200,
        {
          year: null,
          availableYears: [],
          items: [
            {
              id: PAYMENT_ID,
              bookedOn: '2026-10-10',
              amountMinor: 50000,
              currency: 'CZK',
              importedAt: '2026-10-17T10:00:00Z',
              donation: null,
            },
          ],
        },
      ];
    case 'GET /api/admin/donors':
      return [
        200,
        { items: [{ donorId: DONOR_ID, name: 'Jana Nováková', email: 'jana@example.cz' }] },
      ];
    case `GET /api/admin/donors/${DONOR_ID}`:
      return [
        200,
        { donorId: DONOR_ID, name: 'Jana Nováková', registeredAt: '2026-10-17T10:00:00Z' },
      ];
    case `GET /api/admin/donations/donors/${DONOR_ID}`:
      return [404, problem(404, 'donations/donor-not-found', 'Dárce nemá záznam')];
    case 'GET /api/admin/donors/actions':
      return [
        200,
        {
          items: [{ action: 'PAIR_PAYMENT', performedAt: '2026-10-23T06:00:00Z' }],
          hasMore: false,
        },
      ];
    case 'GET /api/admin/donors/administrators':
      return [
        200,
        {
          items: [
            {
              donorId: DONOR_ID,
              name: 'Jana Nováková',
              email: 'jana@example.cz',
              secondFactorEnabled: true,
            },
          ],
        },
      ];
    case 'GET /api/admin/donations/symbol-claims':
      return [
        200,
        {
          items: [
            {
              id: UNKNOWN_ID,
              donorId: DONOR_ID,
              variableSymbol: '1234567890',
              answer: 'CONFIRMED',
              answeredAt: '2026-10-22T10:00:00Z',
              pairedDonations: 2,
            },
          ],
        },
      ];
    case 'PUT /api/admin/donations/report/settings':
      return [200, JSON.parse(body)];
    case 'POST /api/admin/content/news':
      return [201, { id: UNKNOWN_ID, slug: 'letni-tabor', ...JSON.parse(body) }];
    case `PUT /api/admin/content/news/${UNKNOWN_ID}`:
    case `PUT /api/admin/content/projects/${UNKNOWN_ID}`:
      return [200, { id: UNKNOWN_ID, ...JSON.parse(body) }];
    case 'POST /api/admin/content/projects':
      return [201, { id: UNKNOWN_ID, slug: 'nova-strecha', ...JSON.parse(body) }];
    case `POST /api/admin/donations/donors/${DONOR_ID}/bank-accounts/${PAYMENT_ID}/disconnect`:
      return [204, undefined];
    case `POST /api/admin/donations/donors/${DONOR_ID}/bank-accounts/${PAYMENT_ID}/reconnect`:
      return [409, problem(409, 'donations/bank-account-link-active', 'Párování už je zapnuté')];
    case 'GET /api/admin/donations/report':
      return [200, { settings: { recipients: ['info@nfnn.cz'], sendDay: 1 }, sentReports: [] }];
    case 'GET /api/admin/content/news':
      return [200, { items: [{ id: UNKNOWN_ID, title: 'Koncept' }] }];
    case 'GET /api/admin/content/projects':
      return [200, { items: [] }];
    case 'GET /api/admin/operations/logs':
      return [
        200,
        {
          available: true,
          files: [
            {
              name: 'backend.log',
              sizeBytes: 119,
              changedAt: '2026-10-23T06:00:00Z',
              compressed: false,
            },
            {
              name: 'backend.log.2026-10-22.0.gz',
              sizeBytes: 90,
              changedAt: '2026-10-22T22:00:00Z',
              compressed: true,
            },
          ],
        },
      ];
    case 'GET /api/admin/operations/logs/backend.log':
      return [
        200,
        {
          name: 'backend.log',
          sizeBytes: 119,
          from: Number(url.searchParams.get('from') ?? 83),
          to: 119,
          hasOlder: true,
          hasNewer: false,
          text: '2026-10-23T10:00:02 INFO third line\n',
        },
      ];
    case 'GET /api/admin/operations/logs/missing.log':
      return [
        404,
        problem(
          404,
          'operations/log-not-found',
          'Log nenalezen',
          'Takový soubor ve složce logů není.',
        ),
      ];
    case 'GET /api/admin/operations/logs/backend.log/search':
      return [
        200,
        {
          name: 'backend.log',
          sizeBytes: 119,
          matches: [{ offset: 36, line: '2026-10-23T10:00:01 WARN second line about Fio' }],
          moreOlder: false,
          scannedFrom: 0,
        },
      ];
    case 'GET /api/admin/operations/loggers':
      return [
        200,
        {
          loggers: [
            { logger: 'ROOT', configuredLevel: 'INFO', effectiveLevel: 'INFO', override: null },
            {
              logger: 'cz.novanadeje.app',
              configuredLevel: 'INFO',
              effectiveLevel: 'DEBUG',
              override: {
                logger: 'cz.novanadeje.app',
                level: 'DEBUG',
                configuredBefore: 'INFO',
                since: '2026-10-23T06:00:00Z',
                until: '2026-10-23T06:30:00Z',
                adminId: DONOR_ID,
              },
            },
          ],
        },
      ];
    case 'GET /api/admin/operations/diagnostics':
      return [
        200,
        {
          now: '2026-10-23T06:05:00Z',
          jvm: {
            javaVersion: '25.0.4',
            startedAt: '2026-10-23T05:00:00Z',
            heapUsedBytes: 123,
            heapMaxBytes: 456,
            liveThreads: 40,
          },
          database: {
            reachable: true,
            pingMillis: 2,
            activeConnections: 0,
            idleConnections: 10,
            waitingThreads: 0,
            maxConnections: 10,
          },
          disks: [{ path: '/logs', mounted: true, freeBytes: 1000, totalBytes: 2000 }],
          logLevelOverrides: [],
        },
      ];
    case 'GET /api/admin/operations/diagnostics/threads':
      return [200, '"main" #1 state=RUNNABLE\n    at java.lang.Thread.run\n'];
    case 'PUT /api/admin/operations/loggers/cz.novanadeje.app':
      return [
        200,
        {
          logger: 'cz.novanadeje.app',
          level: (JSON.parse(body) as { level: string }).level,
          configuredBefore: 'INFO',
          since: '2026-10-23T06:00:00Z',
          until: '2026-10-23T06:30:00Z',
          adminId: DONOR_ID,
        },
      ];
    case 'DELETE /api/admin/operations/loggers/cz.novanadeje.app':
      return [204, undefined];
    case 'DELETE /api/admin/operations/loggers/org.hibernate.SQL':
      return [
        404,
        problem(404, 'operations/log-override-not-found', 'Logger nemá dočasnou úroveň'),
      ];
    case `POST /api/admin/donations/payments/${PAYMENT_ID}/pair`:
      return [
        200,
        {
          id: PAYMENT_ID,
          donation: {
            donorId: (JSON.parse(body) as { donorId: string }).donorId,
            pairedBy: 'MANUAL',
          },
        },
      ];
    case `POST /api/admin/donations/payments/${UNKNOWN_ID}/pair`:
      return [
        404,
        problem(
          404,
          'donations/bank-payment-not-found',
          'Platba nenalezena',
          'Platba s tímto id neexistuje.',
        ),
      ];
    case `POST /api/admin/donations/payments/${PAYMENT_ID}/unpair`:
      return [
        409,
        problem(
          409,
          'donations/donation-has-receipt',
          'Dar má potvrzení',
          'Nejdřív zneplatněte potvrzení.',
        ),
      ];
    case 'POST /api/admin/donations/report/send':
      return [
        200,
        { month: (JSON.parse(body) as { month: string }).month, sentAt: '2026-10-23T06:30:00Z' },
      ];
    case 'POST /api/admin/operations/backups/requests':
      return [202, { requestId: UNKNOWN_ID, kind: (JSON.parse(body) as { kind: string }).kind }];
    case `POST /api/admin/content/news/${UNKNOWN_ID}/publish`:
      return [
        200,
        { id: UNKNOWN_ID, publishedOn: (JSON.parse(body) as { publishedOn: string }).publishedOn },
      ];
    default:
      return [404, problem(404, 'not-found', 'Nenalezeno')];
  }
}

function tokenExchange(form: URLSearchParams): [number, unknown] {
  if (form.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:token-exchange') {
    return [400, { error: 'unsupported_grant_type' }];
  }
  if (form.get('resource') !== `${ISSUER}/api`) {
    return [400, { error: 'invalid_target', error_description: 'unknown resource' }];
  }
  const apiToken = API_TOKEN_OF[form.get('subject_token') ?? ''];
  if (apiToken === undefined) {
    return [
      400,
      {
        error: 'invalid_grant',
        error_description: 'the subject token was not issued for the connector',
      },
    ];
  }
  const scope = apiToken === 'api-token-write' ? 'admin:read admin:write' : 'admin:read';
  return [
    200,
    {
      access_token: apiToken,
      token_type: 'Bearer',
      expires_in: 900,
      scope,
      issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    },
  ];
}

export function metadata(): Record<string, unknown> {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/pripojeni`,
    token_endpoint: `${ISSUER}/api/donors/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
      'urn:ietf:params:oauth:grant-type:token-exchange',
    ],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['admin:read', 'admin:write'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

function problem(
  status: number,
  code: string,
  title: string,
  detail = '',
): Record<string, unknown> {
  return { type: `https://nfnn.cz/problems/${code}`, title, status, detail };
}

function jwt(subject: string, scope: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode({ sub: subject, scope, aud: `${ISSUER}/mcp` })}.signature`;
}
