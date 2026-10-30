#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ANCHOR = 'regression/v2/BASELINE_COMMIT';
const UNCHANGED = ['regression/v2/api', 'regression/v2/test-inventory.json'];
const ADDITIONS_ONLY = ['regression/v2/receipts', 'regression/v2/screens'];
const GUARDED = [...UNCHANGED, ...ADDITIONS_ONLY];
const INDEXES = new Map([
  ['regression/v2/receipts/digests.json', { list: 'samples', key: (item) => item.sample }],
  ['regression/v2/receipts/refusals.json', { list: 'cases', key: (item) => item.name }],
  [
    'regression/v2/screens/manifest.json',
    { list: 'shots', key: (item) => item.file, derived: ['totalBytes'] },
  ],
]);
const TAG = 'v2-baseline';
const defaults = {
  repo: resolve(fileURLToPath(new URL('..', import.meta.url))),
  remote: 'origin',
  base: '',
};

const options = { ...defaults };
for (const argument of process.argv.slice(2)) {
  const [name, ...rest] = argument.replace(/^--/, '').split('=');
  if (!(name in defaults) || rest.length === 0) {
    console.error(`Unknown option ${argument}; known: ${Object.keys(defaults).join(', ')}`);
    process.exit(2);
  }
  options[name] = rest.join('=');
}

function fail(message, detail = '') {
  console.log(`::error::${message}`);
  if (detail !== '') {
    console.log(detail);
  }
  process.exit(1);
}

function git(...args) {
  const run = spawnSync('git', ['-C', options.repo, ...args], { encoding: 'utf8' });
  return {
    ok: run.status === 0,
    status: run.status,
    out: run.stdout.trim(),
    err: run.stderr.trim(),
  };
}

const anchorFile = join(options.repo, ANCHOR);
if (!existsSync(anchorFile)) {
  fail(
    `${ANCHOR} is missing: it names the commit that recorded the v2 baseline, and the guard never runs without it`,
  );
}
const anchored = readFileSync(anchorFile, 'utf8').trim();
if (!/^[0-9a-f]{40}$/.test(anchored)) {
  fail(`${ANCHOR} must hold the full 40-character id of the commit that recorded the v2 baseline`);
}

if (options.base !== '') {
  if (!git('cat-file', '-e', `${options.base}^{commit}`).ok) {
    fail(`the base commit ${options.base} of the pull request is not in this checkout`);
  }
  const before = git('show', `${options.base}:${ANCHOR}`);
  if (before.ok && before.out !== anchored) {
    fail(
      `the pull request changes ${ANCHOR} from ${before.out} to ${anchored}; the baseline commit never moves`,
    );
  }
}

if (!git('cat-file', '-e', `${anchored}^{commit}`).ok) {
  const fetched = git('fetch', '--quiet', '--depth=1', options.remote, anchored);
  if (!fetched.ok) {
    fail(`cannot fetch the baseline commit ${anchored} from ${options.remote}`, fetched.err);
  }
}

const tags = git('ls-remote', '--tags', options.remote, `refs/tags/${TAG}`, `refs/tags/${TAG}^{}`);
if (!tags.ok) {
  fail(`cannot list the tag ${TAG} on ${options.remote}`, tags.err);
}
const tagged = new Map(
  tags.out
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\t').reverse()),
);
const tagCommit = tagged.get(`refs/tags/${TAG}^{}`) ?? tagged.get(`refs/tags/${TAG}`);
if (tagCommit !== undefined && tagCommit !== anchored) {
  fail(`the tag ${TAG} points at ${tagCommit}, but ${ANCHOR} names ${anchored}`);
}

const differs = git('diff', '--quiet', anchored, '--', ...UNCHANGED);
if (differs.status === 1) {
  fail(
    `${UNCHANGED.join(' or ')} differs from the baseline commit ${anchored}; a baseline file is never regenerated, declare the difference in regression/v2/changes/`,
    git('diff', '--stat', anchored, '--', ...UNCHANGED).out,
  );
}
if (!differs.ok) {
  fail(`cannot compare the baseline with ${anchored}`, differs.err);
}

const canonical = (value) => JSON.stringify(value);

function indexProblems(path, index) {
  const before = git('show', `${anchored}:${path}`);
  if (!before.ok) {
    return [`cannot read ${path} at the baseline commit: ${before.err}`];
  }
  let recorded;
  let now;
  try {
    recorded = JSON.parse(before.out);
    now = JSON.parse(readFileSync(join(options.repo, path), 'utf8'));
  } catch (unreadable) {
    return [`${path} cannot be read as JSON: ${unreadable.message}`];
  }
  const problems = [];
  const skipped = new Set([index.list, ...(index.derived ?? [])]);
  for (const field of new Set([...Object.keys(recorded), ...Object.keys(now)])) {
    if (!skipped.has(field) && canonical(recorded[field]) !== canonical(now[field])) {
      problems.push(`${path} changes its field ${field}`);
    }
  }
  const kept = new Map((now[index.list] ?? []).map((item) => [index.key(item), canonical(item)]));
  for (const item of recorded[index.list] ?? []) {
    const key = index.key(item);
    if (!kept.has(key)) {
      problems.push(`${path} drops the recorded entry ${key}`);
    } else if (kept.get(key) !== canonical(item)) {
      problems.push(`${path} changes the recorded entry ${key}`);
    }
  }
  return problems;
}

const listed = git('diff', '--name-status', '--no-renames', anchored, '--', ...ADDITIONS_ONLY);
if (!listed.ok) {
  fail(`cannot compare the receipt corpus and the screens manifest with ${anchored}`, listed.err);
}
const added = [];
const problems = [];
for (const line of listed.out.split('\n').filter((text) => text !== '')) {
  const [status, path] = line.split('\t');
  if (status === 'A') {
    added.push(path);
  } else if (status === 'D') {
    problems.push(`${path} is deleted, but a file of the baseline is never deleted`);
  } else if (INDEXES.has(path)) {
    const found = indexProblems(path, INDEXES.get(path));
    problems.push(...found);
    if (found.length === 0) {
      added.push(`entries of ${path}`);
    }
  } else {
    problems.push(
      `${path} differs from the baseline commit, but a file of the baseline never changes`,
    );
  }
}
if (problems.length > 0) {
  fail(
    `${problems.join('; ')} (${anchored}); record a new sample or state from that commit and list it as a baseline-addition in regression/v2/changes/`,
  );
}
console.log(
  `regression/v2 equals the baseline commit ${anchored}${
    added.length === 0 ? '' : `, plus files added since: ${added.join(', ')}`
  }; ${tagCommit === undefined ? `the tag ${TAG} does not exist` : `the tag ${TAG} points at it`}`,
);
