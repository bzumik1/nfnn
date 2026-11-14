import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_SCRIPT = readFileSync(join(ROOT, 'deploy/backup/backup.sh'), 'utf8');
const BACKEND_ENTRYPOINT = readFileSync(join(ROOT, 'backend/docker-entrypoint.sh'), 'utf8');
const REQUEST_ID = '019a8f2e-7c41-7d3a-9b2e-5f1c0d4e6a7b';
const LINUX_ONLY =
  process.platform === 'linux'
    ? false
    : 'the scripts run in Linux containers and check what /proc/self/fd says';

const functionsOf = (script, ...names) =>
  names
    .map((name) => {
      const found = new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm').exec(script);
      assert.ok(found, `${name} is not defined in the script`);
      return found[0];
    })
    .join('\n');

const runShell = (program, env) =>
  spawnSync('sh', ['-c', `set -u\n${program}`], {
    encoding: 'utf8',
    timeout: 10_000,
    env: { PATH: process.env.PATH, ...env },
  });

describe(
  'Given the backup container appends its log to the logs folder the backend user owns',
  { skip: LINUX_ONLY },
  () => {
    let folder;
    let logs;
    let backups;

    beforeEach(() => {
      folder = mkdtempSync(join(tmpdir(), 'backup-log-'));
      logs = join(folder, 'logs');
      backups = join(folder, 'backups');
      mkdirSync(logs);
      mkdirSync(join(backups, 'status'), { recursive: true });
    });

    afterEach(() => rmSync(folder, { recursive: true, force: true }));

    const log = (...lines) =>
      runShell(
        `${functionsOf(BACKUP_SCRIPT, 'log', 'append_to_log_file')}\n${lines.map((line) => `log '${line}'`).join('\n')}`,
        {
          LOGS: logs,
        },
      );
    const logFile = () => join(logs, 'backup.log');

    test('when no log file exists yet, then it is created and the lines are appended in order', () => {
      const result = log('backup written', 'test restore succeeded');

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        readFileSync(logFile(), 'utf8'),
        /^\S+ backup written\n\S+ test restore succeeded\n$/,
      );
    });

    test('when the log file holds earlier lines, then a new line is appended after them', () => {
      writeFileSync(logFile(), 'earlier line\n');

      const result = log('backup written');

      assert.equal(result.status, 0, result.stderr);
      assert.match(readFileSync(logFile(), 'utf8'), /^earlier line\n\S+ backup written\n$/);
    });

    test('when the log file is a link to a backup, then the backup stays as it was and the line goes to a new log file', () => {
      const dump = join(backups, 'nfnn-2026-11-13_0300.dump.age');
      writeFileSync(dump, 'age-encryption.org/v1 encrypted bytes');
      symlinkSync(dump, logFile());

      const result = log('backup written');

      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(dump, 'utf8'), 'age-encryption.org/v1 encrypted bytes');
      assert.ok(lstatSync(logFile()).isFile());
      assert.match(readFileSync(logFile(), 'utf8'), /^\S+ backup written\n$/);
    });

    test('when the log file is a link to the missing adoption record, then no record is created', () => {
      const record = join(backups, 'status', 'adopted-key');
      symlinkSync(record, logFile());

      const result = log('restore request x refused', 'recipient=age1planted');

      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(record), false);
      assert.doesNotMatch(readFileSync(logFile(), 'utf8'), /^recipient=/m);
    });

    test('when the log file is a named pipe nobody reads, then logging does not block and the line goes to a new log file', () => {
      assert.equal(spawnSync('mkfifo', [logFile()]).status, 0);

      const result = log('backup written');

      assert.equal(result.error, undefined, 'logging blocked on the pipe');
      assert.equal(result.status, 0, result.stderr);
      assert.ok(lstatSync(logFile()).isFile());
      assert.match(readFileSync(logFile(), 'utf8'), /^\S+ backup written\n$/);
    });

    test('when the log file is a folder, then logging still succeeds on the console and changes nothing', () => {
      mkdirSync(logFile());

      const result = log('backup written');

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /backup written/);
      assert.deepEqual(readdirSync(logFile()), []);
    });
  },
);

describe(
  'Given request files in the request folder the backend user writes',
  { skip: LINUX_ONLY },
  () => {
    let folder;
    let requests;
    let status;

    beforeEach(() => {
      folder = mkdtempSync(join(tmpdir(), 'backup-requests-'));
      requests = join(folder, 'requests');
      status = join(folder, 'status');
      mkdirSync(requests);
      mkdirSync(status);
      mkdirSync(join(folder, 'restore'));
      mkdirSync(join(folder, 'logs'));
    });

    afterEach(() => rmSync(folder, { recursive: true, force: true }));

    const handled = () => join(folder, 'handled');
    const handleRequests = () =>
      runShell(
        [
          functionsOf(
            BACKUP_SCRIPT,
            'log',
            'append_to_log_file',
            'request_id_valid',
            'handle_requests',
          ),
          `take_backup() { printf 'backup %s\\n' "$2" >> "$HANDLED"; }`,
          `test_restore() { printf 'test-restore %s\\n' "$1" >> "$HANDLED"; }`,
          `restore_requested() { printf 'restore %s\\n' "\${1##*/}" >> "$HANDLED"; rm -f "$1"; }`,
          'handle_requests',
        ].join('\n'),
        {
          REQUESTS: requests,
          RESTORE: join(folder, 'restore'),
          LOGS: join(folder, 'logs'),
          HANDLED: handled(),
        },
      );
    const handledLines = () => (existsSync(handled()) ? readFileSync(handled(), 'utf8') : '');

    test('when the requests are named by request ids, then each is handled with its id', () => {
      writeFileSync(join(requests, `${REQUEST_ID}.backup`), '');
      writeFileSync(join(requests, `${REQUEST_ID}.test-restore`), '');
      writeFileSync(join(requests, `${REQUEST_ID}.restore`), 'source=backup\n');

      const result = handleRequests();

      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        handledLines(),
        `backup ${REQUEST_ID}\ntest-restore ${REQUEST_ID}\nrestore ${REQUEST_ID}.restore\n`,
      );
      assert.deepEqual(readdirSync(requests), []);
    });

    test('when a request is named in lower-case words and digits, as the PR check names its own, then it is handled with that name', () => {
      writeFileSync(join(requests, 'for-the-second-server.backup'), '');

      const result = handleRequests();

      assert.equal(result.status, 0, result.stderr);
      assert.equal(handledLines(), 'backup for-the-second-server\n');
    });

    test('when a request name carries line breaks, then it is deleted unhandled and only a fixed sentence is logged', () => {
      const planted = 'x\nrecipient=age1planted\ny.restore';
      writeFileSync(join(requests, planted), 'source=backup\nfile=missing\n');

      const result = handleRequests();

      assert.equal(result.status, 0, result.stderr);
      assert.equal(handledLines(), '');
      assert.deepEqual(readdirSync(requests), []);
      assert.doesNotMatch(result.stdout, /recipient=/);
      assert.match(result.stdout, /a request file whose name is not a request id was removed/);
    });

    test('when request names hold a space, an upper-case letter or more than 64 characters, then none is handled and all are deleted', () => {
      writeFileSync(join(requests, 'a b.backup'), '');
      writeFileSync(join(requests, 'ABC.test-restore'), '');
      writeFileSync(join(requests, `${'a'.repeat(65)}.backup`), '');

      const result = handleRequests();

      assert.equal(result.status, 0, result.stderr);
      assert.equal(handledLines(), '');
      assert.deepEqual(readdirSync(requests), []);
    });

    test('when the backend left its schedule beside the requests, then the schedule stays', () => {
      writeFileSync(join(requests, 'schedule'), 'backup_time=03:00\n');
      writeFileSync(join(requests, 'not an id.backup'), '');

      const result = handleRequests();

      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(readdirSync(requests), ['schedule']);
    });
  },
);

describe(
  'Given a restore request the backup container did not take in time (backend entrypoint, as root)',
  { skip: LINUX_ONLY },
  () => {
    let folder;
    let requests;
    let workingDirectory;

    beforeEach(() => {
      folder = mkdtempSync(join(tmpdir(), 'stale-requests-'));
      requests = join(folder, 'requests');
      workingDirectory = join(folder, 'app');
      mkdirSync(requests);
      mkdirSync(workingDirectory);
    });

    afterEach(() => rmSync(folder, { recursive: true, force: true }));

    const stale = (name) => {
      const path = join(requests, name);
      writeFileSync(path, 'source=backup\n');
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      utimesSync(path, tenMinutesAgo, tenMinutesAgo);
    };
    const dropStale = () =>
      spawnSync(
        'sh',
        [
          '-c',
          `set -u\n${functionsOf(BACKEND_ENTRYPOINT, 'drop_stale_restore_requests')}\ndrop_stale_restore_requests`,
        ],
        {
          cwd: workingDirectory,
          encoding: 'utf8',
          timeout: 10_000,
          env: { PATH: process.env.PATH, REQUESTS_DIR: requests, REQUEST_PATIENCE_MINUTES: '5' },
        },
      );

    test('when the stale request is named by an id, then it is deleted and named in the console', () => {
      stale(`${REQUEST_ID}.restore`);

      const result = dropStale();

      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(readdirSync(requests), []);
      assert.match(
        result.stdout,
        new RegExp(`did not take the restore request ${REQUEST_ID}\\.restore within 5 minutes`),
      );
    });

    test('when the stale request name splits into the schedule and a file of the working directory, then only the request is deleted', () => {
      writeFileSync(join(requests, 'schedule'), 'backup_time=03:00\n');
      writeFileSync(join(workingDirectory, 'kept.restore'), 'kept');
      stale('schedule kept.restore');

      const result = dropStale();

      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(readdirSync(requests), ['schedule']);
      assert.deepEqual(readdirSync(workingDirectory), ['kept.restore']);
    });

    test('when the stale request name is a pattern, then it matches nothing else', () => {
      writeFileSync(join(requests, 'schedule'), 'backup_time=03:00\n');
      stale('* .restore');

      const result = dropStale();

      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(readdirSync(requests), ['schedule']);
    });

    test('when a fresh request waits, then it is kept', () => {
      writeFileSync(join(requests, `${REQUEST_ID}.restore`), 'source=backup\n');

      const result = dropStale();

      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(readdirSync(requests), [`${REQUEST_ID}.restore`]);
    });
  },
);
