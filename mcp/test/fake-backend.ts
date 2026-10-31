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
export const GIVING_DONOR_ID = '019a0000-0000-7000-8000-000000000003';
export const MEDIA_ID = '019a0000-0000-7000-8000-000000000004';
export const DONATION_ID = '019a0000-0000-7000-8000-000000000005';
export const LINK_ID = '019a0000-0000-7000-8000-000000000006';
export const PERSON_ID = '019a0000-0000-7000-8000-000000000007';
export const SIGNED_PERSON_ID = '019a0000-0000-7000-8000-000000000008';
const LOG_MATCHES: Record<string, number[]> = {
  'backend.log': [36],
  'backend.log.2026-10-22.0.gz': [70, 50, 10],
  'backend.log.2026-10-21.0.gz': [5],
};

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | undefined;
  readonly accept: string | undefined;
  readonly contentType: string | undefined;
  readonly forwardedFor: string | undefined;
  readonly body: string;
}

export class FakeBackend {
  readonly requests: RecordedRequest[] = [];
  metadataAvailable = true;
  receiptSigningKeysAvailable = true;
  receiptSigningKeysAnswer: Record<string, unknown> | undefined;
  previousSignInAt: string | null = '2026-10-28T20:14:00Z';
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
      accept: request.headers['accept'],
      contentType: request.headers['content-type'],
      forwardedFor: request.headers['x-forwarded-for'] as string | undefined,
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
    if (request.method === 'GET' && url.pathname === '/api/admin/donors/me/previous-sign-in') {
      return [200, { previousSignInAt: this.previousSignInAt }];
    }
    if (
      !this.receiptSigningKeysAvailable &&
      url.pathname === '/api/admin/donations/receipt-signing-keys'
    ) {
      return [404, problem(404, 'not-found', 'Nenalezeno')];
    }
    if (
      this.receiptSigningKeysAnswer &&
      request.method === 'GET' &&
      url.pathname === '/api/admin/donations/receipt-signing-keys'
    ) {
      return [200, this.receiptSigningKeysAnswer];
    }
    return adminRoute(request, url, body);
  }
}

function adminRoute(request: RecordedRequest, url: URL, body: string): [number, unknown] {
  const search = /^\/api\/admin\/operations\/logs\/([^/]+)\/search$/.exec(url.pathname);
  if (request.method === 'GET' && search) {
    return logSearch(decodeURIComponent(search[1] ?? ''), url.searchParams);
  }
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
    case 'GET /api/admin/donations/receipt-signing-keys':
      return [
        200,
        {
          currentKeyId: '21fe31df',
          currentKeyPublished: true,
          keys: [
            {
              keyId: '39f713d0',
              status: 'active',
              registeredAt: '2026-11-01T07:00:00Z',
              published: false,
              current: false,
            },
            {
              keyId: '21fe31df',
              status: 'active',
              registeredAt: '2026-11-13T11:00:00Z',
              published: true,
              current: true,
            },
          ],
          auditMismatches: [],
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
    case 'GET /api/admin/donations/overview/since':
      return [
        200,
        {
          from: url.searchParams.get('from') ?? '2026-10-28T20:14:00Z',
          payments: { count: 5, totalMinor: 1250000, currency: 'CZK' },
          paired: { count: 3, totalMinor: 750000, currency: 'CZK' },
          unpaired: { count: 2, totalMinor: 500000, currency: 'CZK' },
          newDonors: 3,
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
          total: 3,
        },
      ];
    case 'GET /api/admin/donors':
      return [
        200,
        {
          items: [{ donorId: DONOR_ID, name: 'Jana Nováková', email: 'jana@example.cz' }],
          hasMore: url.searchParams.get('page') === '0',
        },
      ];
    case `GET /api/admin/donors/${DONOR_ID}`:
      return [
        200,
        { donorId: DONOR_ID, name: 'Jana Nováková', registeredAt: '2026-10-17T10:00:00Z' },
      ];
    case `GET /api/admin/donors/${GIVING_DONOR_ID}`:
      return [200, { donorId: GIVING_DONOR_ID, ...PETR, email: 'petr@example.cz' }];
    case `GET /api/admin/donations/donors/${GIVING_DONOR_ID}`:
      return [
        200,
        {
          donor: {
            donorId: GIVING_DONOR_ID,
            ...PETR,
            variableSymbol: '1234567890',
            erasedAt: null,
          },
          bankAccounts: [],
          donations: {
            items: Array.from({ length: 25 }, (_, index) => ({
              id: `donation-${25 - index}`,
              receivedAt: '2026-10-01',
              amountMinor: 10000,
            })),
            totalAmountMinor: 250000,
            currency: 'CZK',
            count: 25,
          },
          receipts: [],
        },
      ];
    case `GET /api/admin/donations/donors/${DONOR_ID}`:
      return [404, problem(404, 'donations/donor-not-found', 'Dárce nemá záznam')];
    case 'GET /api/admin/donors/actions':
      return [
        200,
        {
          items: [
            { action: 'SEND_MONTHLY_REPORT', performedAt: '2026-10-23T07:30:00.123456Z' },
            { action: 'PAIR_PAYMENT', performedAt: '2026-10-23T06:00:00.654321Z' },
          ],
          hasMore: true,
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
              donationCount: 2,
            },
          ],
        },
      ];
    case 'PUT /api/admin/donations/report/settings':
      return [200, JSON.parse(body)];
    case 'PUT /api/admin/operations/backups/schedule':
      return [
        200,
        {
          ...JSON.parse(body),
          applied: { backupTime: '03:00', testRestoreDay: 7, testRestoreTime: '04:00' },
        },
      ];
    case 'GET /api/admin/content/people':
      return [200, people()];
    case 'POST /api/admin/content/people':
      return [201, person(PERSON_ID, 1, JSON.parse(body) as Record<string, unknown>)];
    case `PUT /api/admin/content/people/${PERSON_ID}`:
      return [200, person(PERSON_ID, 1, JSON.parse(body) as Record<string, unknown>)];
    case `DELETE /api/admin/content/people/${PERSON_ID}`:
      return [204, undefined];
    case `DELETE /api/admin/content/people/${SIGNED_PERSON_ID}`:
      return [204, undefined];
    case `POST /api/admin/content/people/${PERSON_ID}/web-signature`: {
      const imageId = (JSON.parse(body) as Record<string, unknown>)['imageId'];
      return [
        200,
        {
          ...person(PERSON_ID, 1, { name: 'Adam Vzor', onBoard: true, featured: false }),
          webSignature: {
            id: imageId,
            url: `/api/content/media/${String(imageId)}`,
            width: 600,
            height: 180,
          },
        },
      ];
    }
    case `DELETE /api/admin/content/people/${SIGNED_PERSON_ID}/web-signature`:
      return [
        200,
        person(SIGNED_PERSON_ID, 0, { name: 'Eva Vzorová', onBoard: true, featured: true }),
      ];
    case 'PUT /api/admin/content/people/order':
      return [200, people()];
    case 'PUT /api/admin/content/people/note': {
      const note = JSON.parse(body) as Record<string, unknown>;
      return [200, { text: note['text'] ?? null }];
    }
    case 'PUT /api/admin/content/people/footnote': {
      const footnote = JSON.parse(body) as Record<string, unknown>;
      return [200, { text: footnote['text'] ?? null }];
    }
    case 'GET /api/admin/content/about':
      return [
        200,
        { photo: aboutPhoto({ photoAlt: 'Malý chlapec', caption: 'Kde to všechno začalo' }) },
      ];
    case 'PUT /api/admin/content/about': {
      const about = JSON.parse(body) as Record<string, unknown>;
      return [200, { photo: about['photoId'] === null ? null : aboutPhoto(about) }];
    }
    case 'POST /api/admin/content/news':
      return [201, { id: UNKNOWN_ID, slug: 'letni-tabor', ...content(body) }];
    case `PUT /api/admin/content/news/${UNKNOWN_ID}`:
    case `PUT /api/admin/content/projects/${UNKNOWN_ID}`:
      return [200, { id: UNKNOWN_ID, ...content(body) }];
    case 'POST /api/admin/content/projects':
      return [201, { id: UNKNOWN_ID, slug: 'nova-strecha', ...content(body) }];
    case `POST /api/admin/donations/donors/${DONOR_ID}/bank-accounts/${LINK_ID}/disconnect`:
      return [204, undefined];
    case `POST /api/admin/donations/donors/${DONOR_ID}/bank-accounts/${PAYMENT_ID}/disconnect`:
      return [
        409,
        problem(
          409,
          'donations/bank-account-already-disconnected',
          'Párování z účtu je už vypnuté',
        ),
      ];
    case `POST /api/admin/donations/donors/${DONOR_ID}/bank-accounts/${PAYMENT_ID}/reconnect`:
      return [204, undefined];
    case 'GET /api/admin/donations/report':
      return [200, { settings: { recipients: ['info@nfnn.cz'], sendDay: 1 }, sentReports: [] }];
    case 'GET /api/admin/donations/receipt-signature':
      return [
        200,
        {
          configured: true,
          image: 'data:image/png;base64,iVBORw0KGgo=',
          width: 1200,
          height: 400,
          uploadedAt: '2026-10-23T19:30:00Z',
        },
      ];
    case 'GET /api/admin/operations/settings':
      return [
        200,
        {
          settings: [
            { name: 'PUBLIC_URL', group: 'SITE', secret: false, value: 'https://nfnn.cz' },
            { name: 'MAIL_HOST', group: 'MAIL', secret: false, value: 'smtp-relay.brevo.com' },
            { name: 'MAIL_PORT', group: 'MAIL', secret: false, value: '587' },
            { name: 'MAIL_USERNAME', group: 'MAIL', secret: false, value: 'abc@smtp-brevo.com' },
            { name: 'MAIL_PASSWORD', group: 'MAIL', secret: true, value: null, configured: true },
            { name: 'MAIL_AUTH', group: 'MAIL', secret: false, value: 'true' },
            { name: 'MAIL_STARTTLS', group: 'MAIL', secret: false, value: 'true' },
            { name: 'MAIL_FROM', group: 'MAIL', secret: false, value: 'info@nfnn.cz' },
            { name: 'FIO_TOKEN', group: 'BANK', secret: true, value: null, configured: true },
          ],
          secretsCanBeStored: true,
        },
      ];
    case 'POST /api/admin/operations/settings/test-email':
      return [200, { outcome: 'SENT', sent: true, recipient: 'jana@example.cz' }];
    case 'PUT /api/admin/operations/settings':
      return body.includes('"26"')
        ? [
            400,
            {
              ...problem(400, 'operations/invalid-settings', 'Nastavení nejde uložit'),
              errors: [
                {
                  field: 'RECEIPT_FIRST_YEAR',
                  code: 'invalid-year',
                  message: 'Rok musí být mezi 2000 a 2100.',
                },
              ],
            },
          ]
        : [202, { changed: ['RECEIPT_FIRST_YEAR'], restarting: true }];
    case 'GET /api/admin/content/news':
      return [
        200,
        {
          items: [
            {
              id: UNKNOWN_ID,
              title: 'Koncept',
              publishedOn: '2026-11-01',
              live: false,
              body: 'Dlouhý text aktuality.',
            },
          ],
        },
      ];
    case 'GET /api/admin/content/projects':
      return [200, { items: [] }];
    case 'GET /api/admin/content/project-order':
      return [200, { order: 'YEAR_THEN_CATEGORY' }];
    case 'PUT /api/admin/content/project-order':
      return [200, { order: (JSON.parse(body) as Record<string, unknown>)['order'] }];
    case `GET /api/admin/content/news/${UNKNOWN_ID}`:
      return [200, { id: UNKNOWN_ID, title: 'Koncept', body: 'Dlouhý text aktuality.' }];
    case `GET /api/admin/content/projects/${UNKNOWN_ID}`:
      return [200, { id: UNKNOWN_ID, title: 'Střecha', year: 2026, body: 'Text projektu.' }];
    case 'POST /api/admin/content/media':
      if (
        !request.contentType?.startsWith('multipart/form-data') ||
        !body.includes('name="file"')
      ) {
        return [400, problem(400, 'validation', 'Chybí soubor')];
      }
      return body.includes('not-an-image')
        ? [400, problem(400, 'content/unsupported-image', 'Obrázek nejde použít', 'Nejde přečíst.')]
        : [201, { id: MEDIA_ID, url: `/media/${MEDIA_ID}`, width: 1600, height: 1200 }];
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
            {
              name: 'backend.log.2026-10-21.0.gz',
              sizeBytes: 80,
              changedAt: '2026-10-21T22:00:00Z',
              compressed: true,
            },
            {
              name: 'nginx-access.log',
              sizeBytes: 50,
              changedAt: '2026-10-23T06:00:00Z',
              compressed: false,
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
      return request.accept?.includes('text/plain')
        ? [200, '"main" #1 state=RUNNABLE\n    at java.lang.Thread.run\n']
        : [406, problem(406, 'not-acceptable', 'Not Acceptable')];
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
      return [200, { donationId: DONATION_ID, changedYearlyReceipts: [] }];
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

function content(body: string): Record<string, unknown> {
  const { coverImageId, coverImageAlt, signerId, ...fields } = JSON.parse(body) as Record<
    string,
    unknown
  >;
  return {
    ...fields,
    ...(typeof signerId === 'string'
      ? {
          signer: {
            id: signerId,
            name: 'Pavel Vzorový',
            role: 'Předseda správní rady',
            portrait: {
              id: MEDIA_ID,
              url: `/api/content/media/${MEDIA_ID}`,
              width: 640,
              height: 640,
            },
          },
        }
      : {}),
    coverImage:
      typeof coverImageId === 'string'
        ? {
            id: coverImageId,
            url: `/api/content/media/${coverImageId}`,
            alt: coverImageAlt ?? null,
          }
        : null,
  };
}

const PETR = {
  name: 'Petr Svoboda',
  type: 'PERSON',
  address: { street: 'Hlavní 1', city: 'Nový Bor', postalCode: '47301' },
  registeredAt: '2026-10-01T08:00:00Z',
};

const BROWSER_ERROR_LINES = [
  '2026-11-04T10:00:01.000Z  WARN 1 --- [nova-nadeje] [exec-1] c.n.app.operations.clienterrors          : Browser error kind=pdf-render place=global name=TypeError version=1a2b3c4 browser=safari/18 os=ios display=standalone count=2',
  '2026-11-04T11:00:00.000Z  WARN 1 --- [nova-nadeje] [scheduling-1] c.n.app.operations.clienterrors          : Browser error reports over the hourly cap bucket=general dropped=2',
];

function logSearch(name: string, params: URLSearchParams): [number, unknown] {
  const offsets = LOG_MATCHES[name];
  if (offsets === undefined) {
    return [404, problem(404, 'operations/log-not-found', 'Log nenalezen')];
  }
  if (params.get('pattern') === 'Browser error') {
    return [
      200,
      {
        name,
        sizeBytes: 400,
        matches: BROWSER_ERROR_LINES.map((line, index) => ({
          offset: index * 200,
          line,
        })).reverse(),
        moreOlder: false,
        scannedFrom: 0,
      },
    ];
  }
  const before = params.has('before') ? Number(params.get('before')) : Infinity;
  const limit = Number(params.get('limit') ?? 50);
  const older = offsets.filter((offset) => offset < before);
  const kept = older.slice(0, limit);
  return [
    200,
    {
      name,
      sizeBytes: 119,
      matches: kept.map((offset) => ({ offset, line: `${name} line at ${offset} about Fio` })),
      moreOlder: older.length > limit,
      scannedFrom: older.length > limit ? (kept[kept.length - 1] ?? 0) : 0,
    },
  ];
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

function aboutPhoto(about: Record<string, unknown>): Record<string, unknown> {
  return {
    id: MEDIA_ID,
    url: `/api/content/media/${MEDIA_ID}`,
    width: 1200,
    height: 1600,
    alt: about['photoAlt'] ?? null,
    caption: about['caption'] ?? null,
  };
}

function people(): Record<string, unknown> {
  return {
    members: [
      {
        ...person(SIGNED_PERSON_ID, 0, {
          name: 'Eva Vzorová',
          role: 'Zakladatelka a předsedkyně rady',
          onBoard: true,
          boardNote: 'předsedkyně',
          featured: true,
          portraitId: MEDIA_ID,
          fundEmail: 'eva@nfnn.cz',
        }),
        webSignature: {
          id: UNKNOWN_ID,
          url: `/api/content/media/${UNKNOWN_ID}`,
          width: 600,
          height: 180,
        },
      },
      person(PERSON_ID, 1, { name: 'Adam Vzor', onBoard: true, featured: false }),
    ],
    note: 'Děkujeme všem, kdo pomáhají s námi.',
    footnote: 'Web zajišťuje bez nároku na odměnu Petr Vzor.',
  };
}

function person(
  id: string,
  position: number,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const portraitId = fields['portraitId'];
  return {
    id,
    name: fields['name'],
    role: fields['role'] ?? null,
    position,
    onBoard: fields['onBoard'],
    boardNote: fields['boardNote'] ?? null,
    featured: fields['featured'],
    portrait:
      typeof portraitId === 'string'
        ? { id: portraitId, url: `/api/content/media/${portraitId}`, width: 640, height: 640 }
        : null,
    webSignature: null,
    personalEmail: fields['personalEmail'] ?? null,
    fundEmail: fields['fundEmail'] ?? null,
    linkedToAccount: false,
  };
}
