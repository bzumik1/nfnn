import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  BACKEND_SUITE_LOCK,
  areasOf,
  changedFiles,
  commandsFor,
  droppedEnvNames,
  main,
  missingInstalls,
  parseChangedFiles,
  quote,
  readRules,
  run,
  summaryLines,
} from './check-changed.mjs';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const RULES = readRules();
const SCRATCH = '/tmp/check changed';
const BASE = '675e0ced';
const OPTIONS = { scratch: SCRATCH, lock: 'flock', dropped: [], base: BASE };
const commandLines = (areas, options = OPTIONS) =>
  commandsFor(new Set(areas), options).map(({ cwd, command }) => `${cwd}: ${command}`);
const suiteLine = (options) =>
  commandLines(['backend'], options).find((line) => line.startsWith('backend: '));
const areas = (files) => [...areasOf(files, RULES).areas].sort();
const folders = [];
const scratchRoot = () => {
  const folder = mkdtempSync(join(tmpdir(), 'check-changed-scratch-'));
  folders.push(folder);
  return folder;
};
after(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));

describe('Given the rules the backend tests carry', () => {
  it('when the build file is read, then the shared cases, the baseline and the single files outside backend/ are its test inputs', () => {
    assert.ok(RULES.backendInputs.folders.includes('shared-cases/'));
    assert.ok(RULES.backendInputs.folders.includes('regression/'));
    assert.ok(RULES.backendInputs.files.includes('frontend/ngsw-config.json'));
    assert.ok(RULES.backendInputs.files.includes('deploy/backup/revoke-restored-credentials.sql'));
  });

  it('when the settings enum is read, then its secrets are the ones recording refuses', () => {
    assert.deepEqual(RULES.settingSecrets, ['MAIL_PASSWORD', 'FIO_TOKEN']);
  });

  it('when SharedCaseFilesTest is read, then its searched folders are the ones it walks', () => {
    assert.ok(RULES.sharedCaseFolders.includes('frontend/src/'));
    assert.ok(RULES.sharedCaseFolders.includes('mcp/test/'));
    assert.ok(RULES.sharedCaseFolders.includes('deploy/'));
  });
});

describe('Given the files a branch changed', () => {
  it('when only docs/, .claude/ and Markdown changed, then the change is docs-only and no area is affected', () => {
    const result = areasOf(
      ['docs/roadmap.md', '.claude/rules/testing.md', 'frontend/README.md'],
      RULES,
    );
    assert.equal(result.docsOnly, true);
    assert.deepEqual([...result.areas], []);
  });

  it('when a file under backend/ changed, then the backend is affected', () => {
    assert.deepEqual(areas(['backend/src/main/java/A.java']), ['backend']);
  });

  it('when a frontend source changed, then the frontend is affected and the shared-case copies are checked', () => {
    assert.deepEqual(areas(['frontend/src/app/app.ts']), ['frontend', 'shared-case copies']);
  });

  it('when a frontend file the backend tests declare as input changed, then the backend runs instead of the copy check alone', () => {
    assert.deepEqual(areas(['frontend/ngsw-config.json']), ['backend', 'frontend']);
  });

  it('when the screens spec changed, then the backend and the scripts are affected, whose BaselineDataSetsTest and compare-screens tests read it', () => {
    assert.deepEqual(areas(['frontend/e2e/baseline/screens.spec.ts']), [
      'backend',
      'frontend',
      'scripts',
    ]);
  });

  it('when a connector source changed, then the connector is affected and the shared-case copies are checked', () => {
    assert.deepEqual(areas(['mcp/src/server.ts']), ['mcp', 'shared-case copies']);
  });

  it('when a file under scripts/ changed, then the scripts are affected and the shared-case copies are checked', () => {
    assert.deepEqual(areas(['scripts/compare-v2.mjs']), ['scripts', 'shared-case copies']);
  });

  it('when a shared case changed, then the backend, the frontend and the scripts are affected, all of which read it', () => {
    assert.deepEqual(areas(['shared-cases/qr/payment.json']), ['backend', 'frontend', 'scripts']);
  });

  it('when a file under regression/ changed, then the backend, the frontend, the connector and the scripts are affected, whose tests read it', () => {
    assert.deepEqual(areas(['regression/v2/changes/pr-500.json']), [
      'backend',
      'frontend',
      'mcp',
      'scripts',
    ]);
  });

  it('when a file under test-cases/ changed, then the backend and the frontend are affected, whose tests read it', () => {
    assert.deepEqual(areas(['test-cases/backup-key-words.json']), ['backend', 'frontend']);
  });

  it('when the backend application.yml changed, then the frontend is affected too, whose lint tests the outage Worker against it', () => {
    assert.deepEqual(areas(['backend/src/main/resources/application.yml']), [
      'backend',
      'frontend',
    ]);
  });

  it('when the outage Worker changed, then the frontend is affected, whose lint tests it', () => {
    assert.deepEqual(areas(['deploy/cloudflare/nfnn-fallback-worker.mjs']), [
      'frontend',
      'shared-case copies',
    ]);
  });

  it('when a file outside every area changed, then it is listed as checked only by CI', () => {
    const result = areasOf(
      ['.github/workflows/pr-check.yml', 'docker-compose.yml', 'docs/a.md'],
      RULES,
    );
    assert.deepEqual(result.ciOnly, ['.github/workflows/pr-check.yml', 'docker-compose.yml']);
    assert.deepEqual([...result.areas], ['shared-case copies']);
  });

  it('when docs change beside code, then the copy check covers them as CI does', () => {
    assert.deepEqual(areas(['docs/roadmap.md', 'docker-compose.yml']), ['shared-case copies']);
  });

  it('when a file this script reads its rules from changed, then the scripts are affected too, whose check-changed test reads it', () => {
    for (const path of [
      'backend/build.gradle.kts',
      'backend/src/test/java/cz/novanadeje/app/sharedcases/SharedCaseFilesTest.java',
      'backend/src/main/java/cz/novanadeje/app/operations/domain/settings/Setting.java',
    ]) {
      assert.deepEqual(areas([path]), ['backend', 'scripts'], path);
    }
  });

  it('when only CLAUDE.md changed, then the change is docs-only and only the check-changed test runs', () => {
    const result = areasOf(['CLAUDE.md', 'docs/a.md'], RULES);
    assert.equal(result.docsOnly, true);
    assert.deepEqual([...result.areas], ['check-changed tests']);
  });

  it('when CLAUDE.md changed beside code, then the scripts are affected', () => {
    assert.deepEqual(areas(['CLAUDE.md', 'frontend/src/app/app.ts']), [
      'frontend',
      'scripts',
      'shared-case copies',
    ]);
  });

  it('when a Markdown file sits under backend/, then it counts as docs, as CI counts it', () => {
    assert.deepEqual(areas(['backend/HELP.md']), []);
  });
});

describe('Given the output of git', () => {
  it('when name-status and untracked lists are parsed, then every path is kept with its status and untracked files count as added', () => {
    assert.deepEqual(parseChangedFiles('M\0backend/a.java\0D\0frontend/old.ts\0', 'mcp/new.ts\0'), [
      { status: 'M', path: 'backend/a.java' },
      { status: 'D', path: 'frontend/old.ts' },
      { status: 'A', path: 'mcp/new.ts', untracked: true },
    ]);
  });
});

function repository() {
  const folder = mkdtempSync(join(tmpdir(), 'check-changed-test-'));
  folders.push(folder);
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        ...args,
      ],
      {
        cwd: folder,
        stdio: 'pipe',
      },
    );
  const write = (path, text = 'x\n') => {
    mkdirSync(join(folder, path, '..'), { recursive: true });
    writeFileSync(join(folder, path), text);
  };
  git('init', '-q', '-b', 'main');
  return { folder, git, write };
}

describe('Given a git repository with a branch off its base', () => {
  const { folder, git, write } = repository();
  ['backend/a.java', 'frontend/old.ts', 'mcp/moved.ts', 'scripts/kept.mjs'].forEach((path) =>
    write(path),
  );
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('branch', 'base');
  write('scripts/kept.mjs', 'changed\n');
  git('commit', '-q', '-am', 'committed');
  write('backend/a.java', 'staged\n');
  git('add', 'backend/a.java');
  git('rm', '-q', 'frontend/old.ts');
  git('mv', 'mcp/moved.ts', 'mcp/renamed.ts');
  write('shared-cases/new.json');
  write('regression/v2/changes/new.json');

  it('when the changes are read from a subdirectory, then committed, staged, deleted, renamed and untracked files are listed from the root', () => {
    const { files } = changedFiles(join(folder, 'backend'), 'base');
    assert.deepEqual(files.map(({ status, path }) => `${status} ${path}`).sort(), [
      'A mcp/renamed.ts',
      'A regression/v2/changes/new.json',
      'A shared-cases/new.json',
      'D frontend/old.ts',
      'D mcp/moved.ts',
      'M backend/a.java',
      'M scripts/kept.mjs',
    ]);
  });

  it('when the base is unknown, then main says to fetch it', () => {
    const lines = [];
    assert.equal(
      main([], {
        directory: folder,
        baseRef: 'origin/main',
        rules: RULES,
        scratchRoot: scratchRoot(),
        log: (line) => lines.push(line),
      }),
      2,
    );
    assert.match(lines.join('\n'), /git fetch origin main/);
  });

  it('when main lists the commands, then the areas come in run order and nothing runs', () => {
    const lines = [];
    const code = main([], {
      directory: folder,
      baseRef: 'base',
      rules: RULES,
      scratchRoot: scratchRoot(),
      env: {},
      lock: 'none',
      log: (line) => lines.push(line),
    });
    assert.equal(code, 0);
    const output = lines.join('\n');
    assert.match(
      output,
      /Areas in run order: scripts, mcp, frontend, v2 baseline, backend, inventory, v2 comparison\./,
    );
    assert.match(output, /Neither flock nor shlock is installed/);
    assert.match(
      output,
      /regression\/v2\/changes\/new\.json is untracked: commit or `git add -N` it so the baseline guard sees it/,
    );
    assert.match(output, /Run npm ci in frontend\/ and mcp\/ first/);
    assert.match(output, /Run them in order with: node scripts\/check-changed\.mjs --run/);
  });
});

describe('Given a repository with only a docs change', () => {
  const { folder, git, write } = repository();
  write('docs/a.md');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('branch', 'base');
  write('docs/a.md', 'changed\n');

  it('when main runs, then it says CI runs only its gate and nothing local is needed', () => {
    const lines = [];
    assert.equal(
      main(['--run'], {
        directory: folder,
        baseRef: 'base',
        rules: RULES,
        scratchRoot: scratchRoot(),
        log: (line) => lines.push(line),
      }),
      0,
    );
    assert.match(lines.join('\n'), /CI runs only its gate, and nothing local is needed/);
  });
});

function branchRepository(path) {
  const repo = repository();
  repo.write(path);
  repo.git('add', '.');
  repo.git('commit', '-q', '-m', 'base');
  repo.git('branch', 'base');
  repo.write(path, 'changed\n');
  return repo;
}

function mainOutput(folder, args = []) {
  const lines = [];
  const code = main(args, {
    directory: folder,
    baseRef: 'base',
    rules: RULES,
    scratchRoot: scratchRoot(),
    log: (line) => lines.push(line),
  });
  return { code, output: lines.join('\n') };
}

describe('Given a repository where only CLAUDE.md changed', () => {
  const { folder } = branchRepository('CLAUDE.md');

  it('when main lists the commands, then CI runs only its gate and the check-changed test is still asked for', () => {
    const { code, output } = mainOutput(folder);
    assert.equal(code, 0);
    assert.match(output, /CI runs only its gate/);
    assert.match(output, /1\. \.: node --test scripts\/check-changed\.test\.mjs/);
  });
});

describe('Given a repository where only the frontend changed', () => {
  const { folder } = branchRepository('frontend/src/app.ts');

  it('when main lists the commands, then it says a renamed or removed test needs a retired entry for CI', () => {
    const { output } = mainOutput(folder);
    assert.match(output, /inventory comparisons run only in CI/);
    assert.match(
      output,
      /A renamed or removed test needs a `retired` entry in regression\/v2\/changes\/<PR>\.json, or CI's inventory comparison fails\./,
    );
  });

  it('when the dependencies are missing and the checks should run, then main stops before running anything', () => {
    const { code, output } = mainOutput(folder, ['--run']);
    assert.equal(code, 2);
    assert.match(output, /Run npm ci in frontend\/ first/);
    assert.doesNotMatch(output, /Summary:/);
  });
});

describe('Given the installed dependencies', () => {
  const { folder, write } = repository();
  write('frontend/node_modules/.package-lock.json');

  it('when the backend runs, then both the frontend and the connector need theirs', () => {
    assert.deepEqual(missingInstalls(folder, new Set(['backend'])), ['mcp']);
  });

  it('when only the scripts run, then nothing is needed', () => {
    assert.deepEqual(missingInstalls(folder, new Set(['scripts', 'shared-case copies'])), []);
  });

  it('when the connector runs, then its own is needed', () => {
    assert.deepEqual(missingInstalls(folder, new Set(['mcp', 'frontend'])), ['mcp']);
  });
});

describe('Given the affected areas', () => {
  it('when the backend is affected, then the baseline guard runs first, the full suite records again under the lock even when Gradle finds it up to date, the connector shapes check the recording, then the inventory is collected into the scratch folder and the v2 comparison reads both', () => {
    const at = (name) => quote(`${SCRATCH}/${name}`);
    assert.deepEqual(commandLines(['backend']), [
      `.: node scripts/compare-v2-baseline.mjs --base=${BASE}`,
      `backend: flock -n ${BACKEND_SUITE_LOCK} true || echo "Waiting for the backend suite lock"; flock ${BACKEND_SUITE_LOCK} env API_TRANSCRIPTS=record ./gradlew test --rerun acceptanceTest --rerun`,
      'mcp: API_TRANSCRIPTS_DIR=backend/build/api-transcripts npx --no vitest run test/backend-shapes.spec.ts',
      `frontend: npx --no ng test --watch=false --reporters=default --reporters=json --output-file=${at('frontend-vitest.json')}`,
      `frontend: npx --no playwright test --list --project='*' --reporter=json > ${at('frontend-playwright.json')}`,
      `mcp: npx --no vitest run --reporter=json --outputFile=${at('mcp-vitest.json')}`,
      `.: node scripts/test-inventory.mjs --frontendVitest=${at('frontend-vitest.json')} --playwright=${at('frontend-playwright.json')} --mcpVitest=${at('mcp-vitest.json')} --out=${at('test-inventory.json')}`,
      `.: node scripts/compare-v2.mjs --changed=${at('changed-files.txt')} --inventory=${at('test-inventory.json')}`,
    ]);
  });

  it('when the inventory is written, then it never goes to its tracked default path', () => {
    assert.ok(
      !commandLines(['backend']).some((line) => line.includes('regression/v2/test-inventory.json')),
    );
  });

  it('when only shlock is installed, then the suite waits for the lock in a loop, removes it at the end and keeps Gradle exit code', () => {
    assert.equal(
      suiteLine({ ...OPTIONS, lock: 'shlock' }),
      `backend: until shlock -f ${BACKEND_SUITE_LOCK} -p $$; do echo "Waiting for the backend suite lock"; sleep 30; done; trap 'rm -f ${BACKEND_SUITE_LOCK}' EXIT; env API_TRANSCRIPTS=record ./gradlew test --rerun acceptanceTest --rerun`,
    );
  });

  it('when the lock has another path, then the suite takes that one', () => {
    assert.ok(
      suiteLine({
        ...OPTIONS,
        lock: 'shlock',
        lockPath: '/tmp/other.lock',
      }).includes("trap 'rm -f /tmp/other.lock' EXIT"),
    );
  });

  it('when no lock tool is installed, then the suite runs unlocked', () => {
    assert.equal(
      suiteLine({ ...OPTIONS, lock: 'none' }),
      'backend: env API_TRANSCRIPTS=record ./gradlew test --rerun acceptanceTest --rerun',
    );
  });

  it('when secrets are in the environment, then the printed suite unsets them', () => {
    assert.equal(
      suiteLine({
        ...OPTIONS,
        lock: 'none',
        dropped: ['FIO_TOKEN', 'MAIL_HOST'],
      }),
      'backend: env -u FIO_TOKEN -u MAIL_HOST API_TRANSCRIPTS=record ./gradlew test --rerun acceptanceTest --rerun',
    );
  });

  it('when the frontend is affected, then its whole chain runs in order, e2e and the web app tests included', () => {
    assert.deepEqual(commandLines(['frontend']), [
      'frontend: npm run format:check',
      'frontend: npm run lint',
      'frontend: npm run lint:styles',
      'frontend: npm test -- --watch=false',
      'frontend: npm run build',
      'frontend: npm run e2e',
      'frontend: npm run e2e:pwa',
    ]);
  });

  it('when the connector is affected, then its check and build run', () => {
    assert.deepEqual(commandLines(['mcp']), ['mcp: npm run check', 'mcp: npm run build']);
  });

  it('when the scripts are affected, then their tests run', () => {
    assert.deepEqual(commandLines(['scripts']), ['.: node --test scripts/*.test.mjs']);
  });

  it('when only the check-changed test is affected, then only it runs', () => {
    assert.deepEqual(commandLines(['check-changed tests']), [
      '.: node --test scripts/check-changed.test.mjs',
    ]);
  });

  it('when only the shared-case copies are checked, then SharedCaseFilesTest runs again on its own', () => {
    assert.deepEqual(commandLines(['shared-case copies']), [
      'backend: ./gradlew test --tests "*SharedCaseFilesTest" -PnoCucumber --rerun',
    ]);
  });

  it('when every area is affected, then the quick ones come first and the v2 comparison last', () => {
    const order = commandsFor(
      new Set(['backend', 'frontend', 'mcp', 'scripts', 'shared-case copies']),
      OPTIONS,
    ).map(({ area }) => area);
    assert.deepEqual(
      [...new Set(order)],
      [
        'scripts',
        'mcp',
        'frontend',
        'shared-case copies',
        'v2 baseline',
        'backend',
        'inventory',
        'v2 comparison',
      ],
    );
  });

  it('when no area is affected, then no command runs', () => {
    assert.deepEqual(commandsFor(new Set(), OPTIONS), []);
  });
});

describe('Given an environment with settings recording refuses', () => {
  const env = {
    PATH: '/bin',
    MAIL_HOST: 'smtp',
    APP_SITE_PUBLIC_URL: 'x',
    SPRING_APPLICATION_JSON: '{}',
    SPRING_DATASOURCE_PASSWORD: 'p',
    SPRING_PROFILES_ACTIVE: 'dev',
    JWT_SECRET: 's',
    SETTINGS_KEY: 's',
    BACKUP_KEY: 's',
    DB_PASSWORD: 's',
    RECEIPT_SIGNING_KEY: 's',
    FIO_TOKEN: 't',
    HOME: '/home',
  };

  it('when the names to drop are read, then every refused one is listed and the others stay', () => {
    assert.deepEqual(droppedEnvNames(env, RULES.settingSecrets), [
      'APP_SITE_PUBLIC_URL',
      'BACKUP_KEY',
      'DB_PASSWORD',
      'FIO_TOKEN',
      'JWT_SECRET',
      'MAIL_HOST',
      'RECEIPT_SIGNING_KEY',
      'SETTINGS_KEY',
      'SPRING_APPLICATION_JSON',
      'SPRING_DATASOURCE_PASSWORD',
    ]);
  });

  it('when a secret setting is not named by the settings enum, then only the patterns drop it', () => {
    assert.deepEqual(droppedEnvNames({ FIO_TOKEN: 't', PATH: '/bin' }, []), []);
    assert.deepEqual(droppedEnvNames({ FIO_TOKEN: 't', PATH: '/bin' }, ['FIO_TOKEN']), [
      'FIO_TOKEN',
    ]);
  });
});

describe('Given steps to run', () => {
  const { folder } = repository();

  it('when shlock guards a suite that fails, then its exit code is kept and the lock is gone', (context) => {
    if (spawnSync('sh', ['-c', 'command -v shlock']).status !== 0) {
      context.skip('shlock is not installed');
      return;
    }
    const lockPath = join(folder, 'suite.lock');
    const suite = commandsFor(new Set(['backend']), { ...OPTIONS, lock: 'shlock', lockPath }).find(
      ({ area }) => area === 'backend',
    );
    const step = {
      ...suite,
      cwd: '.',
      command: suite.command.replace(
        './gradlew test --rerun acceptanceTest --rerun',
        "sh -c 'exit 3'",
      ),
    };
    const [result] = run([step], { root: folder, log: () => {} });
    assert.equal(result.outcome, 'FAIL');
    assert.equal(result.status, 3);
    assert.equal(existsSync(lockPath), false);
  });
  const node = (script) => `node -e ${quote(script)}`;

  it('when one fails, then the later ones are not run and the step that filters the environment sees no refused setting', () => {
    const results = run(
      [
        {
          area: 'a',
          cwd: '.',
          command: node('process.exit(process.env.MAIL_HOST ? 1 : 0)'),
          unset: ['MAIL_HOST'],
        },
        { area: 'a', cwd: '.', command: node('process.exit(process.env.MAIL_HOST ? 3 : 0)') },
        { area: 'a', cwd: '.', command: node('process.exit(0)') },
      ],
      { root: folder, env: { ...process.env, MAIL_HOST: 'smtp' }, log: () => {} },
    );
    assert.deepEqual(
      results.map(({ outcome }) => outcome),
      ['pass', 'FAIL', 'not run'],
    );
  });
});

describe('Given CLAUDE.md "Done means"', () => {
  const doneMeans = read('CLAUDE.md').split('## Done means')[1].split('\n## ')[0];
  const chain = (area) =>
    commandsFor(new Set([area]), OPTIONS)
      .filter((command) => command.area === area)
      .map(({ command }) => command)
      .join(' && ');

  it('when the frontend chain is joined, then it is exactly the chain CLAUDE.md requires', () => {
    assert.ok(doneMeans.includes(`frontend: \`${chain('frontend')}\``), chain('frontend'));
  });

  it('when the connector chain is joined, then it is exactly the chain CLAUDE.md requires', () => {
    assert.ok(doneMeans.includes(`connector: \`${chain('mcp')}\``), chain('mcp'));
  });

  it('when the backend command is read, then it runs the suite CLAUDE.md requires', () => {
    assert.ok(doneMeans.includes('backend: `./gradlew test`'));
    assert.ok(chain('backend').endsWith('./gradlew test --rerun acceptanceTest --rerun'));
  });

  it('when the section is read, then it points to this script and leaves the comparison with main to CI', () => {
    assert.ok(
      doneMeans.includes(
        '`node scripts/check-changed.mjs --run` runs these for the changed areas; the comparison with `main` stays CI',
      ),
    );
  });
});

describe('Given the results of a run', () => {
  it('when one command failed, then the summary names each result and duration and the commands not run', () => {
    const lines = summaryLines([
      { area: 'mcp', cwd: 'mcp', command: 'npm run check', outcome: 'pass', seconds: 12.34 },
      { area: 'mcp', cwd: 'mcp', command: 'npm run build', outcome: 'FAIL', seconds: 3 },
      { area: 'frontend', cwd: 'frontend', command: 'npm run lint', outcome: 'not run' },
    ]);
    assert.deepEqual(lines, [
      'pass     12.3s  mcp: npm run check',
      'FAIL      3.0s  mcp: npm run build',
      'not run         frontend: npm run lint',
    ]);
  });
});
