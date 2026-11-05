import { signal } from '@angular/core';
import { CopyRefused, type OpenCopy, type RecordAddress } from '../crypto/copy-keys';
import { bytesToBase64Url, randomBytes, utf8 } from '../crypto/device-bytes';
import type { DeviceStorage, StoredRecord } from './device-storage';

export const RECORD_SCHEMA_VERSION = 1;
const RECORD_ID_LENGTH = 16;
const SMALLEST_RECORD_BYTES = 1024;

export interface StoredChunk {
  readonly id: string;
  readonly rowsSha256: string;
  readonly rows: readonly unknown[];
}

export interface StoredImage {
  readonly sha256: string;
  readonly mediaType: string;
  readonly base64: string;
}

export interface CopyContents {
  readonly chunks: readonly StoredChunk[];
  readonly summary: unknown;
  readonly storedAt: string;
  readonly images?: readonly StoredImage[];
}

export type CopyLoad = 'empty' | 'loaded' | 'damaged';

interface ChunkPlaintext extends StoredChunk {
  readonly type: 'chunk';
}

interface ImagePlaintext extends StoredImage {
  readonly type: 'image';
}

interface MetaPlaintext {
  readonly type: 'meta';
  readonly summary: unknown;
  readonly storedAt: string;
}

export class AccountStore {
  private readonly current = signal<CopyContents | null>(null);
  readonly contents = this.current.asReadonly();
  private closed = false;

  constructor(
    private readonly copy: OpenCopy,
    private readonly storage: DeviceStorage,
    readonly feed: string,
  ) {}

  get copyId(): string {
    return this.copy.copyId;
  }

  async load(): Promise<CopyLoad> {
    const records = await this.storage.records(this.copy.copyId);
    if (records.length === 0) {
      this.current.set(null);
      return 'empty';
    }
    try {
      const contents = await this.contentsOf(records);
      this.show(contents);
      return contents === null ? 'damaged' : 'loaded';
    } catch (failure: unknown) {
      if (failure instanceof CopyRefused || failure instanceof SyntaxError) {
        this.current.set(null);
        return 'damaged';
      }
      throw failure;
    }
  }

  async replace(contents: CopyContents): Promise<void> {
    const plaintexts: (ChunkPlaintext | MetaPlaintext | ImagePlaintext)[] = [
      { type: 'meta', summary: contents.summary, storedAt: contents.storedAt },
      ...contents.chunks.map((chunk): ChunkPlaintext => ({
        type: 'chunk',
        id: chunk.id,
        rowsSha256: chunk.rowsSha256,
        rows: chunk.rows,
      })),
      ...(contents.images ?? []).map((image): ImagePlaintext => ({
        type: 'image',
        sha256: image.sha256,
        mediaType: image.mediaType,
        base64: image.base64,
      })),
    ];
    const records: StoredRecord[] = [];
    for (const plaintext of plaintexts) {
      const recordId = bytesToBase64Url(randomBytes(RECORD_ID_LENGTH));
      const bytes = padded(utf8(JSON.stringify(plaintext)));
      try {
        const sealed = await this.copy.sealRecord(this.addressOf(recordId), bytes);
        records.push({ copyId: this.copy.copyId, recordId, ...sealed });
      } finally {
        bytes.fill(0);
      }
    }
    await this.storage.write({ replaceRecords: { copyId: this.copy.copyId, records } });
    this.show(structuredClone(contents));
  }

  close(): void {
    this.closed = true;
    this.current.set(null);
    this.copy.close();
  }

  private show(contents: CopyContents | null): void {
    if (!this.closed) {
      this.current.set(contents);
    }
  }

  private async contentsOf(records: readonly StoredRecord[]): Promise<CopyContents | null> {
    const chunks: StoredChunk[] = [];
    const images: StoredImage[] = [];
    let meta: MetaPlaintext | null = null;
    for (const record of records) {
      const bytes = await this.copy.openRecord(this.addressOf(record.recordId), record);
      try {
        const plaintext = JSON.parse(new TextDecoder().decode(bytes)) as
          ChunkPlaintext | MetaPlaintext | ImagePlaintext;
        if (plaintext.type === 'meta') {
          meta = plaintext;
        } else if (plaintext.type === 'image') {
          images.push({
            sha256: plaintext.sha256,
            mediaType: plaintext.mediaType,
            base64: plaintext.base64,
          });
        } else {
          chunks.push({ id: plaintext.id, rowsSha256: plaintext.rowsSha256, rows: plaintext.rows });
        }
      } finally {
        bytes.fill(0);
      }
    }
    if (meta === null) {
      return null;
    }
    chunks.sort((first, second) => byText(first.id, second.id));
    images.sort((first, second) => byText(first.sha256, second.sha256));
    return {
      chunks,
      summary: meta.summary,
      storedAt: meta.storedAt,
      ...(images.length === 0 ? {} : { images }),
    };
  }

  private addressOf(recordId: string): RecordAddress {
    return { collection: this.feed, recordId, schemaVersion: RECORD_SCHEMA_VERSION };
  }
}

function byText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function padded(json: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  let size = SMALLEST_RECORD_BYTES;
  while (size < json.length) {
    size *= 2;
  }
  const bytes = new Uint8Array(size).fill(0x20);
  bytes.set(json);
  json.fill(0);
  return bytes;
}
