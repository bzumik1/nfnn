import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';

const SCRIPT = fileURLToPath(new URL('test-inventory.mjs', import.meta.url));
const roots = [];

function reports() {
  const root = mkdtempSync(join(tmpdir(), 'test-inventory-'));
  roots.push(root);
  mkdirSync(join(root, 'junit'));
  writeFileSync(
    join(root, 'junit', 'TEST-a.xml'),
    [
      '<testsuite name="a" tests="2">',
      '<testcase name="Given a, when b, then c" classname="cz.novanadeje.app.donors.DonorTest"/>',
      '<testcase name="Donors - A donor signs in" classname="feature_classpath_features/donors/login.feature"/>',
      '<system-out><![CDATA[INFO Sign-in of donor jana@example.cz]]></system-out>',
      '</testsuite>',
    ].join('\n'),
  );
  const vitest = (name) =>
    JSON.stringify({
      testResults: [
        {
          name: join(root, name, 'x.spec.ts'),
          assertionResults: [{ ancestorTitles: ['Given x'], title: 'when y, then z' }],
        },
      ],
    });
  writeFileSync(join(root, 'frontend-vitest.json'), vitest('frontend'));
  writeFileSync(join(root, 'mcp-vitest.json'), vitest('mcp'));
  writeFileSync(
    join(root, 'playwright.json'),
    JSON.stringify({
      suites: [{ title: 'a.spec.ts', specs: [{ file: 'a.spec.ts', title: 'when y, then z' }] }],
    }),
  );
  return root;
}

function inventory(root, args) {
  const run = spawnSync(
    process.execPath,
    [
      SCRIPT,
      `--frontendVitest=${join(root, 'frontend-vitest.json')}`,
      `--playwright=${join(root, 'playwright.json')}`,
      `--mcpVitest=${join(root, 'mcp-vitest.json')}`,
      ...args,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop(), { recursive: true, force: true });
  }
});

describe('Given the backend JUnit reports', () => {
  it('when only the backend part is collected, then it holds the backend suites and no log text', () => {
    const root = reports();
    inventory(root, [
      `--junit=${join(root, 'junit')}`,
      '--part=backend',
      `--out=${join(root, 'backend.json')}`,
    ]);
    const written = readFileSync(join(root, 'backend.json'), 'utf8');
    assert.deepEqual(Object.keys(JSON.parse(written).suites), [
      'backend-junit',
      'backend-cucumber',
    ]);
    assert.doesNotMatch(written, /jana@example\.cz/);
  });

  it('when the unit tests and the scenarios sit in report folders of their own, then the backend part lists both', () => {
    const root = reports();
    mkdirSync(join(root, 'unit'));
    mkdirSync(join(root, 'acceptance'));
    const [unit, scenario] = readFileSync(join(root, 'junit', 'TEST-a.xml'), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('<testcase'));
    writeFileSync(join(root, 'unit', 'TEST-a.xml'), `<testsuite name="a">\n${unit}\n</testsuite>`);
    writeFileSync(
      join(root, 'acceptance', 'TEST-b.xml'),
      `<testsuite name="b">\n${scenario}\n</testsuite>`,
    );
    inventory(root, [
      `--junit=${join(root, 'junit')}`,
      '--part=backend',
      `--out=${join(root, 'together.json')}`,
    ]);
    inventory(root, [
      `--junit=${join(root, 'unit')},${join(root, 'acceptance')}`,
      '--part=backend',
      `--out=${join(root, 'apart.json')}`,
    ]);
    assert.equal(
      readFileSync(join(root, 'apart.json'), 'utf8'),
      readFileSync(join(root, 'together.json'), 'utf8'),
    );
  });

  it('when the whole inventory reads that part instead of the reports, then it equals the inventory from the reports', () => {
    const root = reports();
    inventory(root, [`--junit=${join(root, 'junit')}`, `--out=${join(root, 'direct.json')}`]);
    inventory(root, [
      `--junit=${join(root, 'junit')}`,
      '--part=backend',
      `--out=${join(root, 'backend.json')}`,
    ]);
    inventory(root, [
      `--junit=${join(root, 'missing')}`,
      `--backend=${join(root, 'backend.json')}`,
      `--out=${join(root, 'merged.json')}`,
    ]);
    assert.equal(
      readFileSync(join(root, 'merged.json'), 'utf8'),
      readFileSync(join(root, 'direct.json'), 'utf8'),
    );
  });
});
