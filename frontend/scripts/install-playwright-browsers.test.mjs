import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'install-playwright-browsers.sh');
const RUNNER_MIRRORS = [
  'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1',
  'https://archive.ubuntu.com/ubuntu/\tpriority:2',
  'https://security.ubuntu.com/ubuntu/\tpriority:3',
  '',
].join('\n');

describe('Given a runner whose package mirror or browser download may stall', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'playwright-install-'));
    writeFileSync(join(dir, 'mirrors.txt'), RUNNER_MIRRORS);
    writeFileSync(
      join(dir, 'playwright'),
      [
        '#!/usr/bin/env bash',
        `dir='${dir}'`,
        'echo "$*" >> "$dir/calls"',
        'n=$(( $(cat "$dir/$1.count" 2>/dev/null || echo 0) + 1 ))',
        'echo "$n" > "$dir/$1.count"',
        'case "$(sed -n "${n}p" "$dir/$1.plan" 2>/dev/null)" in',
        '  hang) sleep 30 ;;',
        '  fail) exit 1 ;;',
        'esac',
        '',
      ].join('\n'),
    );
    chmodSync(join(dir, 'playwright'), 0o755);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function plan(command, outcomes) {
    writeFileSync(join(dir, `${command}.plan`), outcomes.join('\n') + '\n');
  }

  function install(...args) {
    const started = Date.now();
    const result = spawnSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      timeout: 25_000,
      env: {
        ...process.env,
        PLAYWRIGHT_INSTALL_BIN: join(dir, 'playwright'),
        PLAYWRIGHT_INSTALL_APT_CONF: join(dir, 'apt.conf'),
        PLAYWRIGHT_INSTALL_MIRRORS: join(dir, 'mirrors.txt'),
        PLAYWRIGHT_INSTALL_AS_ROOT: 'env',
        PLAYWRIGHT_INSTALL_ATTEMPTS: '3',
        PLAYWRIGHT_INSTALL_SECONDS: '1',
      },
    });
    return { ...result, seconds: (Date.now() - started) / 1000 };
  }

  const calls = () => readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n');
  const mirrors = () => readFileSync(join(dir, 'mirrors.txt'), 'utf8');

  it('when everything answers, then the system libraries and then the browsers are installed once, with the flags only for the browsers', () => {
    const result = install('--only-shell', 'chromium', 'webkit');

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(calls(), [
      'install-deps chromium webkit',
      'install --only-shell chromium webkit',
    ]);
    assert.equal(mirrors(), RUNNER_MIRRORS);
  });

  it('when it runs, then apt gives up on a silent mirror after 20 s and retries', () => {
    install('chromium');

    const conf = readFileSync(join(dir, 'apt.conf'), 'utf8');
    assert.match(conf, /^Acquire::Retries "5";$/m);
    assert.match(conf, /^Acquire::http::Timeout "20";$/m);
    assert.match(conf, /^Acquire::https::Timeout "20";$/m);
  });

  it('when the system libraries hang on the first attempt, then that attempt is cut off and the next one runs without the Azure mirror', () => {
    plan('install-deps', ['hang']);

    const result = install('--only-shell', 'chromium');

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(result.seconds < 20, `took ${result.seconds} s`);
    assert.deepEqual(calls(), [
      'install-deps chromium',
      'install-deps chromium',
      'install --only-shell chromium',
    ]);
    assert.doesNotMatch(mirrors(), /azure/);
    assert.match(mirrors(), /^https:\/\/archive\.ubuntu\.com\/ubuntu\/\tpriority:2$/m);
    assert.match(
      result.stdout,
      /::warning::System libraries for chromium: attempt 1 of 3 failed or ran out of time/,
    );
  });

  it('when the Azure mirror is the only one listed, then it is kept', () => {
    writeFileSync(
      join(dir, 'mirrors.txt'),
      'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n',
    );
    plan('install-deps', ['fail']);

    const result = install('chromium');

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(mirrors(), 'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n');
  });

  it('when the browser download hangs and then fails, then the third attempt installs it', () => {
    plan('install', ['hang', 'fail']);

    const result = install('--no-shell', 'chromium');

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(calls(), [
      'install-deps chromium',
      'install --no-shell chromium',
      'install --no-shell chromium',
      'install --no-shell chromium',
    ]);
    assert.equal(mirrors(), RUNNER_MIRRORS);
  });

  it('when every attempt at the system libraries fails, then it stops with an error and never downloads the browsers', () => {
    plan('install-deps', ['fail', 'hang', 'fail']);

    const result = install('webkit');

    assert.notEqual(result.status, 0);
    assert.deepEqual(calls(), [
      'install-deps webkit',
      'install-deps webkit',
      'install-deps webkit',
    ]);
    assert.match(result.stdout, /::error::System libraries for webkit: every attempt failed/);
  });

  it('when every browser download fails, then it stops with an error', () => {
    plan('install', ['fail', 'fail', 'fail']);

    const result = install('chromium');

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /::error::Playwright's chromium: every attempt failed/);
  });

  it('when it is asked for --with-deps or for no browser, then it refuses before installing anything', () => {
    for (const args of [['--with-deps', 'chromium'], ['--only-shell']]) {
      const result = install(...args);

      assert.equal(result.status, 2, args.join(' '));
      assert.equal(existsSync(join(dir, 'calls')), false, args.join(' '));
    }
  });
});
