import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';

const SCRIPT = fileURLToPath(new URL('compare-v2.mjs', import.meta.url));
const FEATURE = 'donors/admin_donors';
const SCENARIO = 'An administrator reads a donor #1';
const REQUEST = 'GET /api/admin/donors/{id} #1';
const LOG = 'INFO donors.application.DonorEmailVerificationService: E-mail of donor <id:1> verified';
const MAIL = {
  from: ['"Nová naděje – nadační fond" <info@nfnn.cz>'],
  to: ['jana@example.cz'],
  subject: 'Potvrďte svůj e-mail',
  text: 'Dobrý den,\nklikněte na odkaz.\n',
};

function transcriptFile() {
  return {
    source: 'v2-baseline',
    feature: FEATURE,
    scenarios: {
      [SCENARIO]: {
        requests: {
          [REQUEST]: {
            request: { path: '/api/admin/donors/<id:2>', headers: { Authorization: 'Bearer <jwt>' } },
            response: {
              status: 200,
              headers: {
                'cache-control': 'no-cache, no-store, max-age=0, must-revalidate',
                'content-type': 'application/json',
              },
              body: { donorId: '<id:2>', name: 'Jana Nováková', addresses: [{ city: 'Nový Bor' }] },
            },
          },
        },
        mails: [MAIL],
        logs: [LOG],
      },
    },
  };
}

function inventory(suites) {
  return {
    source: 'v2-baseline',
    counts: Object.fromEntries(Object.entries(suites).map(([name, tests]) => [name, tests.length])),
    suites,
  };
}

const INVENTORY = {
  'backend-junit': ['donors.DonorTest > Given a donor, when read, then shown'],
  'mcp-vitest': ['test/tools.spec.ts > Given a token > when listed, then shown'],
};

const workspaces = [];

function workspace({ change = () => {}, changes = {}, freshInventory } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'compare-v2-'));
  workspaces.push(root);
  const write = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
  };
  write(`baseline/${FEATURE}.json`, transcriptFile());
  const recorded = transcriptFile();
  change(recorded, write);
  write(`recording/${FEATURE}.json`, recorded);
  mkdirSync(join(root, 'changes'), { recursive: true });
  for (const [name, entries] of Object.entries(changes)) {
    write(`changes/${name}`, entries);
  }
  write('inventory-baseline.json', inventory(INVENTORY));
  if (freshInventory) {
    write('inventory.json', inventory(freshInventory));
  }
  return root;
}

function compare(root, extra = []) {
  const run = spawnSync(
    process.execPath,
    [
      SCRIPT,
      `--baseline=${join(root, 'baseline')}`,
      `--recording=${join(root, 'recording')}`,
      `--changes=${join(root, 'changes')}`,
      `--inventory-baseline=${join(root, 'inventory-baseline.json')}`,
      `--report=${join(root, 'report.md')}`,
      ...extra,
    ],
    { encoding: 'utf8' },
  );
  let report = '';
  try {
    report = readFileSync(join(root, 'report.md'), 'utf8');
  } catch {
    report = '';
  }
  return { status: run.status, output: `${run.stdout}${run.stderr}`, report };
}

const scenarioOf = (file) => file.scenarios[SCENARIO];
const callOf = (file) => scenarioOf(file).requests[REQUEST];

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop(), { recursive: true, force: true });
  }
});

describe('Given a recording identical to the v2 baseline', () => {
  it('when compared, then it passes and the report says that nothing differs', () => {
    const result = compare(workspace());
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /^## Srovnání s v2/);
    assert.match(result.report, /Žádný nedeklarovaný rozdíl/);
  });
});

describe('Given a recording whose response lost a field', () => {
  const removed = (recorded) => delete callOf(recorded).response.body.name;

  it('when nothing declares it, then it fails and names the field, the request and the scenario', () => {
    const result = compare(workspace({ change: removed }));
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /body/);
    assert.match(result.report, /\$\.name/);
    assert.match(result.report, /odebráno/);
    assert.match(result.report, /GET \/api\/admin\/donors\/\{id\} #1/);
    assert.match(result.report, /donors\/admin_donors: An administrator reads a donor #1/);
    assert.match(result.output, /::error::.*body.*\$\.name/);
  });

  it('when a slice file declares it, then it passes and the report lists the declaration with its reason', () => {
    const declaration = {
      path: 'GET /api/admin/donors/{id}',
      scenario: 'donors/admin_donors: An administrator reads*',
      kind: 'body',
      reason: '1.7 moves the name into the profile',
      contract: 'docs/api-contract.md, Administration',
    };
    const result = compare(workspace({ change: removed, changes: { '1.7.json': [declaration] } }));
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /1\.7\.json/);
    assert.match(result.report, /1\.7 moves the name into the profile/);
  });

  it('when only another slice declares a different kind, then it still fails', () => {
    const declaration = { path: '*', scenario: '*', kind: 'status', reason: 'unrelated' };
    const result = compare(workspace({ change: removed, changes: { '0.5.json': [declaration] } }));
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /Nepoužité deklarace/);
  });
});

describe('Given a recording that changed a value, a status, a header and the sent request', () => {
  it('when compared, then each one fails under its own kind', () => {
    const result = compare(
      workspace({
        change: (recorded) => {
          const call = callOf(recorded);
          call.response.body.addresses[0].city = 'Liberec';
          call.response.status = 404;
          call.response.headers['cache-control'] = 'public, max-age=60';
          call.request.headers['Accept-Language'] = 'en';
        },
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /\$\.addresses\[0\]\.city.*Nový Bor.*Liberec/);
    assert.match(result.report, /status.*200 → 404/);
    assert.match(result.report, /headers.*cache-control/);
    assert.match(result.report, /request/);
  });
});

describe('Given a recording with additions only', () => {
  it('when compared, then a new field, header, request, scenario, mail and known log line all pass and are counted', () => {
    const result = compare(
      workspace({
        change: (recorded) => {
          const call = callOf(recorded);
          call.response.body.registeredAt = '2026-11-04T09:00:00Z';
          call.response.headers['nfnn-revision'] = 'dev';
          scenarioOf(recorded).requests['GET /api/admin/donors #1'] = call;
          scenarioOf(recorded).mails.push({ ...MAIL, subject: 'Nový přehled' });
          scenarioOf(recorded).logs.push(LOG.replace('<id:1>', '<id:7>'));
          recorded.scenarios['An administrator lists donors #1'] = scenarioOf(transcriptFile());
        },
      }),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /Přidáno/);
    assert.match(result.report, /An administrator lists donors #1/);
  });
});

describe('Given a recording that changed or lost a mail', () => {
  it('when the text changed, then it fails and shows the first differing line', () => {
    const result = compare(
      workspace({
        change: (recorded) => {
          scenarioOf(recorded).mails[0] = { ...MAIL, text: 'Dobrý den,\nklikněte na tlačítko.\n' };
        },
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /mails/);
    assert.match(result.report, /Potvrďte svůj e-mail/);
    assert.match(result.report, /klikněte na odkaz\..*klikněte na tlačítko\./);
  });

  it('when the mail is gone, then it fails as a removed mail', () => {
    const result = compare(workspace({ change: (recorded) => (scenarioOf(recorded).mails = []) }));
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /mails.*odebráno.*Potvrďte svůj e-mail/);
  });
});

describe('Given a recording with a log line of a shape v2 never wrote', () => {
  const newField = (recorded) =>
    scenarioOf(recorded).logs.push(
      'INFO donors.application.DonorAuthenticationService: Sign-in of donor <id:1> from 203.0.113.7',
    );
  const declared = (extra) => ({
    'pr-200.json': [
      {
        kind: 'log-field',
        line: 'donors.application.DonorAuthenticationService: Sign-in of donor <id> from *',
        reason: 'the sign-in names the client address',
        ...extra,
      },
    ],
  });

  it('when nothing allows it, then it fails as a new log field', () => {
    const result = compare(workspace({ change: newField }));
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /log-field/);
    assert.match(result.report, /Sign-in of donor <id> from <n>\.<n>\.<n>\.<n>/);
  });

  it('when it is allowed without the security OK, then it still fails and says the flag is missing', () => {
    const result = compare(workspace({ change: newField, changes: declared({}) }));
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /securityOk/);
  });

  it('when it is allowed with the security OK, then it passes', () => {
    const result = compare(workspace({ change: newField, changes: declared({ securityOk: true }) }));
    assert.equal(result.status, 0, result.output);
  });

  it('when a known log line changed, then it fails as a changed log line', () => {
    const result = compare(
      workspace({ change: (recorded) => (scenarioOf(recorded).logs = [LOG.replace('INFO', 'WARN')]) }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /logs/);
    assert.match(result.report, /WARN donors\.application\.DonorEmailVerificationService/);
  });
});

describe('Given a recording that lost a scenario and a request', () => {
  it('when the scenario is gone, then it fails as removed', () => {
    const result = compare(workspace({ change: (recorded) => (recorded.scenarios = {}) }));
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /removed.*An administrator reads a donor #1/);
  });

  it('when the request is gone and two slice files declare it and another change, then both files are merged', () => {
    const result = compare(
      workspace({
        change: (recorded) => {
          scenarioOf(recorded).requests = {};
          scenarioOf(recorded).logs = [];
        },
        changes: {
          '1.4.json': [{ path: 'GET /api/admin/donors/{id}', scenario: '*', kind: 'removed', reason: '1.4 drops it' }],
          '1.6.json': [{ path: '*', scenario: `${FEATURE}: *`, kind: 'logs', reason: '1.6 logs elsewhere' }],
        },
      }),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /1\.4\.json/);
    assert.match(result.report, /1\.6\.json/);
  });
});

describe('Given a slice file that is not a valid declaration', () => {
  it('when an entry has no reason, then the comparison refuses to run and names the file and the entry', () => {
    const result = compare(
      workspace({ changes: { '0.9.json': [{ path: '*', scenario: '*', kind: 'body' }] } }),
    );
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /0\.9\.json.*entry 1.*reason/);
  });

  it('when an entry names an unknown kind, then the comparison refuses to run', () => {
    const result = compare(
      workspace({ changes: { '0.9.json': [{ path: '*', scenario: '*', kind: 'whatever', reason: 'x' }] } }),
    );
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /0\.9\.json.*entry 1.*kind/);
  });
});

describe('Given a fresh test inventory', () => {
  const withoutBackendTest = { ...INVENTORY, 'backend-junit': [] };

  it('when every v2 test is still there and one is new, then it passes', () => {
    const fresh = { ...INVENTORY, 'mcp-vitest': [...INVENTORY['mcp-vitest'], 'test/new.spec.ts > Given x > when y, then z'] };
    const root = workspace({ freshInventory: fresh });
    const result = compare(root, [`--inventory=${join(root, 'inventory.json')}`]);
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /Testy/);
  });

  it('when a v2 test vanished, then it fails and names the suite and the test', () => {
    const root = workspace({ freshInventory: withoutBackendTest });
    const result = compare(root, [`--inventory=${join(root, 'inventory.json')}`]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /retired/);
    assert.match(result.report, /backend-junit/);
    assert.match(result.report, /Given a donor, when read, then shown/);
  });

  it('when a slice file names its replacement and the reason, then it passes', () => {
    const root = workspace({
      freshInventory: withoutBackendTest,
      changes: {
        '1.2.json': [
          {
            kind: 'retired',
            suite: 'backend-junit',
            test: 'donors.DonorTest > Given a donor, when read, then shown',
            replacement: 'donors.DonorProfileTest > Given a donor, when read, then shown',
            reason: '1.2 splits the donor test',
          },
        ],
      },
    });
    const result = compare(root, [`--inventory=${join(root, 'inventory.json')}`]);
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /DonorProfileTest/);
  });

  it('when a retirement names no replacement, then the comparison refuses to run', () => {
    const root = workspace({
      freshInventory: withoutBackendTest,
      changes: { '1.2.json': [{ kind: 'retired', suite: 'backend-junit', test: '*', reason: 'gone' }] },
    });
    const result = compare(root, [`--inventory=${join(root, 'inventory.json')}`]);
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /replacement/);
  });
});
