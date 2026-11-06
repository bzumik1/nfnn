import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'backend-log.sh');
const READY = (revision) =>
  `2026-11-05T23:59:58.000+01:00  INFO 1 --- [main] c.n.a.s.i.BuildRevision : Backend revision ${revision} is ready\n`;

describe('Given the logs folder of a running stack', () => {
  let logs;

  beforeEach(() => {
    logs = mkdtempSync(join(tmpdir(), 'backend-log-'));
  });

  afterEach(() => rmSync(logs, { recursive: true, force: true }));

  const rotated = (name, text) => writeFileSync(join(logs, name), gzipSync(text));
  const read = () => spawnSync('bash', [SCRIPT, logs], { encoding: 'utf8' });

  test('when the backend never rotated its log, then the whole log is backend.log', () => {
    writeFileSync(join(logs, 'backend.log'), 'first\nsecond\n');

    const result = read();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'first\nsecond\n');
  });

  test('when Logback rotated the log at midnight and by size, then the rotated files come first, oldest first, and the current file last', () => {
    rotated('backend.log.2026-11-05.10.gz', 'day 1, part 10\n');
    rotated('backend.log.2026-11-05.2.gz', 'day 1, part 2\n');
    rotated('backend.log.2026-11-06.0.gz', 'day 2, part 0\n');
    rotated('backend.log.2026-11-05.0.gz', 'day 1, part 0\n');
    writeFileSync(join(logs, 'backend.log'), 'today\n');

    const result = read();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      'day 1, part 0\nday 1, part 2\nday 1, part 10\nday 2, part 0\ntoday\n',
    );
  });

  test('when a start was logged before midnight and two after, then all three ready lines are in the log', () => {
    rotated('backend.log.2026-11-05.0.gz', READY('d953749'));
    writeFileSync(join(logs, 'backend.log'), READY('dev') + READY('d953749') + READY('d953749'));

    const ready = read()
      .stdout.split('\n')
      .filter((line) => line.includes('Backend revision d953749 is ready'));

    assert.equal(ready.length, 3);
  });

  test("when the folder also holds the other services' logs, then only the backend's are read", () => {
    writeFileSync(join(logs, 'backend.log'), 'backend\n');
    writeFileSync(join(logs, 'backup.log'), 'backup\n');
    rotated('nginx-access.log.2026-11-05.gz', 'nginx\n');
    rotated('mcp.log.2026-11-05.gz', 'mcp\n');

    assert.equal(read().stdout, 'backend\n');
  });

  test('when the backend wrote no log yet, then it fails and says so', () => {
    const result = read();

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no backend\.log/);
  });
});
