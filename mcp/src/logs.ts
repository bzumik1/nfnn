import { open, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';

export const DEFAULT_TAIL_BYTES = 20_000;
export const MAX_TAIL_BYTES = 200_000;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface LogFile {
  readonly name: string;
  readonly sizeBytes: number;
  readonly changedAt: string;
}

export interface LogTail {
  readonly name: string;
  readonly sizeBytes: number;
  readonly tailBytes: number;
  readonly text: string;
}

export class LogsUnavailable extends Error {}
export class LogFileNotFound extends Error {}

export class LogReader {
  constructor(private readonly dir: string) {}

  async list(): Promise<LogFile[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      throw new LogsUnavailable(`the log folder ${this.dir} is not readable`);
    }
    const files: LogFile[] = [];
    for (const name of names.filter((name) => SAFE_NAME.test(name)).sort()) {
      const info = await stat(`${this.dir}/${name}`).catch(() => undefined);
      if (info?.isFile()) {
        files.push({ name, sizeBytes: info.size, changedAt: info.mtime.toISOString() });
      }
    }
    return files;
  }

  async tail(name: string, bytes: number = DEFAULT_TAIL_BYTES): Promise<LogTail> {
    const wanted = Math.min(Math.max(Math.floor(bytes), 1), MAX_TAIL_BYTES);
    const file = (await this.list()).find((candidate) => candidate.name === name);
    if (!file) {
      throw new LogFileNotFound(`no log file is named ${name}`);
    }
    const path = `${this.dir}/${name}`;
    const buffer = name.endsWith('.gz')
      ? await tailOfGzip(path, wanted)
      : await tailOfPlain(path, file.sizeBytes, wanted);
    return {
      name,
      sizeBytes: file.sizeBytes,
      tailBytes: buffer.length,
      text: buffer.toString('utf8'),
    };
  }
}

async function tailOfPlain(path: string, size: number, wanted: number): Promise<Buffer> {
  const length = Math.min(size, wanted);
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, size - length);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function tailOfGzip(path: string, wanted: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let kept = 0;
  const stream = createReadStream(path).pipe(createGunzip());
  for await (const chunk of stream) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(piece);
    kept += piece.length;
    while (kept - (chunks[0]?.length ?? 0) >= wanted && chunks.length > 1) {
      kept -= chunks.shift()?.length ?? 0;
    }
  }
  const joined = Buffer.concat(chunks);
  return joined.subarray(Math.max(0, joined.length - wanted));
}
