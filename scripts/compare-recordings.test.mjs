import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';

const SCRIPT = fileURLToPath(new URL('compare-recordings.mjs', import.meta.url));
const folders = [];

const transcript = (scenarios) => ({
  source: 'v2-baseline',
  feature: 'donors/admin_donors',
  scenarios,
});
const SCENARIOS = {
  'An administrator reads a donor #1': {
    requests: { 'GET /api/admin/donors/{id} #1': { response: { status: 200 } } },
  },
  'An administrator lists donors #1': {
    requests: { 'GET /api/admin/donors #1': { response: { status: 200 } } },
  },
};

function recordings(change = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'compare-recordings-'));
  folders.push(root);
  const write = (folder, value) => {
    const path = join(root, folder, 'donors/admin_donors.json');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  };
  write('first', transcript(structuredClone(SCENARIOS)));
  const second = transcript(structuredClone(SCENARIOS));
  change(second, root);
  write('second', second);
  return root;
}

function compare(root) {
  const run = spawnSync(process.execPath, [SCRIPT, join(root, 'first'), join(root, 'second')], {
    encoding: 'utf8',
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

afterEach(() => {
  while (folders.length > 0) {
    rmSync(folders.pop(), { recursive: true, force: true });
  }
});

describe('Given two recordings of the same commit', () => {
  it('when they are the same, then the check passes and counts the scenarios', () => {
    const result = compare(recordings());
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /2 scenarios/);
  });

  it('when one scenario recorded otherwise the second time, then the check fails and names that scenario only', () => {
    const result = compare(
      recordings((second) => {
        second.scenarios['An administrator lists donors #1'].requests[
          'GET /api/admin/donors #1'
        ].response.status = 500;
      }),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(
      result.output,
      /::error::.*donors\/admin_donors: An administrator lists donors #1/,
    );
    assert.doesNotMatch(result.output, /reads a donor/);
  });

  it('when a scenario or a feature is missing from the second recording, then the check fails and names it', () => {
    const lost = compare(
      recordings((second) => delete second.scenarios['An administrator reads a donor #1']),
    );
    assert.equal(lost.status, 1, lost.output);
    assert.match(lost.output, /::error::.*An administrator reads a donor #1/);
    const root = recordings();
    writeFileSync(
      join(root, 'first', 'donors', 'donor_login.json'),
      JSON.stringify({
        source: 'v2-baseline',
        feature: 'donors/donor_login',
        scenarios: { 'Sign-in #1': {} },
      }),
    );
    const gone = compare(root);
    assert.equal(gone.status, 1, gone.output);
    assert.match(gone.output, /::error::.*donors\/donor_login\.json|::error::.*Sign-in #1/);
  });
});
