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
              body: {
                donorId: '<id:2>',
                name: 'Jana Nováková',
                variableSymbol: '<vs:Jana>',
                addresses: [{ city: 'Nový Bor' }],
              },
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
const BASELINE_COMMIT = 'c4a256c2912b03c8fc9609ec1fc2e342774c31e5';

function changedList(root, lines) {
  return lines.map((line) => line.replace('<changes>', join(root, 'changes'))).join('\n');
}

function workspace({
  change = () => {},
  changeBaseline = () => {},
  changes = {},
  freshInventory,
  changed,
  main,
  mainChanged,
  mainInventory,
  fixtures = {},
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
    writeFileSync(join(root, 'changed.txt'), changedList(root, changed));
  }
  if (main) {
    const recordedOnMain = transcriptFile();
    main(recordedOnMain);
    write(`main/${FEATURE}.json`, recordedOnMain);
  }
  if (mainChanged) {
    writeFileSync(join(root, 'main-changed.txt'), changedList(root, mainChanged));
  }
  if (mainInventory) {
    write('main-inventory.json', inventory(mainInventory));
  }
  mkdirSync(join(root, 'fixtures', 'cucumber'), { recursive: true });
  for (const [name, text] of Object.entries(fixtures)) {
    writeFileSync(join(root, 'fixtures', 'cucumber', name), text);
  }
  writeFileSync(join(root, 'BASELINE_COMMIT'), `${BASELINE_COMMIT}\n`);
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
      `--baseline-commit=${join(root, 'BASELINE_COMMIT')}`,
      `--fixture-sources=${join(root, 'fixtures')}`,
      ...(existsSync(join(root, 'changed.txt')) ? [`--changed=${join(root, 'changed.txt')}`] : []),
      ...(existsSync(join(root, 'main')) ? [`--main=${join(root, 'main')}`] : []),
      ...(existsSync(join(root, 'main-inventory.json'))
        ? [`--main-inventory=${join(root, 'main-inventory.json')}`]
        : []),
      ...(existsSync(join(root, 'main-changed.txt'))
        ? [`--main-changed=${join(root, 'main-changed.txt')}`]
        : []),
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
              security: { approvedIn: 'PR #210, Jakub 2026-11-12', fields: {} },
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
    security: { approvedIn: 'PR #210, Jakub 2026-11-12', fields: {} },
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
  const approved = { approvedIn: 'PR #1, Jakub 2026-11-12', fields: {} };
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
      refused({ ...body, path, scenario: anywhere }, /entry 1.*path.*METHOD \/api\/<context>\//);
    }
  });

  it('when a path names one letter, a bare /api or an unknown first segment, then the comparison refuses it', () => {
    for (const path of [
      'GET /a*',
      'GET /api*',
      'GET /api/*',
      'GET /api/donors*',
      'GET /api/donor/x',
      'GET /actuator*',
      'GET /.well-known*',
      'GET /sprava/x',
    ]) {
      refused({ ...body, path, scenario: anywhere }, /entry 1.*path.*METHOD \/api\/<context>\//);
    }
  });

  it('when a path starts with a context, the actuator, a well-known document or OAuth, then the comparison accepts it', () => {
    for (const path of [
      'GET /api/admin/donors/{id}',
      'POST /api/donors/auth/login',
      'GET /actuator/health',
      'GET /.well-known/oauth-authorization-server',
      'POST /oauth/token',
    ]) {
      const result = compare(
        workspace({ changes: { '0.9.json': [{ ...body, path, scenario: anywhere }] } }),
      );
      assert.equal(result.status, 0, result.output);
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
      { kind: 'body', reason: 'r', path: 'GET /api/admin/donors/{id}', scenario: anywhere },
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
    refused({ ...logs, security: { approvedIn: 'PR #1, Jakub 2026-11-12' } }, /fields/);
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

  it('when it changes the CI job, the test JVM settings or the baseline anchor, then the report names those files', () => {
    const files = [
      '.github/workflows/pr-check.yml',
      'backend/build.gradle.kts',
      'regression/v2/BASELINE_COMMIT',
    ];
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

describe('Given a pull request that changes the shared cases', () => {
  const caseFile = 'shared-cases/admin-overview/year-overview.json';
  const declaration = {
    kind: 'shared-case',
    caseFile,
    reason: '2.20b counts a refunded gift once',
    contract: 'docs/api-contract.md, Monthly report settings and overview',
  };

  it('when no declaration names a changed case file, then the comparison fails and names the file', () => {
    const result = compare(workspace({ changed: ['docs/api-contract.md', caseFile] }));
    assert.equal(result.status, 1, result.output);
    assert.ok(result.report.includes(caseFile), result.report);
    assert.match(result.output, /::error::.*shared-cases\/admin-overview\/year-overview\.json/);
  });

  it('when a declaration names the changed case file, then the comparison passes and the report lists it', () => {
    const result = compare(
      workspace({
        changes: { '2.20b.json': [declaration] },
        changed: ['<changes>/2.20b.json', caseFile],
      }),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /### Změněné sdílené případy/);
    assert.ok(result.report.includes('2.20b counts a refunded gift once'), result.report);
  });

  it('when a declaration names a pattern over the schemas, then it covers every schema the pull request changes', () => {
    const result = compare(
      workspace({
        changes: {
          '2.20b.json': [
            { ...declaration, caseFile: 'shared-cases/schemas/*', reason: 'stricter' },
          ],
        },
        changed: [
          '<changes>/2.20b.json',
          'shared-cases/schemas/qr/totp.schema.json',
          'shared-cases/schemas/defs/rows.schema.json',
        ],
      }),
    );
    assert.equal(result.status, 0, result.output);
  });

  it('when only an unchanged earlier changes file names the changed case file, then the comparison fails', () => {
    const result = compare(
      workspace({ changes: { '0.2.json': [declaration] }, changed: [caseFile] }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*shared-cases\/admin-overview\/year-overview\.json/);
  });

  it('when a declaration names another case file, then the changed file is undeclared and the declaration unused', () => {
    const result = compare(
      workspace({
        changes: { '2.20b.json': [{ ...declaration, caseFile: 'shared-cases/qr/totp.json' }] },
        changed: ['<changes>/2.20b.json', caseFile],
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*year-overview\.json/);
    assert.match(result.output, /::error::.*2\.20b\.json.*unused/);
  });

  it('when a declaration names a file outside shared-cases or has no contract, then the comparison refuses to run', () => {
    for (const entry of [
      { ...declaration, caseFile: 'docs/api-contract.md' },
      { ...declaration, contract: undefined },
    ]) {
      const result = compare(workspace({ changes: { '2.20b.json': [entry] } }));
      assert.equal(result.status, 2, result.output);
      assert.match(result.output, /2\.20b\.json entry 1/);
    }
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

const bodyEntry = (extra = {}) => ({
  path: 'GET /api/admin/donors/{id}',
  scenario: `${FEATURE}: *`,
  kind: 'body',
  reason: '1.7 moves the name into the profile',
  contract: 'docs/api-contract.md, Administration',
  ...extra,
});
const withoutName = (file) => delete callOf(file).response.body.name;
const otherCity = (file) => (callOf(file).response.body.addresses[0].city = 'Liberec');

describe('Given the recording of the latest main push', () => {
  it('when this branch records what main recorded, then the report says the comparison with main found nothing', () => {
    const result = compare(
      workspace({
        change: withoutName,
        main: withoutName,
        changes: { 'pr-300.json': [bodyEntry()] },
        changed: ['M\tdocs/api-contract.md'],
        mainChanged: [],
      }),
      [`--main-commit=${'a'.repeat(40)}`],
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /### Srovnání s main/);
    assert.match(result.report, /aaaaaaaaaaaa/);
    assert.match(result.report, /Proti main žádný nedeklarovaný rozdíl/);
  });

  it('when this branch differs from main where only an older changes file declares it, then the comparison fails and says so against main', () => {
    const result = compare(
      workspace({
        change: withoutName,
        changes: { 'pr-300.json': [bodyEntry()] },
        changed: ['M\tdocs/api-contract.md'],
        main: () => {},
        mainChanged: [],
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*against main.*body.*\$\.name/);
    assert.match(result.report, /proti main/);
  });

  it("when a changes file this branch adds explains the difference from main, then it passes and the report lists the entry as this branch's own", () => {
    const result = compare(
      workspace({
        change: withoutName,
        changes: { 'pr-310.json': [bodyEntry({ reason: '#310 drops the name' })] },
        changed: ['A\t<changes>/pr-310.json'],
        main: () => {},
      }),
    );
    assert.equal(result.status, 0, result.output);
    const own = result.report.split('### Deklarace tohoto PR')[1] ?? '';
    assert.match(own.split('###')[0], /pr-310\.json.*#310 drops the name/s);
    assert.ok(
      result.report.indexOf('### Deklarace tohoto PR') <
        result.report.indexOf('### Deklarované rozdíly starších PR'),
      result.report,
    );
  });

  it('when main was recorded a few commits earlier, then a changes file added since that commit explains the difference', () => {
    const result = compare(
      workspace({
        change: withoutName,
        changes: { 'pr-305.json': [bodyEntry()] },
        changed: ['M\tdocs/api-contract.md'],
        main: () => {},
        mainChanged: ['A\t<changes>/pr-305.json', 'M\tdocs/api-contract.md'],
      }),
    );
    assert.equal(result.status, 0, result.output);
  });

  it("when this branch goes back to what v2 did, then the difference from main needs this branch's declaration, which then counts as used", () => {
    const restoring = {
      change: () => {},
      main: otherCity,
      changes: {
        'pr-300.json': [bodyEntry()],
      },
      changed: ['M\tdocs/api-contract.md'],
    };
    const undeclared = compare(workspace(restoring));
    assert.equal(undeclared.status, 1, undeclared.output);
    assert.match(undeclared.output, /::error::.*against main.*body/);
    const declared = compare(
      workspace({
        ...restoring,
        changes: {
          ...restoring.changes,
          'pr-320.json': [bodyEntry({ reason: '#320 shows the name again' })],
        },
        changed: ['A\t<changes>/pr-320.json'],
      }),
    );
    assert.equal(declared.status, 0, declared.output);
  });
});

describe('Given no recording of main', () => {
  it('when the job says why, then the report names the reason and only the v2 comparison counts', () => {
    const result = compare(workspace(), [
      '--main-missing=no successful push run on main keeps a backend-recording artifact',
    ]);
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /Srovnání s main neprovedeno/);
    assert.match(result.report, /no successful push run on main/);
    assert.match(result.output, /::warning::.*main/);
  });

  it('when nothing names a main recording, then the report still says the comparison with main did not run', () => {
    const result = compare(workspace());
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /Srovnání s main neprovedeno/);
  });
});

describe('Given a body or headers entry that names a field', () => {
  it('when the field matches the changed JSON path, then it covers that path and no other', () => {
    const named = compare(
      workspace({
        change: (file) => {
          withoutName(file);
          otherCity(file);
        },
        changes: { 'pr-330.json': [bodyEntry({ field: '$.name' })] },
        changed: ['A\t<changes>/pr-330.json'],
      }),
    );
    assert.equal(named.status, 1, named.output);
    assert.match(named.output, /::error::.*\$\.addresses\[0\]\.city/);
    assert.doesNotMatch(named.output, /::error::.*\$\.name/);
  });

  it('when the field is a glob over list items, then it covers every item', () => {
    const result = compare(
      workspace({
        change: otherCity,
        changes: { 'pr-330.json': [bodyEntry({ field: '$.addresses[*].city' })] },
        changed: ['A\t<changes>/pr-330.json'],
      }),
    );
    assert.equal(result.status, 0, result.output);
  });

  it('when a headers entry names one header, then another changed header still fails', () => {
    const result = compare(
      workspace({
        change: (file) => {
          callOf(file).response.headers['cache-control'] = 'public, max-age=60';
          callOf(file).response.headers['content-type'] = 'text/plain';
        },
        changes: {
          'pr-330.json': [bodyEntry({ kind: 'headers', field: 'cache-control' })],
        },
        changed: ['A\t<changes>/pr-330.json'],
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*headers.*content-type/);
    assert.doesNotMatch(result.output, /::error::.*cache-control/);
  });

  it('when the field is on another kind or a body field does not start with $, then the comparison refuses it', () => {
    for (const entry of [
      bodyEntry({ kind: 'status', field: '$.name' }),
      bodyEntry({ field: 'name' }),
      bodyEntry({ kind: 'headers', field: '$.name' }),
    ]) {
      const result = compare(workspace({ changes: { 'pr-330.json': [entry] } }));
      assert.equal(result.status, 2, result.output);
      assert.match(result.output, /pr-330\.json entry 1.*field/);
    }
  });
});

describe('Given a mails entry', () => {
  const mailsEntry = (extra = {}) => ({
    scenario: `${FEATURE}: *`,
    kind: 'mails',
    reason: '#340 rewrites the confirmation',
    contract: 'docs/api-contract.md, Registration',
    ...extra,
  });
  const changedText = (file) => {
    scenarioOf(file).mails = [
      { ...MAIL, text: 'Dobrý den,\nklikněte na tlačítko.\n' },
      { ...MAIL, subject: 'Heslo bylo změněno', text: 'Nové.\n' },
    ];
  };
  const withPasswordNotice = (file) =>
    scenarioOf(file).mails.push({ ...MAIL, subject: 'Heslo bylo změněno', text: 'Staré.\n' });

  it('when it names a subject, then it covers that mail and a change to another mail still fails', () => {
    const result = compare(
      workspace({
        changeBaseline: withPasswordNotice,
        change: changedText,
        changes: { 'pr-340.json': [mailsEntry({ subject: 'Potvrďte svůj e-mail' })] },
        changed: ['A\t<changes>/pr-340.json'],
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*mails.*Heslo bylo změněno/);
    assert.doesNotMatch(result.output, /::error::.*mails.*Potvrďte svůj e-mail/);
  });

  it('when a file this branch adds has a mails entry without a subject, then the comparison refuses it', () => {
    const result = compare(
      workspace({
        change: changedText,
        changes: { 'pr-340.json': [mailsEntry()] },
        changed: ['A\t<changes>/pr-340.json'],
      }),
    );
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /pr-340\.json entry 1.*subject/);
  });

  it('when an older file has a mails entry without a subject, then it still covers every mail of its scenario', () => {
    const result = compare(
      workspace({
        changeBaseline: withPasswordNotice,
        change: changedText,
        changes: { 'pr-205.json': [mailsEntry()] },
        changed: ['M\tdocs/api-contract.md'],
      }),
    );
    assert.equal(result.status, 0, result.output);
  });
});

describe('Given the changed files with their git status', () => {
  it('when the branch changes or deletes an older declaration file, then the report lists it with its status', () => {
    const result = compare(
      workspace({
        changes: { 'pr-205.json': [bodyEntry()], 'pr-206.json': [bodyEntry()] },
        changed: ['M\t<changes>/pr-205.json', 'D\t<changes>/pr-199.json'],
      }),
    );
    const listed = result.report.split('### Starší soubory deklarací, které tento PR mění')[1];
    assert.ok(listed, result.report);
    assert.match(listed.split('###')[0], /`M` .*pr-205\.json/);
    assert.match(listed.split('###')[0], /`D` .*pr-199\.json/);
  });

  it('when the branch only adds its own declaration file, then the report lists no older one', () => {
    const result = compare(
      workspace({
        change: withoutName,
        changes: { 'pr-350.json': [bodyEntry()] },
        changed: ['A\t<changes>/pr-350.json'],
      }),
    );
    assert.equal(result.status, 0, result.output);
    const listed = result.report.split('### Starší soubory deklarací, které tento PR mění')[1];
    assert.match(listed.split('###')[0], /- žádné/);
  });

  it('when the branch adds a declaration file, then the report names it among the changes to recording and comparison', () => {
    const result = compare(workspace({ changed: ['A\tregression/v2/changes/pr-350.json'] }));
    const watched = result.report.split('### Změny nahrávání a srovnání')[1];
    assert.ok(watched, result.report);
    assert.match(watched.split('###')[0], /regression\/v2\/changes\/pr-350\.json/);
  });
});

describe('Given a branch that touches the receipt corpus or the screens manifest', () => {
  const addition = (extra = {}) => ({
    kind: 'baseline-addition',
    file: 'regression/v2/screens/manifest.json',
    recordedFrom: BASELINE_COMMIT,
    patch: 'regression/v2/additions/0.6c-screens.patch',
    record: 'env -u FIO_TOKEN scripts/record-baseline-data.sh',
    reason: '0.6c records the TOTP enrolment from the baseline commit',
    ...extra,
  });

  it('when it changes or deletes an existing receipt file, then the comparison fails and names the file', () => {
    for (const line of [
      'M\tregression/v2/receipts/single-person-cs.json',
      'D\tregression/v2/receipts/yearly-person-en.json',
      'D\tregression/v2/screens/manifest.json',
    ]) {
      const result = compare(workspace({ changed: [line] }));
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /::error::.*baseline.*regression\/v2\/(receipts|screens)\//);
    }
  });

  it('when it adds a receipt sample or new screen states without saying they were recorded from the baseline commit, then the comparison fails', () => {
    for (const line of [
      'A\tregression/v2/receipts/yearly-500-gifts-cs.json',
      'M\tregression/v2/screens/manifest.json',
    ]) {
      const result = compare(workspace({ changed: [line] }));
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /::error::.*BASELINE_COMMIT/);
    }
  });

  it('when a file this branch adds lists the addition as recorded from the baseline commit, then it passes and the report names it', () => {
    const result = compare(
      workspace({
        changes: { '0.6c.json': [addition()] },
        changed: ['A\t<changes>/0.6c.json', 'M\tregression/v2/screens/manifest.json'],
      }),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /regression\/v2\/screens\/manifest\.json/);
    assert.match(result.report, /0\.6c records the TOTP enrolment/);
  });

  it('when the addition names another commit or another folder, then the comparison refuses it', () => {
    for (const entry of [
      addition({ recordedFrom: 'f'.repeat(40) }),
      addition({ file: 'regression/v2/api/donors/admin_donors.json' }),
    ]) {
      const result = compare(workspace({ changes: { '0.6c.json': [entry] } }));
      assert.equal(result.status, 2, result.output);
      assert.match(result.output, /0\.6c\.json entry 1/);
    }
  });

  it('when an addition names an existing receipt file that the branch changes, then it still fails', () => {
    const result = compare(
      workspace({
        changes: {
          '0.6c.json': [addition({ file: 'regression/v2/receipts/single-person-cs.json' })],
        },
        changed: ['A\t<changes>/0.6c.json', 'M\tregression/v2/receipts/single-person-cs.json'],
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*single-person-cs\.json/);
  });
});

describe('Given recorded log lines that carry data security.md forbids in logs', () => {
  const approval = { approvedIn: 'PR #360, Jakub 2026-11-12', fields: {} };
  const logging = (line) => (file) => scenarioOf(file).logs.push(line);
  const forbidden = [
    [
      'an e-mail address',
      'INFO donors.application.DonorEmailVerificationService: Sent to jana@example.cz',
    ],
    [
      'a fixture name',
      'INFO donors.application.DonorEmailVerificationService: E-mail of Jana verified',
    ],
    [
      'a variable symbol',
      'INFO donors.application.DonorEmailVerificationService: Symbol <vs:Jana> verified',
    ],
    ['a token', 'INFO donors.application.DonorEmailVerificationService: Link <token> issued'],
    ['a secret', 'INFO donors.application.DonorEmailVerificationService: Secret <secret> stored'],
    ['a JWT', 'INFO donors.application.DonorEmailVerificationService: Session <jwt> opened'],
    [
      'the signatory',
      'INFO donors.application.DonorEmailVerificationService: Signed by <signatory-name>',
    ],
    ['the setup code', 'INFO operations.application.SetupService: Code <setup-code> accepted'],
    [
      'a recovery code',
      'INFO donors.application.DonorSecondFactorService: OBNOVA-<recovery-code> used',
    ],
    ['an account number', 'INFO donations.application.ImportService: Account 1234567890/0800 seen'],
    [
      'an account number before its prefix',
      'INFO donations.application.ImportService: Account 19/123456 seen',
    ],
  ];

  for (const [what, line] of forbidden) {
    it(`when a line holds ${what}, then the comparison fails even with a security approval`, () => {
      const shape = line
        .replace(/^INFO /, '')
        .replace(/<([a-z-]+):[^>]*>/g, '<$1>')
        .replace(/\d+/g, (digits) => (digits.length <= 4 ? '<n>' : `<digits:${digits.length}>`));
      const result = compare(
        workspace({
          change: logging(line),
          changes: {
            'pr-360.json': [{ kind: 'log-field', line: shape, reason: 'r', security: approval }],
          },
          changed: ['A\t<changes>/pr-360.json'],
        }),
      );
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /::error::.*log line.*must not/);
      assert.match(result.report, /`log-data`/);
    });
  }

  it('when a line holds a short number next to a slash, then the data check lets it through', () => {
    const result = compare(
      workspace({
        changeBaseline: logging('INFO donations.application.ImportService: Batch 12/2026 done'),
        change: logging('INFO donations.application.ImportService: Batch 12345/2026 done'),
      }),
    );
    assert.doesNotMatch(result.output, /log-data|must not/);
  });

  it('when the recording of the v2 baseline is checked, then no line carries such data', () => {
    const root = workspace();
    const result = compare(root, [
      `--recording=${fileURLToPath(new URL('../regression/v2/api', import.meta.url))}`,
    ]);
    assert.doesNotMatch(result.output, /log-data|must not/);
  });
});

describe('Given a security approval', () => {
  const lostLog = (file) => (scenarioOf(file).logs = []);
  const logsEntry = (approvedIn) => ({
    line: 'donors.application.DonorEmailVerificationService: *',
    scenario: `${FEATURE}: *`,
    kind: 'logs',
    reason: 'r',
    contract: 'docs/system-overview.md, Donors',
    security: { approvedIn, fields: {} },
  });

  it("when it does not name a PR and Jakub's date, then the comparison refuses it", () => {
    for (const approvedIn of [
      'PR #210',
      'Jakub 2026-11-12',
      'review 2026-11-12',
      'PR #210, Jakub 12. 11. 2026',
    ]) {
      const result = compare(
        workspace({ change: lostLog, changes: { 'pr-370.json': [logsEntry(approvedIn)] } }),
      );
      assert.equal(result.status, 2, result.output);
      assert.match(
        result.output,
        /pr-370\.json entry 1.*approvedIn.*PR #<number>, Jakub <YYYY-MM-DD>/,
      );
    }
  });

  it("when it names the PR and Jakub's date, then the comparison accepts it", () => {
    const result = compare(
      workspace({
        change: lostLog,
        changes: { 'pr-370.json': [logsEntry('PR #370, Jakub 2026-11-12')] },
      }),
    );
    assert.equal(result.status, 0, result.output);
  });
});

describe('Given a retirement in a file this branch adds', () => {
  const withoutBackendTest = {
    ...INVENTORY,
    'backend-junit': ['donors.DonorProfileTest > Given a donor, when read, then shown'],
  };
  const retirement = (replacement) => ({
    kind: 'retired',
    suite: 'backend-junit',
    test: 'donors.DonorTest > Given a donor, when read, then shown',
    replacement,
    reason: '1.2 splits the donor test',
  });
  const run = (replacement, changed = ['A\t<changes>/1.2.json']) => {
    const root = workspace({
      freshInventory: withoutBackendTest,
      changes: { '1.2.json': [retirement(replacement)] },
      changed,
    });
    return compare(root, [`--inventory=${join(root, 'inventory.json')}`]);
  };

  it('when the replacement is prose instead of a test, then the comparison fails and asks for a test id', () => {
    const result = run('acceptanceTest in backend/build.gradle.kts deletes the folder');
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*replacement.*test id/);
  });

  it('when the replacement names a test that the inventory does not hold, then the comparison fails', () => {
    const result = run('donors.DonorCardTest > Given a donor, when read, then shown');
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*DonorCardTest.*not in the test inventory/);
  });

  it('when the replacement names a test of the inventory, then it passes', () => {
    const result = run('donors.DonorProfileTest > Given a donor, when read, then shown');
    assert.equal(result.status, 0, result.output);
  });

  it('when an older file names prose as the replacement, then it passes and the report marks it', () => {
    const result = run('acceptanceTest in backend/build.gradle.kts deletes the folder', []);
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /náhrada není test/);
  });
});

describe('Given the test inventory of main with a test added after v2', () => {
  const POST_V2 = 'donations.ReceiptTest > Given a receipt, when issued, then it is numbered';
  const REPLACEMENT =
    'donations.ReceiptNumberTest > Given a receipt, when issued, then it is numbered';
  const onMain = { ...INVENTORY, 'backend-junit': [...INVENTORY['backend-junit'], POST_V2] };
  const retirement = (replacement) => ({
    kind: 'retired',
    suite: 'backend-junit',
    test: POST_V2,
    replacement,
    reason: '#380 splits the receipt test',
  });
  const run = ({ fresh = INVENTORY, changes = {}, changed = ['M\tdocs/api-contract.md'] } = {}) => {
    const root = workspace({
      freshInventory: fresh,
      mainInventory: onMain,
      main: () => {},
      changes,
      changed,
    });
    return compare(root, [`--inventory=${join(root, 'inventory.json')}`]);
  };

  it('when this branch deletes that test, then the comparison fails against main and names it', () => {
    const result = run();
    assert.equal(result.status, 1, result.output);
    assert.match(
      result.output,
      /::error::against main: undeclared retired difference.*ReceiptTest/,
    );
  });

  it('when a file this branch adds retires it with a test id that runs now, then it passes', () => {
    const result = run({
      fresh: { ...INVENTORY, 'backend-junit': [...INVENTORY['backend-junit'], REPLACEMENT] },
      changes: { 'pr-380.json': [retirement(REPLACEMENT)] },
      changed: ['A\t<changes>/pr-380.json'],
    });
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, /### Srovnání s main[\s\S]*Testy \(inventář\)/);
  });

  it('when the retirement names a replacement the inventory does not hold, then it still fails', () => {
    const result = run({
      changes: { 'pr-380.json': [retirement(REPLACEMENT)] },
      changed: ['A\t<changes>/pr-380.json'],
    });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*ReceiptNumberTest.*not in the test inventory/);
  });

  it('when only an older changes file retires it, then the comparison fails against main', () => {
    const result = run({
      fresh: { ...INVENTORY, 'backend-junit': [...INVENTORY['backend-junit'], REPLACEMENT] },
      changes: { 'pr-300.json': [retirement(REPLACEMENT)] },
    });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::against main: undeclared retired difference/);
  });
});

describe('Given additions against the recording of main', () => {
  const addedEntry = (extra) => ({
    scenario: `${FEATURE}: *`,
    kind: 'added',
    reason: '#390 adds it',
    contract: 'docs/api-contract.md, Administration',
    ...extra,
  });
  const newMail = (file) =>
    scenarioOf(file).mails.push({ ...MAIL, subject: 'Nový přehled darů', text: 'Přehled.\n' });
  const newField = (file) => (callOf(file).response.body.registeredAt = '2026-11-04T09:00:00Z');
  const newHeader = (file) => (callOf(file).response.headers['nfnn-revision'] = 'dev');

  it('when a mail of an existing scenario is new, then it fails until an added entry of this branch names its subject', () => {
    const undeclared = compare(workspace({ change: newMail, main: () => {}, changed: [] }));
    assert.equal(undeclared.status, 1, undeclared.output);
    assert.match(
      undeclared.output,
      /::error::against main: undeclared added difference.*Nový přehled darů/,
    );
    const declared = compare(
      workspace({
        change: newMail,
        main: () => {},
        changes: { 'pr-390.json': [addedEntry({ subject: 'Nový přehled*' })] },
        changed: ['A\t<changes>/pr-390.json'],
      }),
    );
    assert.equal(declared.status, 0, declared.output);
  });

  it('when a response field or header is new, then it fails until an added entry of this branch names its field', () => {
    for (const [change, field] of [
      [newField, '$.registeredAt'],
      [newHeader, 'nfnn-revision'],
    ]) {
      const undeclared = compare(workspace({ change, main: () => {}, changed: [] }));
      assert.equal(undeclared.status, 1, undeclared.output);
      assert.ok(undeclared.output.includes(field), undeclared.output);
      const declared = compare(
        workspace({
          change,
          main: () => {},
          changes: {
            'pr-390.json': [addedEntry({ path: 'GET /api/admin/donors/{id}', field })],
          },
          changed: ['A\t<changes>/pr-390.json'],
        }),
      );
      assert.equal(declared.status, 0, declared.output);
    }
  });

  it('when a request or a whole scenario is new, then it passes without a declaration', () => {
    const result = compare(
      workspace({
        change: (file) => {
          scenarioOf(file).requests['GET /api/admin/donors #1'] = callOf(file);
          file.scenarios['An administrator lists donors #1'] = scenarioOf(transcriptFile());
        },
        main: () => {},
        changed: [],
      }),
    );
    assert.equal(result.status, 0, result.output);
  });

  it('when an added entry names a subject and a path, or a field without a path, then the comparison refuses it', () => {
    for (const entry of [
      addedEntry({ subject: 'Nový*', path: 'GET /api/admin/donors/{id}' }),
      addedEntry({ field: '$.registeredAt' }),
    ]) {
      const result = compare(workspace({ changes: { 'pr-390.json': [entry] } }));
      assert.equal(result.status, 2, result.output);
      assert.match(result.output, /pr-390\.json entry 1/);
    }
  });
});

describe('Given baseline additions with their patch', () => {
  const addition = (extra = {}) => ({
    kind: 'baseline-addition',
    file: 'regression/v2/screens/manifest.json',
    recordedFrom: BASELINE_COMMIT,
    patch: 'regression/v2/additions/0.6c-screens.patch',
    record: 'env -u FIO_TOKEN scripts/record-baseline-data.sh',
    reason: '0.6c records the TOTP enrolment from the baseline commit',
    ...extra,
  });

  it('when an addition names no patch or a patch outside regression/v2/additions/, then the comparison refuses it', () => {
    const { patch, ...withoutPatch } = addition();
    assert.ok(patch);
    for (const entry of [
      withoutPatch,
      addition({ patch: 'scripts/screens.patch' }),
      addition({ record: undefined }),
    ]) {
      const result = compare(workspace({ changes: { '0.6c.json': [entry] } }));
      assert.equal(result.status, 2, result.output);
      assert.match(result.output, /0\.6c\.json entry 1.*(patch|record)/);
    }
  });

  it('when the addition is declared, then the report prints the commands that reproduce it', () => {
    const result = compare(
      workspace({
        changes: { '0.6c.json': [addition()] },
        changed: [
          'A\t<changes>/0.6c.json',
          'A\tregression/v2/additions/0.6c-screens.patch',
          'M\tregression/v2/screens/manifest.json',
        ],
      }),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.report, new RegExp(`git worktree add --detach \\S+ ${BASELINE_COMMIT}`));
    assert.match(
      result.report,
      /git -C \S+ apply .*regression\/v2\/additions\/0\.6c-screens\.patch/,
    );
    assert.match(result.report, /record-baseline-data\.sh/);
  });

  it('when a new file lands in screens or anything but a JSON sample lands in receipts, then it fails even when declared', () => {
    for (const path of [
      'regression/v2/screens/totp-390.png',
      'regression/v2/receipts/yearly-500-gifts-cs.pdf',
      'regression/v2/receipts/more/yearly-500-gifts-cs.json',
    ]) {
      const result = compare(
        workspace({
          changes: { '0.6c.json': [addition({ file: `${dirname(path)}/*` })] },
          changed: [
            'A\t<changes>/0.6c.json',
            'A\tregression/v2/additions/0.6c-screens.patch',
            `A\t${path}`,
          ],
        }),
      );
      assert.equal(result.status, 1, result.output);
      assert.ok(result.output.includes(`::error::`) && result.output.includes(path), result.output);
    }
  });

  it('when a patch is added that no addition of this branch names, or an existing patch changes, then it fails', () => {
    for (const line of [
      'A\tregression/v2/additions/other.patch',
      'M\tregression/v2/additions/0.6c-screens.patch',
      'D\tregression/v2/additions/0.6c-screens.patch',
    ]) {
      const result = compare(workspace({ changed: [line] }));
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /::error::.*regression\/v2\/additions\//);
    }
  });
});

describe('Given recorded log lines with an IBAN or the data of the fixtures', () => {
  const logging = (line) => (file) => scenarioOf(file).logs.push(line);
  const failsOn = (line, extra = {}) => {
    const result = compare(workspace({ change: logging(line), ...extra }));
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*log line.*must not/);
    return result;
  };

  it('when a line holds an IBAN, packed or in groups of four, then the comparison fails', () => {
    failsOn('INFO donations.application.ImportService: Account CZ6508000000192000145399 seen');
    failsOn('INFO donations.application.ImportService: Account CZ65 0800 0000 1920 0014 5399 seen');
  });

  it('when a line holds a full fixture name from the test sources, then the comparison fails and names it', () => {
    const result = failsOn('INFO donations.application.ImportService: Payer Karel Vzorový paid', {
      fixtures: {
        'DonorSteps.java':
          'class DonorSteps { Map<String, String> NAMES = Map.of("Karel", "Karel Vzorový"); }',
      },
    });
    assert.match(result.output, /Karel Vzorový/);
  });

  it('when a line holds a word of a recorded name, street, city or counterparty, then the comparison fails', () => {
    failsOn('INFO donations.application.ImportService: Payer Nováková paid');
    failsOn('INFO donations.application.ImportService: Sent to Dlouhá', {
      changeBaseline: (file) => (callOf(file).response.body.addresses[0].street = 'Dlouhá 12'),
    });
    failsOn('INFO donations.application.ImportService: Payment from Stavební', {
      changeBaseline: (file) => (callOf(file).response.body.counterpartyName = 'Stavební družstvo'),
    });
  });

  it('when a line holds a word of a name beside an e-mail or a company identifier, then the comparison fails', () => {
    failsOn('INFO donations.application.ImportService: Payer Dvořáková paid', {
      changeBaseline: (file) =>
        (callOf(file).response.body.payers = [{ name: 'Hana Dvořáková', email: 'h@example.cz' }]),
    });
    failsOn('INFO donations.application.ImportService: Payer Stavby paid', {
      changeBaseline: (file) =>
        (callOf(file).response.body.companies = [
          { name: 'Acme Stavby', companyIdentifier: '12345678' },
        ]),
    });
  });

  it("when a line holds a donor's street word, then the comparison fails and names the remedy", () => {
    const result = failsOn('INFO donations.application.ImportService: Sent to Krátká', {
      changeBaseline: (file) =>
        (callOf(file).response.body.addresses = [
          { street: 'Krátká 5', city: 'Nový Bor', postalCode: '47301' },
        ]),
    });
    assert.match(result.output, /Krátká/);
    assert.match(
      result.output,
      /rename the fixture value or add the word to COMMON_WORDS with a reason in testing\.md/,
    );
  });

  it('when a line names a passkey, a device, a connected app, an erasure placeholder or the fixture city Most, then the data check lets it through', () => {
    const lines = [
      'INFO donors.application.PasskeyService: Passkey Android registered',
      'INFO donors.application.PasskeyService: Passkey Klíč from Windows removed',
      'INFO donors.application.ConnectedAppService: Claude Code connected',
      'INFO donors.application.ErasureService: Vymazaný record kept, Vymazáno address kept',
      'INFO donations.application.ImportService: Most payments imported',
    ];
    const result = compare(
      workspace({
        changeBaseline: (file) => {
          const body = callOf(file).response.body;
          body.passkeys = [
            { id: '<id:3>', name: 'Android Phone', createdAt: '2026-01-01T00:00:00Z' },
            { challenge: '<token>', credential: {}, name: 'Klíč Windows' },
          ];
          body.application = { name: 'Claude Code', host: 'localhost', loopback: true };
          body.erased = {
            name: 'Vymazaný dárce',
            companyIdentifier: null,
            erasedAt: '2026-01-01T00:00:00Z',
            address: { street: 'Vymazáno', city: 'Vymazáno', postalCode: '00000' },
          };
          body.addresses = [{ street: 'Krátká 5', city: 'Most', postalCode: '43401' }];
          scenarioOf(file).logs.push(...lines);
        },
        change: (file) => scenarioOf(file).logs.push(...lines),
      }),
    );
    assert.doesNotMatch(result.output, /must not/);
  });

  it("when a line holds only a common word of the foundation's name or a lower-case word, then the data check lets it through", () => {
    const result = compare(
      workspace({
        changeBaseline: (file) => {
          callOf(file).response.body.addresses[0].street = 'Nová backend';
          scenarioOf(file).logs.push(
            'INFO donations.application.ImportService: Nová naděje sent backend',
          );
        },
        change: logging('INFO donations.application.ImportService: Nová naděje sent backend'),
      }),
    );
    assert.doesNotMatch(result.output, /must not/);
  });
});
