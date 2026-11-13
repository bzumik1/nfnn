import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { brokenLinks, githubSlug } from './readme-links.mjs';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const REPOSITORY = dirname(SCRIPTS);
const SCRIPT = join(SCRIPTS, 'readme-links.mjs');

let root;

function write(path, text = '') {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function targetsOf(problems) {
  return problems.map((problem) => problem.target);
}

describe('Given a repository with a README', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nfnn-readme-links-'));
    write('docs/guide.md', '# Guide\n\n## CI in detail\n\n## Zálohy\n');
    write('docs/images/shot.webp');
    write('backend/build.gradle.kts');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('when every link leads to a file, a folder or a heading that exists, then nothing is reported', () => {
    write(
      'README.md',
      [
        '# Project',
        '',
        'See [the guide](docs/guide.md), [CI](docs/guide.md#ci-in-detail), [backups](docs/guide.md#zálohy),',
        '[the backend](backend), [the backend folder](backend/) and [getting started](#getting-started).',
        '',
        '<img src="docs/images/shot.webp" alt="" />',
        '<source media="(prefers-color-scheme: dark)" srcset="docs/images/shot.webp 2x" />',
        '',
        '## Getting started',
      ].join('\n'),
    );

    assert.deepEqual(brokenLinks(root, 'README.md'), []);
  });

  test('when a Markdown link or image names a missing file, then it is reported with its line', () => {
    write('README.md', '# Project\n\n[Gone](docs/gone.md)\n\n![Shot](docs/images/gone.webp)\n');

    assert.deepEqual(brokenLinks(root, 'README.md'), [
      { line: 3, target: 'docs/gone.md', reason: 'no such file or folder' },
      {
        line: 5,
        target: 'docs/images/gone.webp',
        reason: 'no such file or folder',
      },
    ]);
  });

  test('when an HTML src, srcset or href names a missing file, then it is reported', () => {
    write(
      'README.md',
      [
        '<img src="docs/images/gone.webp" />',
        '<source srcset="docs/images/dark.webp" />',
        '<a href="deploy/README.md">Deploy</a>',
      ].join('\n'),
    );

    assert.deepEqual(targetsOf(brokenLinks(root, 'README.md')), [
      'docs/images/gone.webp',
      'docs/images/dark.webp',
      'deploy/README.md',
    ]);
  });

  test('when a link names a file in another letter case, then it is reported as GitHub would not find it', () => {
    write('README.md', '[Guide](docs/Guide.md)\n');

    assert.deepEqual(targetsOf(brokenLinks(root, 'README.md')), ['docs/Guide.md']);
  });

  test('when an anchor names no heading of its own file or of another Markdown file, then it is reported', () => {
    write('README.md', '# Project\n\n[Here](#nowhere) and [there](docs/guide.md#nowhere)\n');

    assert.deepEqual(brokenLinks(root, 'README.md'), [
      { line: 3, target: '#nowhere', reason: 'no such heading' },
      { line: 3, target: 'docs/guide.md#nowhere', reason: 'no such heading' },
    ]);
  });

  test('when links point outside the repository or sit in code, then they are left alone', () => {
    write(
      'README.md',
      [
        '[Site](https://nfnn.cz) [Mail](mailto:info@nfnn.cz) <http://localhost:8080>',
        '`[not a link](docs/gone.md)`',
        '```bash',
        'cat [x](docs/gone.md)',
        '```',
      ].join('\n'),
    );

    assert.deepEqual(brokenLinks(root, 'README.md'), []);
  });

  test('when a script is run on a README with a broken link, then it exits 1 and names the link', () => {
    write('README.md', '[Gone](docs/gone.md)\n');

    const result = spawnSync('node', [SCRIPT, `--root=${root}`], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /README\.md:1: docs\/gone\.md: no such file or folder/);
  });
});

describe('Given headings as GitHub writes their anchors', () => {
  test('when a heading holds code, links, punctuation or Czech letters, then its anchor matches GitHub', () => {
    assert.equal(githubSlug('Getting started'), 'getting-started');
    assert.equal(githubSlug('Tests and CI'), 'tests-and-ci');
    assert.equal(
      githubSlug('MCP connector (`mcp/`, container `nfnn-mcp`)'),
      'mcp-connector-mcp-container-nfnn-mcp',
    );
    assert.equal(githubSlug('Nginx Proxy Manager'), 'nginx-proxy-manager');
    assert.equal(
      githubSlug('Cloudflare: web při výpadku serveru'),
      'cloudflare-web-při-výpadku-serveru',
    );
    assert.equal(githubSlug('[Linked](docs/x.md) heading'), 'linked-heading');
  });
});

describe("Given the repository's own README", () => {
  test('when its links are checked, then every one leads somewhere', () => {
    assert.deepEqual(brokenLinks(REPOSITORY, 'README.md'), []);
  });
});
