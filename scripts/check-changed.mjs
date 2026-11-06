#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const BACKEND_SUITE_LOCK = '/tmp/nfnn-full-suite.lock';
const BASE_REF = 'origin/main';
const DOCS = /^(docs\/|\.claude\/)|\.md$/;
const READ_BY_BACKEND_TESTS = ['test-cases/'];
const ORDER = ['scripts', 'mcp', 'frontend', 'backend'];

const FRONTEND = [
  'npm run format:check',
  'npm run lint',
  'npm run lint:styles',
  'npm test -- --watch=false',
  'npm run build',
  'npm run e2e',
  'npm run e2e:pwa',
];
const CONNECTOR = ['npm run check', 'npm run build'];

export function backendInputsOf(gradleBuild) {
  const files = [...gradleBuild.matchAll(/inputs\.file\("\.\.\/([^"]+)"\)/g)].map(
    ([, path]) => path,
  );
  const folders = [...gradleBuild.matchAll(/inputs\.files\(fileTree\("\.\.\/([^"]+)"\)\)/g)].map(
    ([, path]) => `${path.replace(/\/$/, '')}/`,
  );
  return { files, folders: [...folders, ...READ_BY_BACKEND_TESTS] };
}

function areasOfFile(path, backendInputs) {
  const areas = [];
  for (const area of ['backend', 'frontend', 'mcp', 'scripts']) {
    if (path.startsWith(`${area}/`)) areas.push(area);
  }
  if (
    backendInputs.files.includes(path) ||
    backendInputs.folders.some((folder) => path.startsWith(folder))
  ) {
    areas.push('backend');
  }
  if (path.startsWith('shared-cases/')) areas.push('frontend');
  return areas;
}

export function areasOf(paths, backendInputs) {
  const areas = new Set();
  const ciOnly = [];
  const code = paths.filter((path) => !DOCS.test(path));
  for (const path of code) {
    const found = areasOfFile(path, backendInputs);
    if (found.length === 0) ciOnly.push(path);
    found.forEach((area) => areas.add(area));
  }
  return { areas, ciOnly, docsOnly: paths.length > 0 && code.length === 0 };
}

export function commandsFor(areas, { changedFilesList, flock }) {
  const lock = flock ? `flock ${BACKEND_SUITE_LOCK} ` : '';
  const byArea = {
    scripts: [{ area: 'scripts', cwd: '.', command: 'node --test scripts/*.test.mjs' }],
    mcp: CONNECTOR.map((command) => ({ area: 'mcp', cwd: 'mcp', command })),
    frontend: FRONTEND.map((command) => ({ area: 'frontend', cwd: 'frontend', command })),
    backend: [
      { area: 'backend', cwd: 'backend', command: `API_TRANSCRIPTS=record ${lock}./gradlew test` },
      {
        area: 'v2 comparison',
        cwd: '.',
        command: `node scripts/compare-v2.mjs --changed=${changedFilesList}`,
      },
    ],
  };
  return ORDER.filter((area) => areas.has(area)).flatMap((area) => byArea[area]);
}

export function parseChangedFiles(nameStatus, untracked) {
  const fields = nameStatus.split('\0').filter(Boolean);
  const changed = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    changed.push({ status: fields[index], path: fields[index + 1] });
  }
  const added = untracked
    .split('\0')
    .filter(Boolean)
    .map((path) => ({ status: 'A', path }));
  return [...changed, ...added];
}

export function summaryLines(results) {
  return results.map(({ cwd, command, outcome, seconds }) => {
    const time = seconds === undefined ? '' : `${seconds.toFixed(1)}s`;
    return `${outcome.padEnd(8)}${time.padStart(6)}  ${cwd}: ${command}`;
  });
}

function git(args) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
    process.exit(2);
  }
  return result.stdout;
}

function changedFiles() {
  const base = git(['merge-base', 'HEAD', BASE_REF]).trim();
  const nameStatus = git(['diff', '--name-status', '--no-renames', '-z', base]);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']);
  return { base, files: parseChangedFiles(nameStatus, untracked) };
}

function hasFlock() {
  return spawnSync('sh', ['-c', 'command -v flock'], { stdio: 'ignore' }).status === 0;
}

function run(commands) {
  const results = [];
  for (const step of commands) {
    if (results.some(({ outcome }) => outcome === 'FAIL')) {
      results.push({ ...step, outcome: 'not run' });
      continue;
    }
    console.log(`\n> ${step.cwd}: ${step.command}`);
    const started = performance.now();
    const { status } = spawnSync(step.command, {
      cwd: join(root, step.cwd),
      shell: true,
      stdio: 'inherit',
    });
    const seconds = (performance.now() - started) / 1000;
    results.push({ ...step, outcome: status === 0 ? 'pass' : 'FAIL', seconds });
  }
  return results;
}

function main(args) {
  const unknown = args.filter((arg) => arg !== '--run');
  if (unknown.length > 0) {
    console.error('Usage: node scripts/check-changed.mjs [--run]');
    process.exit(2);
  }
  const { base, files } = changedFiles();
  const paths = files.map(({ path }) => path);
  const backendInputs = backendInputsOf(
    readFileSync(join(root, 'backend/build.gradle.kts'), 'utf8'),
  );
  const { areas, ciOnly, docsOnly } = areasOf(paths, backendInputs);
  console.log(
    `${paths.length} changed files against ${BASE_REF} (merge base ${base.slice(0, 8)}).`,
  );
  if (paths.length === 0) return;
  if (docsOnly) {
    console.log(
      'Only docs/, .claude/ or Markdown changed: CI runs only its gate, and nothing local is needed.',
    );
    return;
  }
  if (ciOnly.length > 0) {
    console.log(
      '\nNo local command in CLAUDE.md "Done means" covers these files; CI checks them (deploy-ci.md):',
    );
    ciOnly.forEach((path) => console.log(`  ${path}`));
  }
  const changedFilesList = join(
    mkdtempSync(join(tmpdir(), 'nfnn-check-changed-')),
    'changed-files.txt',
  );
  writeFileSync(changedFilesList, files.map(({ status, path }) => `${status}\t${path}\n`).join(''));
  const flock = hasFlock();
  const commands = commandsFor(areas, { changedFilesList, flock });
  if (commands.length === 0) return;
  console.log(`\nAreas: ${[...areas].join(', ')}. CLAUDE.md "Done means" asks for:`);
  commands.forEach(({ cwd, command }, index) => console.log(`  ${index + 1}. ${cwd}: ${command}`));
  if (areas.has('backend')) {
    if (!flock)
      console.log(
        `\nflock is not installed, so the backend suite runs without ${BACKEND_SUITE_LOCK}.`,
      );
    console.log('The comparison with the recording of main runs only in CI (job compare-v2).');
  }
  if (!args.includes('--run')) {
    console.log('\nRun them in order with: node scripts/check-changed.mjs --run');
    return;
  }
  const results = run(commands);
  console.log('\nSummary:');
  summaryLines(results).forEach((line) => console.log(`  ${line}`));
  if (results.some(({ outcome }) => outcome === 'FAIL')) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
