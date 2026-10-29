import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AUTHORIZATION_CALLS,
  checkBackendShapes,
  connectorCalls,
  declaredAdditions,
  fakeBackendRequests,
  recordedAnswers,
  askFakeBackend,
  type ConnectorCall,
  type FakeRequest,
  type FixtureAnswer,
} from './backend-shapes.js';
import * as fake from './fake-backend.js';

const MCP = resolve(import.meta.dirname, '..');
const REPOSITORY = resolve(MCP, '..');
const BASELINE = join(REPOSITORY, 'regression/v2/api');

const roots: string[] = [];

function folder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'backend-shapes-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function transcripts(requests: Record<string, { status: number; body?: unknown }>): string {
  const scenario = {
    requests: Object.fromEntries(
      Object.entries(requests).map(([key, { status, body }]) => [
        key,
        { request: { path: '/x' }, response: { status, headers: {}, body } },
      ]),
    ),
    mails: [],
    logs: [],
  };
  return folder({
    'donations/admin.json': JSON.stringify({
      source: 'v2-baseline',
      feature: 'donations/admin',
      scenarios: { 'An administrator reads #1': scenario },
    }),
  });
}

const OVERVIEW: ConnectorCall = {
  method: 'GET',
  template: '/api/admin/donations/overview',
  source: 'src/tools/reading.ts:74',
  accept: 'application/json',
  photo: false,
};

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop() ?? '', { recursive: true, force: true });
  }
});

describe('Given connector source files', () => {
  it('when its backend calls are collected, then each names its method, its path template and its line', () => {
    const src = folder({
      'tools/reading.ts': [
        "const a = await backend.get('/api/admin/donations/import-state', apiToken);",
        'const b = await backend',
        '  .get(`/api/admin/donations/overview${year === undefined ? `` : `?year=${year}`}`, apiToken);',
        'await deps.backend.postPhoto(`/api/admin/content/media`, token, photo);',
        'await backend.getText(`/api/admin/operations/logs/${encodeURIComponent(file)}${suffix}`, t);',
        'await backend.delete(`/api/admin/donations/donors/${donorId}/bank-accounts/${linkId}?x=1`, t);',
      ].join('\n'),
    });
    expect(connectorCalls(src)).toEqual([
      {
        method: 'GET',
        template: '/api/admin/donations/import-state',
        source: 'tools/reading.ts:1',
        accept: 'application/json',
        photo: false,
      },
      {
        method: 'GET',
        template: '/api/admin/donations/overview',
        source: 'tools/reading.ts:2',
        accept: 'application/json',
        photo: false,
      },
      {
        method: 'POST',
        template: '/api/admin/content/media',
        source: 'tools/reading.ts:4',
        accept: 'application/json',
        photo: true,
      },
      {
        method: 'GET',
        template: '/api/admin/operations/logs/{name}',
        source: 'tools/reading.ts:5',
        accept: 'text/plain',
        photo: false,
      },
      {
        method: 'DELETE',
        template: '/api/admin/donations/donors/{id}/bank-accounts/{id}',
        source: 'tools/reading.ts:6',
        accept: 'application/json',
        photo: false,
      },
    ]);
  });
});

describe('Given recorded transcripts', () => {
  const answer = (body: unknown, status = 200): FixtureAnswer => ({
    method: 'GET',
    path: '/api/admin/donations/overview?year=2026',
    status,
    body,
  });
  const recorded = () =>
    recordedAnswers(
      transcripts({
        'GET /api/admin/donations/overview #1': {
          status: 200,
          body: {
            year: 2026,
            received: { count: 1, totalMinor: 100, currency: 'CZK' },
            months: [],
          },
        },
        'GET /api/admin/donations/overview #2': { status: 400, body: { type: 'x', title: 'y' } },
      }),
    );

  it('when a connector call has no transcript, then the check names the call and where it is made', () => {
    const problems = checkBackendShapes({
      calls: [
        OVERVIEW,
        { ...OVERVIEW, template: '/api/admin/donations/forecast', source: 'f.ts:9' },
      ],
      recorded: recorded(),
      fixtures: [],
    });
    expect(problems).toEqual([
      'GET /api/admin/donations/forecast (f.ts:9) is called by the connector, but no transcript records it',
    ]);
  });

  it('when a call without a transcript is declared as added since v2, then the check accepts it', () => {
    const forecast = { ...OVERVIEW, template: '/api/admin/donations/forecast', source: 'f.ts:9' };
    const problems = checkBackendShapes({
      calls: [OVERVIEW, forecast],
      recorded: recorded(),
      fixtures: [],
      addedSinceV2: ['GET /api/admin/donations/forecast'],
    });
    expect(problems).toEqual([]);
  });

  it('when a fixture has the recorded shape with fewer fields, then the check passes', () => {
    const problems = checkBackendShapes({
      calls: [OVERVIEW],
      recorded: recorded(),
      fixtures: [answer({ year: 2026, received: { count: 1, totalMinor: 99900 } })],
    });
    expect(problems).toEqual([]);
  });

  it('when a fixture has a field no recorded answer has, then the check names the field', () => {
    const problems = checkBackendShapes({
      calls: [OVERVIEW],
      recorded: recorded(),
      fixtures: [answer({ year: 2026, received: { count: 1, average: 5 } })],
    });
    expect(problems).toEqual([
      "the fake's 200 answer to GET /api/admin/donations/overview?year=2026 has $.received.average, which no recorded answer of GET /api/admin/donations/overview has",
    ]);
  });

  it('when a fixture has a field of another type, then the check names both types', () => {
    const problems = checkBackendShapes({
      calls: [OVERVIEW],
      recorded: recorded(),
      fixtures: [answer({ year: '2026' })],
    });
    expect(problems).toEqual([
      "the fake's 200 answer to GET /api/admin/donations/overview?year=2026 has $.year as string, recorded only as number",
    ]);
  });

  const onlyNull = () =>
    recordedAnswers(
      transcripts({
        'GET /api/admin/donations/overview #1': {
          status: 200,
          body: { year: 2026, applied: null },
        },
      }),
    );

  it('when a field recorded only as null has a value in the fixture, then the check names it', () => {
    const problems = checkBackendShapes({
      calls: [OVERVIEW],
      recorded: onlyNull(),
      fixtures: [answer({ applied: { backupTime: '03:00' } })],
    });
    expect(problems).toEqual([
      "the fake's 200 answer to GET /api/admin/donations/overview?year=2026 has $.applied as object, recorded only as null",
    ]);
  });

  it('when that field is listed as recorded only as null, then the fixture may give it a value', () => {
    const problems = checkBackendShapes({
      calls: [OVERVIEW],
      recorded: onlyNull(),
      fixtures: [answer({ applied: { backupTime: '03:00' } })],
      recordedOnlyAsNull: {
        'GET /api/admin/donations/overview $.applied': 'no scenario applies a plan',
      },
    });
    expect(problems).toEqual([]);
  });

  it('when an id placeholder meets only a named path segment, then the call has no transcript', () => {
    const donor: ConnectorCall = {
      ...OVERVIEW,
      template: '/api/admin/donors/{id}',
      source: 'r.ts:1',
    };
    const log: ConnectorCall = {
      ...OVERVIEW,
      template: '/api/admin/operations/logs/{name}',
      source: 'r.ts:2',
    };
    const problems = checkBackendShapes({
      calls: [donor, log],
      recorded: recordedAnswers(
        transcripts({
          'GET /api/admin/donors/actions #1': { status: 200, body: {} },
          'GET /api/admin/operations/logs/{id} #1': { status: 200, body: {} },
          'GET /api/admin/operations/logs/backend.log #1': { status: 200, body: {} },
        }),
      ),
      fixtures: [],
    });
    expect(problems).toEqual([
      'GET /api/admin/donors/{id} (r.ts:1) is called by the connector, but no transcript records it',
    ]);
  });

  it('when a fixture answers with a status no transcript records, then the check names the recorded ones', () => {
    const problems = checkBackendShapes({
      calls: [OVERVIEW],
      recorded: recorded(),
      fixtures: [answer({ type: 'x' }, 404)],
    });
    expect(problems).toEqual([
      'the fake answers GET /api/admin/donations/overview?year=2026 with 404, but the transcripts of GET /api/admin/donations/overview record only 200, 400',
    ]);
  });

  it('when the fake serves a path the connector never calls, then the check names it', () => {
    const problems = checkBackendShapes({
      calls: [OVERVIEW],
      recorded: recorded(),
      fixtures: [{ method: 'GET', path: '/api/admin/donations/forecast', status: 200, body: {} }],
    });
    expect(problems).toEqual([
      'the fake serves GET /api/admin/donations/forecast, which the connector never calls',
    ]);
  });
});

describe('Given the fake backend source', () => {
  it('when its routes are listed, then every case label becomes a request with the constants filled in', () => {
    const source = [
      "    case 'GET /api/admin/donors':",
      '    case `GET /api/admin/donors/${DONOR_ID}`:',
      '    case `POST /api/admin/donations/payments/${PAYMENT_ID}/pair`:',
    ].join('\n');
    expect(fakeBackendRequests(source, { DONOR_ID: 'd-1', PAYMENT_ID: 'p-1' })).toEqual([
      { method: 'GET', path: '/api/admin/donors' },
      { method: 'GET', path: '/api/admin/donors/d-1' },
      { method: 'POST', path: '/api/admin/donations/payments/p-1/pair' },
    ]);
  });
});

describe('Given the regression change files', () => {
  it('when the additions are read, then every request declared as added since v2 is listed', () => {
    const changes = folder({
      '0.3.json': JSON.stringify([
        { path: 'GET /actuator/health', scenario: '*', kind: 'added', reason: 'r' },
        { path: 'GET /api/x', scenario: '*', kind: 'body', reason: 'r' },
      ]),
    });
    expect(declaredAdditions(changes)).toEqual(['GET /actuator/health']);
  });
});

describe('Given the connector, its fake backend and the recorded transcripts', () => {
  const recordedDirectory = process.env['API_TRANSCRIPTS_DIR'];
  const directory =
    recordedDirectory === undefined ? BASELINE : resolve(REPOSITORY, recordedDirectory);
  let backend: fake.FakeBackend;

  beforeAll(async () => {
    backend = new fake.FakeBackend();
    await backend.start();
  });

  afterAll(async () => {
    await backend.stop();
  });

  it('when every backend call is checked, then each has a transcript and every fixture has its recorded shape', async () => {
    const calls = [...connectorCalls(join(MCP, 'src')), ...AUTHORIZATION_CALLS];
    const recorded = recordedAnswers(directory);
    const constants = Object.fromEntries(
      Object.entries(fake).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    const requests: FakeRequest[] = [
      ...fakeBackendRequests(readFileSync(join(MCP, 'test/fake-backend.ts'), 'utf8'), constants),
      ...FAKE_ROUTES_OUTSIDE_CASES,
    ];
    const fixtures: FixtureAnswer[] = [];
    for (const request of requests) {
      fixtures.push(await askFakeBackend(backend.url, request, calls, recorded));
    }
    const problems = checkBackendShapes({
      calls,
      recorded,
      fixtures,
      addedSinceV2:
        recordedDirectory === undefined
          ? declaredAdditions(join(REPOSITORY, 'regression/v2/changes'))
          : [],
    });
    expect(problems).toEqual([]);
    expect(calls.map((call) => `${call.method} ${call.template}`)).toContain(
      'GET /api/admin/donations/overview',
    );
    expect(fixtures.filter((fixture) => fixture.status === 200).length).toBeGreaterThan(30);
  });
});

const FAKE_ROUTES_OUTSIDE_CASES: FakeRequest[] = [
  { method: 'GET', path: '/.well-known/oauth-authorization-server' },
  { method: 'GET', path: '/actuator/info' },
  { method: 'GET', path: '/actuator/health' },
  { method: 'GET', path: '/api/admin/operations/logs/backend.log/search?limit=50' },
  {
    method: 'POST',
    path: '/api/donors/oauth/token',
    contentType: 'application/x-www-form-urlencoded',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      resource: `${fake.ISSUER}/api`,
      subject_token: fake.READ_TOKEN,
    }).toString(),
  },
  {
    method: 'POST',
    path: '/api/donors/oauth/token',
    contentType: 'application/x-www-form-urlencoded',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      resource: `${fake.ISSUER}/api`,
      subject_token: 'not-a-connector-token',
    }).toString(),
  },
];
