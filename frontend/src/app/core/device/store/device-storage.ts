import type { SealedRecord } from '../crypto/copy-keys';
import type { RegistryEntry } from '../crypto/device-registry';

export interface StoredRecord extends SealedRecord {
  readonly copyId: string;
  readonly recordId: string;
}

export interface StoredSessionKey {
  readonly copyId: string;
  readonly key: CryptoKey;
}

export interface DraftLocation {
  readonly copyId: string;
  readonly recordId: string;
}

export interface RecordsReplacement {
  readonly copyId: string;
  readonly records: readonly StoredRecord[];
}

export interface StorageChange {
  readonly deviceSalt?: string | null;
  readonly deleteCopies?: readonly string[];
  readonly putEntries?: readonly RegistryEntry[];
  readonly putSessionKeys?: readonly StoredSessionKey[];
  readonly deleteSessionKeys?: readonly string[];
  readonly replaceRecords?: RecordsReplacement;
  readonly putDrafts?: readonly StoredRecord[];
  readonly deleteDrafts?: readonly DraftLocation[];
}

export type DeviceStorageKind = 'indexed-db' | 'memory';

export interface DeviceStorage {
  readonly kind: DeviceStorageKind;
  deviceSalt(): Promise<string | null>;
  entries(): Promise<readonly RegistryEntry[]>;
  sessionKey(copyId: string): Promise<CryptoKey | null>;
  records(copyId: string): Promise<readonly StoredRecord[]>;
  drafts(copyId: string): Promise<readonly StoredRecord[]>;
  write(change: StorageChange): Promise<void>;
  destroy(): Promise<void>;
  close(): void;
}

export const DEVICE_DATABASE = 'nfnn.device';
export const DEVICE_DATABASE_VERSION = 2;
export const DEVICE_STORAGE_OPEN_TIMEOUT_MS = 5_000;
export const DEVICE_STORAGE_DELETE_TIMEOUT_MS = 5_000;
