import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  BACKEND_SUITE_LOCK,
  areasOf,
  backendInputsOf,
  commandsFor,
  parseChangedFiles,
  summaryLines,
} from './check-changed.mjs';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const BACKEND_INPUTS = backendInputsOf(read('backend/build.gradle.kts'));
const OPTIONS = {
  backendInputs: BACKEND_INPUTS,
  changedFilesList: '/tmp/changed.txt',
  flock: true,
};
const commandLines = (areas, options = OPTIONS) =>
  commandsFor(areas, options).map(({ cwd, command }) => `${cwd}: ${command}`);

describe('Given the backend build file', () => {
  it('when its declared test inputs are read, then the shared cases, the baseline and the single files outside backend/ are listed', () => {
    assert.ok(BACKEND_INPUTS.folders.includes('shared-cases/'));
    assert.ok(BACKEND_INPUTS.folders.includes('regression/'));
    assert.ok(BACKEND_INPUTS.files.includes('frontend/ngsw-config.json'));
    assert.ok(BACKEND_INPUTS.files.includes('deploy/backup/revoke-restored-credentials.sql'));
  });
});

describe('Given the files a branch changed', () => {
  const areas = (files) => areasOf(files, BACKEND_INPUTS);

  it('when only docs/, .claude/ and Markdown changed, then the change is docs-only and no area is affected', () => {
    const result = areas(['docs/roadmap.md', '.claude/rules/testing.md', 'frontend/README.md']);
    assert.equal(result.docsOnly, true);
    assert.deepEqual([...result.areas], []);
  });

  it('when a file under backend/ changed, then the backend is affected', () => {
    assert.deepEqual([...areas(['backend/src/main/java/A.java']).areas], ['backend']);
  });

  it('when a file under frontend/ changed, then the frontend is affected', () => {
    assert.deepEqual([...areas(['frontend/src/app/app.ts']).areas], ['frontend']);
  });

  it('when a frontend file the backend tests read changed, then the frontend and the backend are affected', () => {
    assert.deepEqual([...areas(['frontend/ngsw-config.json']).areas].sort(), [
      'backend',
      'frontend',
    ]);
  });

  it('when a file under mcp/ changed, then the connector is affected', () => {
    assert.deepEqual([...areas(['mcp/src/server.ts']).areas], ['mcp']);
  });

  it('when a file under scripts/ changed, then the scripts are affected', () => {
    assert.deepEqual([...areas(['scripts/compare-v2.mjs']).areas], ['scripts']);
  });

  it('when a shared case changed, then the backend and the frontend are affected, both of which run it', () => {
    assert.deepEqual([...areas(['shared-cases/qr/payment.json']).areas].sort(), [
      'backend',
      'frontend',
    ]);
  });

  it('when a file under regression/ or test-cases/ changed, then the backend is affected, whose tests read them', () => {
    assert.deepEqual([...areas(['regression/v2/changes/pr-500.json']).areas], ['backend']);
    assert.deepEqual([...areas(['test-cases/backup-key-words.json']).areas], ['backend']);
  });

  it('when a file outside every area changed, then it is listed as checked only by CI', () => {
    const result = areas(['deploy/compose.yml', '.github/workflows/pr-check.yml', 'docs/a.md']);
    assert.deepEqual([...result.areas], []);
    assert.equal(result.docsOnly, false);
    assert.deepEqual(result.ciOnly, ['deploy/compose.yml', '.github/workflows/pr-check.yml']);
  });

  it('when a Markdown file sits under backend/, then it counts as docs, as CI counts it', () => {
    assert.deepEqual([...areas(['backend/HELP.md']).areas], []);
  });
});

describe('Given the output of git', () => {
  it('when name-status and untracked lists are parsed, then every path is kept with its status and untracked files count as added', () => {
    const nameStatus = 'M\0backend/a.java\0D\0frontend/old.ts\0';
    const untracked = 'mcp/new.ts\0';
    assert.deepEqual(parseChangedFiles(nameStatus, untracked), [
      { status: 'M', path: 'backend/a.java' },
      { status: 'D', path: 'frontend/old.ts' },
      { status: 'A', path: 'mcp/new.ts' },
    ]);
  });
});

describe('Given the affected areas', () => {
  it('when the backend is affected, then the full suite runs recording under the suite lock, then the v2 comparison of the changed files', () => {
    assert.deepEqual(commandLines(new Set(['backend'])), [
      `backend: API_TRANSCRIPTS=record flock ${BACKEND_SUITE_LOCK} ./gradlew test`,
      '.: node scripts/compare-v2.mjs --changed=/tmp/changed.txt',
    ]);
  });

  it('when flock is missing, then the backend suite runs without the lock', () => {
    assert.equal(
      commandLines(new Set(['backend']), { ...OPTIONS, flock: false })[0],
      'backend: API_TRANSCRIPTS=record ./gradlew test',
    );
  });

  it('when the frontend is affected, then its whole chain runs in order, e2e and the web app tests included', () => {
    assert.deepEqual(commandLines(new Set(['frontend'])), [
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
    assert.deepEqual(commandLines(new Set(['mcp'])), ['mcp: npm run check', 'mcp: npm run build']);
  });

  it('when the scripts are affected, then their tests run', () => {
    assert.deepEqual(commandLines(new Set(['scripts'])), ['.: node --test scripts/*.test.mjs']);
  });

  it('when every area is affected, then the quick ones come first and the v2 comparison last', () => {
    const areas = commandsFor(new Set(['backend', 'frontend', 'mcp', 'scripts']), OPTIONS).map(
      ({ area }) => area,
    );
    assert.deepEqual(
      [...new Set(areas)],
      ['scripts', 'mcp', 'frontend', 'backend', 'v2 comparison'],
    );
  });

  it('when no area is affected, then no command runs', () => {
    assert.deepEqual(commandsFor(new Set(), OPTIONS), []);
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
    assert.ok(chain('backend').endsWith('./gradlew test'));
  });

  it('when the section is read, then it points to this script', () => {
    assert.ok(doneMeans.includes('node scripts/check-changed.mjs --run'));
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
