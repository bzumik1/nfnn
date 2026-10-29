import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';

const SCRIPT = fileURLToPath(new URL('compare-v2.mjs', import.meta.url));
const FEATURE = 'donors/admin_donors';
const SCENARIO = 'An administrator reads a donor #1';
const REQUEST = 'GET /api/admin/donors/{id} #1';
const LOG =
  'INFO donors.application.DonorEmailVerificationService: E-mail of donor <id:1> verified';
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
            request: {
              path: '/api/admin/donors/<id:2>',
              headers: { Authorization: 'Bearer <jwt>' },
            },
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

function workspace({
  change = () => {},
  changeBaseline = () => {},
  changes = {},
  freshInventory,
  changed,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'compare-v2-'));
  workspaces.push(root);
  const write = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
  };
  const baseline = transcriptFile();
  changeBaseline(baseline);
  write(`baseline/${FEATURE}.json`, baseline);
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
  if (changed) {
    writeFileSync(
      join(root, 'changed.txt'),
      changed.map((path) => path.replace('<changes>', join(root, 'changes'))).join('\n'),
    );
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
      ...(existsSync(join(root, 'changed.txt')) ? [`--changed=${join(root, 'changed.txt')}`] : []),
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
    const declaration = {
      path: 'GET /api/admin/donors',
      scenario: 'donors/admin_donors: *',
      kind: 'status',
      reason: 'unrelated',
      contract: 'docs/api-contract.md, Administration',
    };
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
  const approval = {
    approvedIn: 'PR #200, Jakub 2026-11-12',
    fields: { '<id>': 'the donor id', '<n>': 'the parts of the client address' },
  };
  const declared = (extra) => ({
    'pr-200.json': [
      {
        kind: 'log-field',
        line: 'donors.application.DonorAuthenticationService: Sign-in of donor <id> from <n>.<n>.<n>.<n>',
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

  it('when the declared line is another shape, then it still fails as a new log field', () => {
    const result = compare(
      workspace({
        change: newField,
        changes: {
          'pr-200.json': [
            {
              kind: 'log-field',
              line: 'donors.application.DonorAuthenticationService: Sign-in of donor <id> from <n>.<n>.<n>',
              reason: 'r',
              security: approval,
            },
          ],
        },
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*log-field/);
  });

  it('when it is allowed without a security approval, then the comparison refuses the declaration', () => {
    const result = compare(workspace({ change: newField, changes: declared({}) }));
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /pr-200\.json.*entry 1.*security/);
  });

  it('when it is allowed with the old boolean flag, then the comparison refuses the declaration', () => {
    const result = compare(
      workspace({ change: newField, changes: declared({ securityOk: true }) }),
    );
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /security/);
  });

  it('when the approval does not name every slot of the line, then it fails and names the slot', () => {
    const result = compare(
      workspace({
        change: newField,
        changes: declared({ security: { ...approval, fields: { '<id>': 'the donor id' } } }),
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /<n>/);
    assert.match(result.output, /::error::.*<n>/);
  });

  it('when the approval names every slot, then it passes and the report shows the approval and the line', () => {
    const result = compare(
      workspace({ change: newField, changes: declared({ security: approval }) }),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /### Schváleno bezpečností/);
    assert.match(result.report, /PR #200, Jakub 2026-11-12/);
    assert.match(result.report, /the parts of the client address/);
    assert.match(result.report, /### Změněné a přidané řádky logu/);
    assert.match(result.report, /Sign-in of donor <id:1> from 203\.0\.113\.7/);
  });

  it('when a known log line changed, then it fails as a changed log line', () => {
    const result = compare(
      workspace({
        change: (recorded) => (scenarioOf(recorded).logs = [LOG.replace('INFO', 'WARN')]),
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /logs/);
    assert.match(result.report, /WARN donors\.application\.DonorEmailVerificationService/);
  });

  it('when a sender account is logged where a payment id was, then it is a new log field', () => {
    const line = (payment) =>
      `DEBUG donations.application.pairing.PaymentPairingService: Bank payment ${payment} paired with donor <id:2> by VARIABLE_SYMBOL`;
    const result = compare(
      workspace({
        changeBaseline: (baseline) => scenarioOf(baseline).logs.push(line('1001')),
        change: (recorded) => scenarioOf(recorded).logs.push(line('1001'), line('1234567/0800')),
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /log-field.*Bank payment <digits:7>\/<n> paired/);
  });

  it('when an upper-case name appears where v2 wrote no such word, then it is a new log field', () => {
    const line = (word) =>
      `INFO donations.application.importing.ImportBankPaymentsService: Fio import ${word} completed`;
    const result = compare(
      workspace({
        changeBaseline: (baseline) => scenarioOf(baseline).logs.push(line('STARTUP')),
        change: (recorded) =>
          scenarioOf(recorded).logs.push(line('STARTUP'), line('NOVÁKOVÁ'), line('HOURLY_RUN')),
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.report, /log-field.*Fio import NOVÁKOVÁ completed/);
    assert.doesNotMatch(result.report, /log-field.*HOURLY_RUN/);
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
          '1.4.json': [
            {
              path: 'GET /api/admin/donors/{id}',
              scenario: `${FEATURE}: *`,
              kind: 'removed',
              reason: '1.4 drops it',
              contract: 'docs/api-contract.md, Administration',
            },
          ],
          '1.6.json': [
            {
              line: 'donors.application.DonorEmailVerificationService: E-mail of donor * verified',
              scenario: `${FEATURE}: *`,
              kind: 'logs',
              reason: '1.6 logs elsewhere',
              contract: 'docs/system-overview.md, Donors',
              security: { approvedIn: 'PR #210', fields: {} },
            },
          ],
        },
      }),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /1\.4\.json/);
    assert.match(result.report, /1\.6\.json/);
  });
});

describe('Given declarations that name another line or the whole scenario', () => {
  const lostLog = (recorded) => (scenarioOf(recorded).logs = []);
  const lostRequest = (recorded) => (scenarioOf(recorded).requests = {});
  const logsEntry = (line) => ({
    line,
    scenario: `${FEATURE}: *`,
    kind: 'logs',
    reason: 'r',
    contract: 'docs/system-overview.md, Donors',
    security: { approvedIn: 'PR #210', fields: {} },
  });

  it('when a logs declaration names another logger, then the lost line stays undeclared', () => {
    const result = compare(
      workspace({
        change: lostLog,
        changes: { '1.6.json': [logsEntry('donors.application.DonorAuthenticationService: *')] },
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*logs/);
  });

  it('when a logs declaration names the lost line, then it passes', () => {
    const result = compare(
      workspace({
        change: lostLog,
        changes: {
          '1.6.json': [logsEntry('donors.application.DonorEmailVerificationService: E-mail of *')],
        },
      }),
    );
    assert.equal(result.status, 0, result.output);
  });

  it('when a removal names no path, then it covers the removed scenario and not a removed request', () => {
    const removal = {
      scenario: `${FEATURE}: An administrator reads a donor*`,
      kind: 'removed',
      reason: '1.4 drops the scenario',
      contract: 'docs/api-contract.md, Administration',
    };
    const scenarioGone = compare(
      workspace({
        change: (recorded) => (recorded.scenarios = {}),
        changes: { '1.4.json': [removal] },
      }),
    );
    assert.equal(scenarioGone.status, 0, scenarioGone.output);
    const requestGone = compare(
      workspace({ change: lostRequest, changes: { '1.4.json': [removal] } }),
    );
    assert.equal(requestGone.status, 1, requestGone.output);
    assert.match(requestGone.output, /::error::.*removed/);
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

  const refused = (entry, message) => {
    const result = compare(workspace({ changes: { '0.9.json': [entry] } }));
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, message);
  };
  const body = { kind: 'body', reason: 'r', contract: 'docs/api-contract.md, Administration' };

  const anywhere = `${FEATURE}: *`;
  const approved = { approvedIn: 'PR #1', fields: {} };
  const logs = {
    ...body,
    kind: 'logs',
    scenario: anywhere,
    line: 'donors.application.DonorEmailVerificationService: *',
    security: approved,
  };
  const logField = {
    kind: 'log-field',
    reason: 'r',
    line: 'donors.application.DonorAuthenticationService: Sign-in of donor <id>',
    security: approved,
  };

  it('when an entry covers every path of every scenario, then the comparison refuses it', () => {
    refused({ ...body, path: '*', scenario: '*' }, /0\.9\.json.*entry 1.*path/);
  });

  it('when a path does not start with a method and a literal segment, then the comparison refuses it', () => {
    for (const path of ['* *', '*/*', 'GET *', 'GET /*', '*', 'get /api/x']) {
      refused({ ...body, path, scenario: anywhere }, /entry 1.*path.*METHOD \/segment/);
    }
  });

  it('when a scenario does not start with a literal context and feature, then the comparison refuses it', () => {
    for (const scenario of ['*: *', '*', 'donors/*', 'donors/admin*', '*/admin_donors: *']) {
      refused(
        { ...body, path: 'GET /api/admin/donors/{id}', scenario },
        /entry 1.*scenario.*<context>\/<feature>: /,
      );
    }
  });

  it('when a mails or logs entry names a path, then the comparison refuses it', () => {
    refused(
      { ...body, kind: 'mails', path: 'GET /api/admin/donors/{id}', scenario: anywhere },
      /entry 1.*mails.*path/,
    );
    refused({ ...logs, path: 'GET /api/admin/donors/{id}' }, /entry 1.*logs.*path/);
  });

  it('when a transcript entry names no contract section, then the comparison refuses it', () => {
    refused(
      { kind: 'body', reason: 'r', path: 'GET /api/x', scenario: anywhere },
      /entry 1.*contract/,
    );
  });

  it('when a logs entry carries no security approval, then the comparison refuses it', () => {
    const { security, ...withoutApproval } = logs;
    assert.ok(security);
    refused(withoutApproval, /entry 1.*security/);
  });

  it('when an approval names no review or no fields, then the comparison refuses it', () => {
    refused({ ...logs, security: { fields: {} } }, /approvedIn/);
    refused({ ...logs, security: { approvedIn: 'PR #1' } }, /fields/);
  });

  it('when a logs entry names no line or no literal logger, then the comparison refuses it', () => {
    const { line, ...withoutLine } = logs;
    assert.ok(line);
    refused(withoutLine, /entry 1.*logs.*line/);
    for (const pattern of ['*:*', '* *', '*', 'donors.*: x', 'Donors.Service: x', '*Service: x']) {
      refused({ ...logs, line: pattern }, /entry 1.*line.*logger/);
    }
  });

  it('when a new log field is anything but the exact shape the report printed, then the comparison refuses it', () => {
    for (const line of ['*', '*:*', '* *', `${logField.line} *`, 'Sign-in of donor <id>']) {
      refused({ ...logField, line }, /entry 1.*line/);
    }
  });

  it('when a retirement covers every test, a test file or every suite, then the comparison refuses it', () => {
    const retired = { kind: 'retired', reason: 'r', replacement: 'x' };
    refused({ ...retired, suite: 'backend-junit', test: '*' }, /entry 1.*test/);
    refused({ ...retired, suite: 'backend-junit', test: '* > *' }, /entry 1.*test/);
    refused({ ...retired, suite: 'backend-junit', test: 'donors.* > x' }, /entry 1.*test/);
    refused({ ...retired, suite: '*', test: 'donors.DonorTest > x' }, /entry 1.*suite/);
    refused({ ...retired, suite: 'backend-*', test: 'donors.DonorTest > x' }, /entry 1.*suite/);
  });

  it('when an entry names an unknown kind, then the comparison refuses to run', () => {
    const result = compare(
      workspace({
        changes: { '0.9.json': [{ path: '*', scenario: '*', kind: 'whatever', reason: 'x' }] },
      }),
    );
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /0\.9\.json.*entry 1.*kind/);
  });
});

describe('Given a fresh test inventory', () => {
  const withoutBackendTest = { ...INVENTORY, 'backend-junit': [] };

  it('when every v2 test is still there and one is new, then it passes', () => {
    const fresh = {
      ...INVENTORY,
      'mcp-vitest': [...INVENTORY['mcp-vitest'], 'test/new.spec.ts > Given x > when y, then z'],
    };
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
      changes: {
        '1.2.json': [
          {
            kind: 'retired',
            suite: 'backend-junit',
            test: 'donors.DonorTest > Given a donor, when read, then shown',
            reason: 'gone',
          },
        ],
      },
    });
    const result = compare(root, [`--inventory=${join(root, 'inventory.json')}`]);
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /replacement/);
  });
});

describe('Given the files the pull request changes', () => {
  const status = {
    path: 'GET /api/admin/donors/{id}',
    scenario: 'donors/admin_donors: *',
    kind: 'status',
    reason: 'nothing changed',
    contract: 'docs/api-contract.md, Administration',
  };

  it('when it touches a baseline transcript or the baseline inventory, then the comparison fails and names the file', () => {
    for (const path of [
      'regression/v2/api/donors/admin_donors.json',
      'regression/v2/test-inventory.json',
    ]) {
      const result = compare(workspace({ changed: ['docs/api-contract.md', path] }));
      assert.equal(result.status, 1, result.output);
      assert.ok(result.report.includes(path), result.report);
      assert.match(result.output, /::error::.*baseline/);
    }
  });

  it('when it changes the CI job or the test JVM settings, then the report names those files', () => {
    const files = ['.github/workflows/pr-check.yml', 'backend/build.gradle.kts'];
    const result = compare(workspace({ changed: files }));
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /### Změny nahrávání a srovnání/);
    files.forEach((file) => assert.ok(result.report.includes(file), result.report));
  });

  it('when it changes the recorder, the masking or the comparison, then the report names those files', () => {
    const recorder =
      'backend/src/test/java/cz/novanadeje/app/cucumber/transcript/TranscriptNormaliser.java';
    const result = compare(workspace({ changed: [recorder, 'scripts/compare-v2.mjs'] }));
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /### Změny nahrávání a srovnání/);
    assert.ok(result.report.includes(recorder));
    assert.ok(result.report.includes('scripts/compare-v2.mjs'));
  });

  it('when a file it adds holds an unused declaration, then the comparison fails', () => {
    const result = compare(
      workspace({ changes: { '1.8.json': [status] }, changed: ['<changes>/1.8.json'] }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*1\.8\.json.*unused/);
  });

  it('when an older file holds an unused declaration, then the comparison only warns', () => {
    const result = compare(workspace({ changes: { '1.2.json': [status] }, changed: [] }));
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /Nepoužité deklarace/);
    assert.match(result.report, /1\.2\.json/);
  });

  it('when an added request is declared for another scenario, then the declaration is unused', () => {
    const added = {
      path: 'GET /api/admin/donors',
      scenario: 'donors/admin_donors: Someone else*',
      kind: 'added',
      reason: 'r',
      contract: 'docs/api-contract.md, Administration',
    };
    const result = compare(
      workspace({
        change: (recorded) =>
          (scenarioOf(recorded).requests['GET /api/admin/donors #1'] = callOf(recorded)),
        changes: { '1.8.json': [added] },
        changed: ['<changes>/1.8.json'],
      }),
    );
    assert.equal(result.status, 1, result.output);
  });
});

describe('Given a recording with an added mail', () => {
  it('when compared, then the report lists its subject and the kind of recipient without the address', () => {
    const result = compare(
      workspace({
        change: (recorded) =>
          scenarioOf(recorded).mails.push({ ...MAIL, subject: 'Přehled darů za 10/2026' }),
      }),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /Přehled darů za <n>\/<n>/);
    assert.match(result.report, /dárce/);
    assert.doesNotMatch(result.report.split('### Přidáno')[1], /jana@example\.cz/);
  });
});
