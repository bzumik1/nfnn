import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';

const SCRIPT = fileURLToPath(new URL('compare-v2-baseline.mjs', import.meta.url));
const ANCHOR = 'regression/v2/BASELINE_COMMIT';
const TRANSCRIPT = 'regression/v2/api/donors/admin_donors.json';
const INVENTORY = 'regression/v2/test-inventory.json';

const folders = [];

function git(cwd, ...args) {
  const run = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'nfnn',
      GIT_AUTHOR_EMAIL: 'test@example.cz',
      GIT_COMMITTER_NAME: 'nfnn',
      GIT_COMMITTER_EMAIL: 'test@example.cz',
      GIT_CONFIG_NOSYSTEM: '1',
      HOME: cwd,
    },
  });
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.trim();
}

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function commit(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function repository({ change = () => {}, anchorOf = (baseline) => baseline } = {}) {
  const origin = mkdtempSync(join(tmpdir(), 'compare-v2-baseline-'));
  folders.push(origin);
  git(origin, 'init', '-q', '-b', 'main');
  write(origin, TRANSCRIPT, '{"source": "v2-baseline"}\n');
  write(origin, INVENTORY, '{"source": "v2-baseline"}\n');
  const baseline = commit(origin, 'Record the v2 baseline');
  write(origin, 'docs/later.md', 'later\n');
  commit(origin, 'Work after the baseline');
  write(origin, ANCHOR, `${anchorOf(baseline)}\n`);
  const base = commit(origin, 'Anchor the baseline');
  change(origin, { baseline, base });
  commit(origin, 'The pull request');
  const checkout = mkdtempSync(join(tmpdir(), 'compare-v2-checkout-'));
  folders.push(checkout);
  git(checkout, 'clone', '-q', '--depth=2', `file://${origin}`, '.');
  return { origin, checkout, baseline, base };
}

function guard(root, extra = []) {
  const run = spawnSync(process.execPath, [SCRIPT, `--repo=${root}`, ...extra], {
    encoding: 'utf8',
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

afterEach(() => {
  while (folders.length > 0) {
    rmSync(folders.pop(), { recursive: true, force: true });
  }
});

describe('Given a checkout whose baseline anchor names the commit that recorded v2', () => {
  it('when the baseline files are as that commit recorded them, then the guard fetches it and passes', () => {
    const { checkout, base } = repository();
    const result = guard(checkout, [`--base=${base}`]);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /equals the baseline commit/);
  });

  it('when the pull request edits a transcript, then the guard fails and names the file', () => {
    const { checkout, base } = repository({
      change: (origin) => write(origin, TRANSCRIPT, '{"source": "edited"}\n'),
    });
    const result = guard(checkout, [`--base=${base}`]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*baseline/);
    assert.match(result.output, /admin_donors\.json/);
  });

  it('when the pull request edits the test inventory, then the guard fails', () => {
    const { checkout, base } = repository({
      change: (origin) => write(origin, INVENTORY, '{"source": "edited"}\n'),
    });
    const result = guard(checkout, [`--base=${base}`]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /test-inventory\.json/);
  });

  it('when the pull request moves the anchor to another commit, then the guard fails', () => {
    const { checkout, base } = repository({
      change: (origin, { base: anchored }) => write(origin, ANCHOR, `${anchored}\n`),
    });
    const result = guard(checkout, [`--base=${base}`]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*BASELINE_COMMIT/);
  });

  it('when the tag v2-baseline points at the anchored commit, then the guard passes', () => {
    const { origin, checkout, baseline, base } = repository();
    git(origin, 'tag', 'v2-baseline', baseline);
    const result = guard(checkout, [`--base=${base}`]);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /tag v2-baseline/);
  });

  it('when the tag v2-baseline points elsewhere, then the guard fails', () => {
    const { origin, checkout, base } = repository();
    git(origin, 'tag', 'v2-baseline', base);
    const result = guard(checkout, [`--base=${base}`]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*v2-baseline/);
  });
});

describe('Given a checkout without a usable anchor', () => {
  it('when the anchor file is missing, then the guard fails instead of skipping', () => {
    const { checkout } = repository({
      change: (origin) => rmSync(join(origin, ANCHOR)),
    });
    const result = guard(checkout);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*BASELINE_COMMIT/);
  });

  it('when the anchor is not a full commit id, then the guard fails', () => {
    const { checkout } = repository({ anchorOf: (baseline) => baseline.slice(0, 12) });
    const result = guard(checkout);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*40/);
  });

  it('when the anchored commit cannot be fetched, then the guard fails instead of skipping', () => {
    const { checkout } = repository({ anchorOf: () => 'f'.repeat(40) });
    const result = guard(checkout);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*fetch/);
  });
});
