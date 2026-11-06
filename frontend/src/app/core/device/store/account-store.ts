import { signal } from '@angular/core';
import {
  CopyRefused,
  type DraftAddress,
  type OpenCopy,
  type RecordAddress,
} from '../crypto/copy-keys';
import { bytesToBase64Url, randomBytes, utf8 } from '../crypto/device-bytes';
import type { DeviceStorage, DraftLocation, StoredRecord } from './device-storage';

export const RECORD_SCHEMA_VERSION = 1;
export const DRAFT_SCHEMA_VERSION = 1;
const RECORD_ID_LENGTH = 16;
const SMALLEST_RECORD_BYTES = 1024;

export interface StoredChunk {
  readonly id: string;
  readonly rowsSha256: string;
  readonly rows: readonly unknown[];
}

export interface CopyContents {
  readonly chunks: readonly StoredChunk[];
  readonly summary: unknown;
  readonly storedAt: string;
}

export interface StoredDraft {
  readonly key: string;
  readonly base: string;
  readonly values: unknown;
  readonly savedAt: string;
}

interface DraftPlaintext extends StoredDraft {
  readonly type: 'draft';
}

interface OpenedDraft {
  readonly recordId: string;
  readonly draft: StoredDraft | null;
}

export type CopyLoad = 'empty' | 'loaded' | 'damaged';

interface ChunkPlaintext extends StoredChunk {
  readonly type: 'chunk';
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
    const plaintexts: (ChunkPlaintext | MetaPlaintext)[] = [
      { type: 'meta', summary: contents.summary, storedAt: contents.storedAt },
      ...contents.chunks.map((chunk): ChunkPlaintext => ({
        type: 'chunk',
        id: chunk.id,
        rowsSha256: chunk.rowsSha256,
        rows: chunk.rows,
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

  async drafts(): Promise<readonly StoredDraft[]> {
    const drafts: StoredDraft[] = [];
    for (const { draft } of await this.openedDrafts()) {
      if (draft !== null) {
        drafts.push(draft);
      }
    }
    return drafts.sort((first, second) =>
      first.key < second.key ? -1 : first.key > second.key ? 1 : 0,
    );
  }

  async keepDraft(draft: StoredDraft): Promise<void> {
    const replaced = (await this.openedDrafts()).filter(
      (opened) => opened.draft === null || opened.draft.key === draft.key,
    );
    const recordId = bytesToBase64Url(randomBytes(RECORD_ID_LENGTH));
    const plaintext: DraftPlaintext = {
      type: 'draft',
      key: draft.key,
      base: draft.base,
      values: draft.values,
      savedAt: draft.savedAt,
    };
    const bytes = padded(utf8(JSON.stringify(plaintext)));
    try {
      const sealed = await this.copy.sealDraft(this.draftAddressOf(recordId), bytes);
      await this.storage.write({
        deleteDrafts: replaced.map((opened) => this.draftLocationOf(opened.recordId)),
        putDrafts: [{ copyId: this.copy.copyId, recordId, ...sealed }],
      });
    } finally {
      bytes.fill(0);
    }
  }

  async dropDraft(key: string): Promise<void> {
    const dropped = (await this.openedDrafts()).filter(
      (opened) => opened.draft === null || opened.draft.key === key,
    );
    if (dropped.length > 0) {
      await this.storage.write({
        deleteDrafts: dropped.map((opened) => this.draftLocationOf(opened.recordId)),
      });
    }
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
    let meta: MetaPlaintext | null = null;
    for (const record of records) {
      const bytes = await this.copy.openRecord(this.addressOf(record.recordId), record);
      try {
        const plaintext = JSON.parse(new TextDecoder().decode(bytes)) as
          ChunkPlaintext | MetaPlaintext;
        if (plaintext.type === 'meta') {
          meta = plaintext;
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
    chunks.sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0));
    return { chunks, summary: meta.summary, storedAt: meta.storedAt };
  }

  private async openedDrafts(): Promise<readonly OpenedDraft[]> {
    const opened: OpenedDraft[] = [];
    for (const record of await this.storage.drafts(this.copy.copyId)) {
      opened.push({ recordId: record.recordId, draft: await this.draftOf(record) });
    }
    return opened;
  }

  private async draftOf(record: StoredRecord): Promise<StoredDraft | null> {
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = await this.copy.openDraft(this.draftAddressOf(record.recordId), record);
    } catch (failure: unknown) {
      if (failure instanceof CopyRefused && failure.reason === 'damaged') {
        return null;
      }
      throw failure;
    }
    try {
      const plaintext = JSON.parse(new TextDecoder().decode(bytes)) as Partial<DraftPlaintext>;
      return plaintext.type === 'draft' &&
        typeof plaintext.key === 'string' &&
        typeof plaintext.base === 'string' &&
        typeof plaintext.savedAt === 'string'
        ? {
            key: plaintext.key,
            base: plaintext.base,
            values: plaintext.values,
            savedAt: plaintext.savedAt,
          }
        : null;
    } catch {
      return null;
    } finally {
      bytes.fill(0);
    }
  }

  private draftAddressOf(recordId: string): DraftAddress {
    return { recordId, schemaVersion: DRAFT_SCHEMA_VERSION };
  }

  private draftLocationOf(recordId: string): DraftLocation {
    return { copyId: this.copy.copyId, recordId };
  }

  private addressOf(recordId: string): RecordAddress {
    return { collection: this.feed, recordId, schemaVersion: RECORD_SCHEMA_VERSION };
  }
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
