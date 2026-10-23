import { mkdtempSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger.js';

const NOW = new Date('2026-10-23T15:30:00.000Z');

describe('Given a log file in a folder the connector may write', () => {
  let folder: string;
  let console: string[];

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'nfnn-mcp-log-'));
    console = [];
  });

  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  it('when lines are logged, then each goes to the console and is appended to the file', () => {
    const file = join(folder, 'mcp.log');
    const logger = createLogger({ file, console: (line) => console.push(line), now: () => NOW });

    logger.info('Tool nfnn_status answered donor 019a');
    logger.warn('The token exchange answered 500 without a usable token');

    const lines = [
      '2026-10-23T15:30:00.000Z INFO Tool nfnn_status answered donor 019a',
      '2026-10-23T15:30:00.000Z WARN The token exchange answered 500 without a usable token',
    ];
    expect(console).toEqual(lines);
    expect(readFileSync(file, 'utf8')).toBe(lines.map((line) => `${line}\n`).join(''));
  });

  it('when the file is moved away between lines, then the next line starts a new file', () => {
    const file = join(folder, 'mcp.log');
    const logger = createLogger({ file, console: () => undefined, now: () => NOW });

    logger.info('before');
    renameSync(file, join(folder, 'mcp.log.2026-10-22'));
    logger.info('after');

    expect(readFileSync(join(folder, 'mcp.log.2026-10-22'), 'utf8')).toBe(
      '2026-10-23T15:30:00.000Z INFO before\n',
    );
    expect(readFileSync(file, 'utf8')).toBe('2026-10-23T15:30:00.000Z INFO after\n');
  });

  it('when a message spans lines, then it stays one line in the log', () => {
    const file = join(folder, 'mcp.log');
    const logger = createLogger({ file, console: (line) => console.push(line), now: () => NOW });

    logger.warn('first\nsecond\r\nthird');

    expect(console).toEqual(['2026-10-23T15:30:00.000Z WARN first\\nsecond\\r\\nthird']);
  });
});

describe('Given no log file or one the connector cannot write', () => {
  it('when lines are logged without a file, then they go to the console only', () => {
    const console: string[] = [];
    const logger = createLogger({ console: (line) => console.push(line), now: () => NOW });

    logger.info('listening');

    expect(console).toEqual(['2026-10-23T15:30:00.000Z INFO listening']);
  });

  it('when the folder does not exist, then the console still gets every line and nothing throws', () => {
    const console: string[] = [];
    const logger = createLogger({
      file: join(tmpdir(), 'nfnn-mcp-missing', 'nested', 'mcp.log'),
      console: (line) => console.push(line),
      now: () => NOW,
    });

    logger.info('one');
    logger.info('two');

    expect(console).toEqual([
      '2026-10-23T15:30:00.000Z INFO one',
      '2026-10-23T15:30:00.000Z INFO two',
    ]);
  });
});
