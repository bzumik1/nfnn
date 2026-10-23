import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogFileNotFound, LogReader, LogsUnavailable, MAX_TAIL_BYTES } from '../src/logs.js';

describe('Given the log folder with the backend and backup logs and a rotated copy', () => {
  let dir: string;
  let reader: LogReader;

  beforeEach(async () => {
    dir = await mkdtemp(`${tmpdir()}/nfnn-logs-`);
    await writeFile(
      `${dir}/backend.log`,
      'first line\nsecond line\nBackend revision abc1234 is ready\n',
    );
    await writeFile(`${dir}/backup.log`, 'backup written\n');
    await writeFile(`${dir}/backend.log.2026-10-22.0.gz`, gzipSync('old line one\nold line two\n'));
    await writeFile(`${dir}/.hidden`, 'nothing');
    reader = new LogReader(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('when the files are listed, then every log file comes by name with its size, hidden files left out', async () => {
    const files = await reader.list();
    expect(files.map((file) => file.name)).toEqual([
      'backend.log',
      'backend.log.2026-10-22.0.gz',
      'backup.log',
    ]);
    expect(files[2]?.sizeBytes).toBe('backup written\n'.length);
    expect(files[0]?.changedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('when the end of a log is asked, then only the last bytes come', async () => {
    const tail = await reader.tail('backend.log', 20);
    expect(tail.text).toBe('Backend revision abc1234 is ready\n'.slice(-20));
    expect(tail.tailBytes).toBe(20);
    expect(tail.sizeBytes).toBeGreaterThan(20);
    expect((await reader.tail('backend.log', MAX_TAIL_BYTES * 10)).text).toContain('first line');
  });

  it('when a rotated copy is asked, then it is unpacked and its end comes', async () => {
    const tail = await reader.tail('backend.log.2026-10-22.0.gz', 13);
    expect(tail.text).toBe('old line two\n');
  });

  it('when an unknown or unsafe name is asked, then the reader refuses it', async () => {
    await expect(reader.tail('nothing.log')).rejects.toBeInstanceOf(LogFileNotFound);
    await expect(reader.tail('../etc/passwd')).rejects.toBeInstanceOf(LogFileNotFound);
    await expect(reader.tail('.hidden')).rejects.toBeInstanceOf(LogFileNotFound);
  });

  it('when the folder is missing, then listing says the logs are unavailable', async () => {
    await expect(new LogReader(`${dir}/missing`).list()).rejects.toBeInstanceOf(LogsUnavailable);
  });
});
