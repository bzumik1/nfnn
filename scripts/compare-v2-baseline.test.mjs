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
const RECEIPT = 'regression/v2/receipts/single-person-cs.json';
const MANIFEST = 'regression/v2/screens/manifest.json';
const shot = (state, digest) => ({
  state,
  width: 390,
  file: `${state}-390.png`,
  bytes: 10,
  pixelsSha256: digest,
});
const manifest = (shots) =>
  `${JSON.stringify({ source: 'v2-baseline', logic: 'shots', totalBytes: shots.length * 10, shots }, null, 2)}\n`;
const BASELINE_SHOTS = [shot('home', 'a'.repeat(64)), shot('login', 'b'.repeat(64))];

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

function repository({
  change = () => {},
  anchorOf = (baseline) => baseline,
  afterBaseline = () => {},
} = {}) {
  const origin = mkdtempSync(join(tmpdir(), 'compare-v2-baseline-'));
  folders.push(origin);
  git(origin, 'init', '-q', '-b', 'main');
  write(origin, TRANSCRIPT, '{"source": "v2-baseline"}\n');
  write(origin, INVENTORY, '{"source": "v2-baseline"}\n');
  write(origin, RECEIPT, '{"source": "v2-baseline", "pages": 1}\n');
  write(origin, MANIFEST, manifest(BASELINE_SHOTS));
  const baseline = commit(origin, 'Record the v2 baseline');
  write(origin, 'docs/later.md', 'later\n');
  afterBaseline(origin);
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

describe('Given the receipt corpus and the screens manifest of the baseline commit', () => {
  const guarded = (change) => {
    const { checkout, base } = repository({ change });
    return guard(checkout, [`--base=${base}`]);
  };

  it('when the pull request edits a receipt sample, then the guard fails and names the file', () => {
    const result = guarded((origin) =>
      write(origin, RECEIPT, '{"source": "v2-baseline", "pages": 2}\n'),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*single-person-cs\.json.*never changes/);
  });

  it('when the pull request deletes a receipt sample, then the guard fails and names the file', () => {
    const result = guarded((origin) => rmSync(join(origin, RECEIPT)));
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*single-person-cs\.json.*deleted/);
  });

  it('when the pull request adds a receipt sample, then the guard passes and lists the addition', () => {
    const result = guarded((origin) =>
      write(
        origin,
        'regression/v2/receipts/yearly-500-gifts-cs.json',
        '{"source": "v2-baseline"}\n',
      ),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /yearly-500-gifts-cs\.json/);
  });

  it('when the manifest gains a shot and keeps every recorded one, then the guard passes', () => {
    const result = guarded((origin) =>
      write(
        origin,
        MANIFEST,
        manifest([BASELINE_SHOTS[0], shot('totp', 'c'.repeat(64)), BASELINE_SHOTS[1]]),
      ),
    );
    assert.equal(result.status, 0, result.output);
  });

  it('when the manifest changes the digest of a recorded shot, then the guard fails and names the shot', () => {
    const result = guarded((origin) =>
      write(origin, MANIFEST, manifest([BASELINE_SHOTS[0], shot('login', 'd'.repeat(64))])),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*manifest\.json.*login-390\.png/);
  });

  it('when the manifest loses a recorded shot or changes its description, then the guard fails', () => {
    for (const text of [
      manifest([BASELINE_SHOTS[0]]),
      manifest(BASELINE_SHOTS).replace('"logic": "shots"', '"logic": "other shots"'),
    ]) {
      const result = guarded((origin) => write(origin, MANIFEST, text));
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /::error::.*manifest\.json/);
    }
  });
});

describe('Given entries and samples added to the baseline after its commit', () => {
  const LATER = shot('totp', 'c'.repeat(64));
  const LATER_RECEIPT = 'regression/v2/receipts/yearly-500-gifts-cs.json';
  const afterBaseline = (origin) => {
    write(origin, MANIFEST, manifest([...BASELINE_SHOTS, LATER]));
    write(origin, LATER_RECEIPT, '{"source": "v2-baseline", "pages": 9}\n');
  };
  const guarded = (change) => {
    const { checkout, base } = repository({ afterBaseline, change });
    return guard(checkout, [`--base=${base}`]);
  };

  it('when the pull request changes an entry added after the baseline, then the guard fails and names it', () => {
    const result = guarded((origin) =>
      write(origin, MANIFEST, manifest([...BASELINE_SHOTS, shot('totp', 'd'.repeat(64))])),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*manifest\.json.*totp-390\.png/);
  });

  it('when the pull request drops an entry added after the baseline, then the guard fails', () => {
    const result = guarded((origin) => write(origin, MANIFEST, manifest(BASELINE_SHOTS)));
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*manifest\.json.*totp-390\.png/);
  });

  it('when the pull request edits a receipt sample added after the baseline, then the guard fails', () => {
    const result = guarded((origin) =>
      write(origin, LATER_RECEIPT, '{"source": "v2-baseline", "pages": 10}\n'),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*yearly-500-gifts-cs\.json/);
  });

  it('when the pull request keeps them and adds another entry, then the guard passes', () => {
    const result = guarded((origin) =>
      write(
        origin,
        MANIFEST,
        manifest([...BASELINE_SHOTS, LATER, shot('qr-error', 'e'.repeat(64))]),
      ),
    );
    assert.equal(result.status, 0, result.output);
  });
});

describe('Given a baseline addition that names its patch', () => {
  const PATCH = 'regression/v2/additions/0.6c-screens.patch';
  const APPLIES = [
    'diff --git a/notes/extra.txt b/notes/extra.txt',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/notes/extra.txt',
    '@@ -0,0 +1 @@',
    '+extra',
    '',
  ].join('\n');
  const DOES_NOT_APPLY = [
    'diff --git a/docs/later.md b/docs/later.md',
    '--- a/docs/later.md',
    '+++ b/docs/later.md',
    '@@ -1 +1 @@',
    '-later',
    '+sooner',
    '',
  ].join('\n');
  const declared = (origin, { baseline }, patch) => {
    write(
      origin,
      'regression/v2/changes/0.6c.json',
      `${JSON.stringify([
        {
          kind: 'baseline-addition',
          file: MANIFEST,
          recordedFrom: baseline,
          patch: PATCH,
          record: 'scripts/record-baseline-data.sh',
          reason: 'r',
        },
      ])}\n`,
    );
    if (patch !== undefined) {
      write(origin, PATCH, patch);
    }
  };
  const guarded = (patch) => {
    const { checkout, base } = repository({
      change: (origin, ids) => declared(origin, ids, patch),
    });
    return guard(checkout, [`--base=${base}`]);
  };

  it('when the patch applies on the baseline commit, then the guard passes', () => {
    const result = guarded(APPLIES);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /0\.6c-screens\.patch applies/);
  });

  it('when the patch does not apply on the baseline commit, then the guard fails and names it', () => {
    const result = guarded(DOES_NOT_APPLY);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*0\.6c-screens\.patch.*does not apply/);
  });

  it('when the patch is missing, then the guard fails and names it', () => {
    const result = guarded(undefined);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*0\.6c-screens\.patch.*missing/);
  });
});
