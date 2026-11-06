#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const BACKEND_SUITE_LOCK = '/tmp/nfnn-full-suite.lock';
const BASE_REF = 'origin/main';
const DOCS = /^(docs\/|\.claude\/)|\.md$/;
const AREA_FOLDERS = ['backend', 'frontend', 'mcp', 'scripts'];
const ORDER = ['scripts', 'mcp', 'frontend', 'shared-case copies', 'backend'];
const SHARED_CASE_FILES_TEST =
  'backend/src/test/java/cz/novanadeje/app/sharedcases/SharedCaseFilesTest.java';

export const CROSS_FOLDER_READS = [
  { path: 'test-cases/', area: 'backend', reader: 'BaselineHygieneTest and others read it' },
  { path: 'test-cases/', area: 'frontend', reader: 'backup-key-words.spec.ts' },
  {
    path: 'frontend/e2e/baseline/',
    area: 'backend',
    reader: 'BaselineDataSetsTest reads screens.spec.ts',
  },
  { path: 'frontend/e2e/baseline/', area: 'scripts', reader: 'compare-screens.test.mjs' },
  {
    path: 'regression/',
    area: 'frontend',
    reader: 'receipt-assets-setup.ts reads the v2 receipts',
  },
  {
    path: 'regression/',
    area: 'scripts',
    reader: 'compare-screens, screens-manifest and compare-v2 tests',
  },
  {
    path: 'backend/src/main/resources/application.yml',
    area: 'frontend',
    reader: 'build-fallback-worker.test.mjs in npm run lint',
  },
  {
    path: 'regression/',
    area: 'mcp',
    reader: 'backend-shapes.spec.ts reads regression/v2/api and changes',
  },
  { path: 'shared-cases/', area: 'frontend', reader: 'the Vitest runners of the shared cases' },
  { path: 'shared-cases/', area: 'scripts', reader: 'stack-journey.test.mjs' },
  {
    path: 'deploy/cloudflare/',
    area: 'frontend',
    reader: 'build-fallback-worker.test.mjs in npm run lint',
  },
];

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

const DROPPED_ENV = [
  /^MAIL_/,
  /^APP_/,
  /^SPRING_APPLICATION_JSON$/,
  /^SPRING_.*(PASSWORD|TOKEN|SECRET|KEY)/,
  /^(JWT_SECRET|SETTINGS_KEY|BACKUP_KEY|DB_PASSWORD|RECEIPT_SIGNING_KEY|FIO_TOKEN)$/,
];

export const quote = (text) => `'${text.replaceAll("'", `'\\''`)}'`;

export function backendInputsOf(gradleBuild) {
  const files = [...gradleBuild.matchAll(/inputs\.file\("\.\.\/([^"]+)"\)/g)].map(
    ([, path]) => path,
  );
  const folders = [...gradleBuild.matchAll(/inputs\.files\(fileTree\("\.\.\/([^"]+)"\)\)/g)].map(
    ([, path]) => `${path.replace(/\/$/, '')}/`,
  );
  return { files, folders };
}

export function sharedCaseFoldersOf(javaSource) {
  const list = javaSource.match(/SEARCHED_FOLDERS\s*=\s*List\.of\(([^)]*)\)/);
  if (!list) throw new Error(`No SEARCHED_FOLDERS in ${SHARED_CASE_FILES_TEST}`);
  return [...list[1].matchAll(/"([^"]+)"/g)].map(([, folder]) => `${folder}/`);
}

export function readRules(root = scriptRoot) {
  const read = (path) => readFileSync(join(root, path), 'utf8');
  return {
    backendInputs: backendInputsOf(read('backend/build.gradle.kts')),
    sharedCaseFolders: sharedCaseFoldersOf(read(SHARED_CASE_FILES_TEST)),
  };
}

function areasOfFile(path, { backendInputs }) {
  const areas = AREA_FOLDERS.filter((area) => path.startsWith(`${area}/`));
  if (
    backendInputs.files.includes(path) ||
    backendInputs.folders.some((folder) => path.startsWith(folder))
  ) {
    areas.push('backend');
  }
  for (const { path: prefix, area } of CROSS_FOLDER_READS) {
    if (path.startsWith(prefix)) areas.push(area);
  }
  return areas;
}

export function areasOf(paths, rules) {
  const areas = new Set();
  const ciOnly = [];
  const code = paths.filter((path) => !DOCS.test(path));
  for (const path of code) {
    const found = areasOfFile(path, rules);
    if (found.length === 0) ciOnly.push(path);
    found.forEach((area) => areas.add(area));
  }
  const docsOnly = paths.length > 0 && code.length === 0;
  const searchedOutsideBackend = paths.some(
    (path) =>
      !path.startsWith('backend/') &&
      rules.sharedCaseFolders.some((folder) => path.startsWith(folder)),
  );
  if (!docsOnly && searchedOutsideBackend && !areas.has('backend')) {
    areas.add('shared-case copies');
  }
  return { areas, ciOnly, docsOnly };
}

export function droppedEnvNames(env) {
  return Object.keys(env)
    .filter((name) => DROPPED_ENV.some((pattern) => pattern.test(name)))
    .sort();
}

export function filteredEnv(env) {
  const dropped = new Set(droppedEnvNames(env));
  return Object.fromEntries(Object.entries(env).filter(([name]) => !dropped.has(name)));
}

function backendSuite(lock, lockPath, dropped) {
  const unset = dropped.map((name) => `-u ${name} `).join('');
  const gradle = `env ${unset}API_TRANSCRIPTS=record ./gradlew test`;
  const waiting = 'echo "Waiting for the backend suite lock"';
  if (lock === 'flock') {
    return `flock -n ${lockPath} true || ${waiting}; flock ${lockPath} ${gradle}`;
  }
  if (lock === 'shlock') {
    return `until shlock -f ${lockPath} -p $$; do ${waiting}; sleep 30; done; trap 'rm -f ${lockPath}' EXIT; ${gradle}`;
  }
  return gradle;
}

export function commandsFor(
  areas,
  { scratch, base, lock, lockPath = BACKEND_SUITE_LOCK, dropped = [] },
) {
  const at = (name) => quote(join(scratch, name));
  const byArea = {
    scripts: [{ area: 'scripts', cwd: '.', command: 'node --test scripts/*.test.mjs' }],
    mcp: CONNECTOR.map((command) => ({ area: 'mcp', cwd: 'mcp', command })),
    frontend: FRONTEND.map((command) => ({ area: 'frontend', cwd: 'frontend', command })),
    'shared-case copies': [
      {
        area: 'shared-case copies',
        cwd: 'backend',
        command: './gradlew test --tests "*SharedCaseFilesTest" -PnoCucumber --rerun',
      },
    ],
    backend: [
      {
        area: 'backend',
        cwd: 'backend',
        command: backendSuite(lock, lockPath, dropped),
        filtersEnv: true,
      },
      {
        area: 'v2 baseline',
        cwd: '.',
        command: `node scripts/compare-v2-baseline.mjs --base=${base}`,
      },
      {
        area: 'v2 baseline',
        cwd: 'mcp',
        command:
          'API_TRANSCRIPTS_DIR=backend/build/api-transcripts npx --no vitest run test/backend-shapes.spec.ts',
      },
      {
        area: 'inventory',
        cwd: 'frontend',
        command: `npx --no ng test --watch=false --reporters=default --reporters=json --output-file=${at('frontend-vitest.json')}`,
      },
      {
        area: 'inventory',
        cwd: 'frontend',
        command: `npx --no playwright test --list --project='*' --reporter=json > ${at('frontend-playwright.json')}`,
      },
      {
        area: 'inventory',
        cwd: 'mcp',
        command: `npx --no vitest run --reporter=json --outputFile=${at('mcp-vitest.json')}`,
      },
      {
        area: 'inventory',
        cwd: '.',
        command: `node scripts/test-inventory.mjs --frontendVitest=${at('frontend-vitest.json')} --playwright=${at('frontend-playwright.json')} --mcpVitest=${at('mcp-vitest.json')} --out=${at('test-inventory.json')}`,
      },
      {
        area: 'v2 comparison',
        cwd: '.',
        command: `node scripts/compare-v2.mjs --changed=${at('changed-files.txt')} --inventory=${at('test-inventory.json')}`,
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

function git(directory, args) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: directory,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

export function changedFiles(directory, baseRef = BASE_REF) {
  const root = git(directory, ['rev-parse', '--show-toplevel']).trim();
  const known = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`], {
    cwd: root,
  });
  if (known.status !== 0) {
    const [remote, branch] = baseRef.split('/');
    throw new Error(`${baseRef} is unknown here; run git fetch ${remote} ${branch ?? ''}`.trim());
  }
  const base = git(root, ['merge-base', 'HEAD', baseRef]).trim();
  const nameStatus = git(root, ['diff', '--name-status', '--no-renames', '-z', base]);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  return { root, base, files: parseChangedFiles(nameStatus, untracked) };
}

export function availableLock() {
  const has = (tool) =>
    spawnSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' }).status === 0;
  return ['flock', 'shlock'].find(has) ?? 'none';
}

export function run(commands, { root, env = process.env, log = console.log }) {
  const results = [];
  for (const step of commands) {
    if (results.some(({ outcome }) => outcome === 'FAIL')) {
      results.push({ ...step, outcome: 'not run' });
      continue;
    }
    log(`\n> ${step.cwd}: ${step.command}`);
    const started = performance.now();
    const { status } = spawnSync(step.command, {
      cwd: join(root, step.cwd),
      env: step.filtersEnv ? filteredEnv(env) : env,
      shell: true,
      stdio: 'inherit',
    });
    const seconds = (performance.now() - started) / 1000;
    results.push({ ...step, outcome: status === 0 ? 'pass' : 'FAIL', status, seconds });
  }
  return results;
}

export function main(
  args,
  {
    directory = process.cwd(),
    baseRef = BASE_REF,
    rules = readRules(),
    env = process.env,
    lock = availableLock(),
    log = console.log,
  } = {},
) {
  if (args.some((arg) => arg !== '--run')) {
    log('Usage: node scripts/check-changed.mjs [--run]');
    return 2;
  }
  let changed;
  try {
    changed = changedFiles(directory, baseRef);
  } catch (error) {
    log(error.message);
    return 2;
  }
  const { root, base, files } = changed;
  const paths = files.map(({ path }) => path);
  const { areas, ciOnly, docsOnly } = areasOf(paths, rules);
  log(`${paths.length} changed files against ${baseRef} (merge base ${base.slice(0, 8)}).`);
  if (paths.length === 0) return 0;
  if (docsOnly) {
    log(
      'Only docs/, .claude/ or Markdown changed: CI runs only its gate, and nothing local is needed.',
    );
    return 0;
  }
  if (ciOnly.length > 0) {
    log(
      '\nNo local command in CLAUDE.md "Done means" covers these files; CI checks them (deploy-ci.md):',
    );
    ciOnly.forEach((path) => log(`  ${path}`));
  }
  const scratch = mkdtempSync(join(tmpdir(), 'nfnn-check-changed-'));
  writeFileSync(
    join(scratch, 'changed-files.txt'),
    files.map(({ status, path }) => `${status}\t${path}\n`).join(''),
  );
  const dropped = droppedEnvNames(env);
  const commands = commandsFor(areas, { scratch, base, lock, dropped });
  if (commands.length === 0) return 0;
  const order = [...new Set(commands.map(({ area }) => area))];
  log(`\nAreas in run order: ${order.join(', ')}. CLAUDE.md "Done means" asks for:`);
  commands.forEach(({ cwd, command }, index) => log(`  ${index + 1}. ${cwd}: ${command}`));
  if (areas.has('backend')) {
    if (lock === 'none') {
      log(
        `\nNeither flock nor shlock is installed, so the backend suite runs without ${BACKEND_SUITE_LOCK}.`,
      );
    }
    if (dropped.length > 0) {
      log(`\nThe backend suite records, so it runs without ${dropped.join(', ')}.`);
    }
    log('The comparison with the recording of main runs only in CI (job compare-v2).');
  } else {
    log(
      '\nNo backend recording, so the v2 and inventory comparisons run only in CI (job compare-v2).',
    );
  }
  if (!args.includes('--run')) {
    log('\nRun them in order with: node scripts/check-changed.mjs --run');
    return 0;
  }
  const results = run(commands, { root, env, log });
  log('\nSummary:');
  summaryLines(results).forEach((line) => log(`  ${line}`));
  return results.some(({ outcome }) => outcome === 'FAIL') ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
