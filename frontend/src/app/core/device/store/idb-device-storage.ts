import { type DBSchema, deleteDB, type IDBPDatabase, type IDBPObjectStore, openDB } from 'idb';
import type { RegistryEntry } from '../crypto/device-registry';
import {
  DEVICE_DATABASE,
  DEVICE_DATABASE_VERSION,
  DEVICE_STORAGE_DELETE_TIMEOUT_MS,
  DEVICE_STORAGE_OPEN_TIMEOUT_MS,
  type DeviceStorage,
  type StorageChange,
  type StoredRecord,
  type StoredSessionKey,
} from './device-storage';

const DEVICE_SALT = 'device-salt';

interface DeviceSchema extends DBSchema {
  meta: { key: string; value: string };
  copies: { key: string; value: RegistryEntry };
  'session-keys': { key: string; value: StoredSessionKey };
  records: { key: [string, string]; value: StoredRecord; indexes: { copyId: string } };
  drafts: { key: [string, string]; value: StoredRecord; indexes: { copyId: string } };
}

type DeviceDatabase = IDBPDatabase<DeviceSchema>;
type StoreNames = ('meta' | 'copies' | 'session-keys' | 'records' | 'drafts')[];
type RecordStore<Name extends 'records' | 'drafts'> = IDBPObjectStore<
  DeviceSchema,
  StoreNames,
  Name,
  'readwrite'
>;

export interface IdbDeviceStorageOptions {
  readonly openTimeoutMs?: number;
  readonly deleteTimeoutMs?: number;
}

export async function openIdbDeviceStorage(
  options: IdbDeviceStorageOptions = {},
): Promise<IdbDeviceStorage> {
  const storage = new IdbDeviceStorage(options);
  await storage.ready();
  return storage;
}

export async function idbDeviceStoragePresent(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') {
    return false;
  }
  if (typeof indexedDB.databases !== 'function') {
    return true;
  }
  try {
    return (await indexedDB.databases()).some((database) => database.name === DEVICE_DATABASE);
  } catch {
    return true;
  }
}

export class IdbDeviceStorage implements DeviceStorage {
  readonly kind = 'indexed-db';
  private database: Promise<DeviceDatabase> | null = null;
  private readonly openTimeoutMs: number;
  private readonly deleteTimeoutMs: number;

  constructor(options: IdbDeviceStorageOptions) {
    this.openTimeoutMs = options.openTimeoutMs ?? DEVICE_STORAGE_OPEN_TIMEOUT_MS;
    this.deleteTimeoutMs = options.deleteTimeoutMs ?? DEVICE_STORAGE_DELETE_TIMEOUT_MS;
  }

  async ready(): Promise<void> {
    await this.opened();
  }

  async deviceSalt(): Promise<string | null> {
    return (await (await this.opened()).get('meta', DEVICE_SALT)) ?? null;
  }

  async entries(): Promise<readonly RegistryEntry[]> {
    return (await this.opened()).getAll('copies');
  }

  async sessionKey(copyId: string): Promise<CryptoKey | null> {
    return (await (await this.opened()).get('session-keys', copyId))?.key ?? null;
  }

  async records(copyId: string): Promise<readonly StoredRecord[]> {
    return (await this.opened()).getAllFromIndex('records', 'copyId', copyId);
  }

  async drafts(copyId: string): Promise<readonly StoredRecord[]> {
    return (await this.opened()).getAllFromIndex('drafts', 'copyId', copyId);
  }

  async write(change: StorageChange): Promise<void> {
    const database = await this.opened();
    const transaction = database.transaction(
      ['meta', 'copies', 'session-keys', 'records', 'drafts'],
      'readwrite',
    );
    const done = transaction.done;
    const writes: Promise<unknown>[] = [];
    try {
      const meta = transaction.objectStore('meta');
      const copies = transaction.objectStore('copies');
      const sessionKeys = transaction.objectStore('session-keys');
      const records = transaction.objectStore('records');
      const drafts = transaction.objectStore('drafts');
      if (change.deviceSalt === null) {
        writes.push(meta.delete(DEVICE_SALT));
      } else if (change.deviceSalt !== undefined) {
        writes.push(meta.put(change.deviceSalt, DEVICE_SALT));
      }
      for (const copyId of change.deleteCopies ?? []) {
        writes.push(copies.delete(copyId), sessionKeys.delete(copyId));
        writes.push(deleteRecordsOf(records, copyId), deleteRecordsOf(drafts, copyId));
      }
      for (const entry of change.putEntries ?? []) {
        writes.push(copies.put(entry));
      }
      for (const copyId of change.deleteSessionKeys ?? []) {
        writes.push(sessionKeys.delete(copyId));
      }
      for (const sessionKey of change.putSessionKeys ?? []) {
        writes.push(sessionKeys.put(sessionKey));
      }
      const replacement = change.replaceRecords;
      if (replacement !== undefined) {
        await deleteRecordsOf(records, replacement.copyId);
        for (const record of replacement.records) {
          if (record.copyId !== replacement.copyId) {
            throw new RangeError('A replacement holds records of its own copy only');
          }
          writes.push(records.put(record));
        }
      }
      for (const { copyId, recordId } of change.deleteDrafts ?? []) {
        writes.push(drafts.delete([copyId, recordId]));
      }
      const deleted = new Set(change.deleteCopies ?? []);
      const added = new Set((change.putEntries ?? []).map((entry) => entry.copyId));
      for (const draft of change.putDrafts ?? []) {
        if (
          deleted.has(draft.copyId) ||
          (!added.has(draft.copyId) && !(await copies.get(draft.copyId)))
        ) {
          throw new RangeError('A draft belongs to a copy the registry holds');
        }
        writes.push(drafts.put(draft));
      }
      await Promise.all(writes);
    } catch (failure: unknown) {
      abortQuietly(transaction);
      await Promise.allSettled([...writes, done]);
      throw failure;
    }
    await done;
  }

  async destroy(): Promise<void> {
    this.close();
    await withTimeout(deleteDB(DEVICE_DATABASE), this.deleteTimeoutMs);
  }

  close(): void {
    const database = this.database;
    this.database = null;
    void database?.then((opened) => opened.close()).catch(() => undefined);
  }

  private opened(): Promise<DeviceDatabase> {
    if (this.database === null) {
      const raw = openDB<DeviceSchema>(DEVICE_DATABASE, DEVICE_DATABASE_VERSION, {
        upgrade: (database, oldVersion) => {
          if (oldVersion < 1) {
            database.createObjectStore('meta');
            database.createObjectStore('copies', { keyPath: 'copyId' });
            database.createObjectStore('session-keys', { keyPath: 'copyId' });
            database
              .createObjectStore('records', { keyPath: ['copyId', 'recordId'] })
              .createIndex('copyId', 'copyId');
          }
          if (oldVersion < 2) {
            database
              .createObjectStore('drafts', { keyPath: ['copyId', 'recordId'] })
              .createIndex('copyId', 'copyId');
          }
        },
        blocking: () => this.close(),
        terminated: () => {
          this.database = null;
        },
      });
      const opening = withTimeout(raw, this.openTimeoutMs);
      this.database = opening;
      opening.catch(() => {
        if (this.database === opening) {
          this.database = null;
        }
        raw.then(
          (late) => late.close(),
          () => undefined,
        );
      });
    }
    return this.database;
  }
}

async function deleteRecordsOf(
  records: RecordStore<'records'> | RecordStore<'drafts'>,
  copyId: string,
): Promise<void> {
  const index = (records as RecordStore<'records'>).index('copyId');
  const keys = await index.getAllKeys(copyId);
  await Promise.all(keys.map((key) => (records as RecordStore<'records'>).delete(key)));
}

function abortQuietly(transaction: { abort(): void }): void {
  try {
    transaction.abort();
  } catch {
    return;
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new DOMException('The device storage did not answer in time', 'TimeoutError')),
      timeoutMs,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (failure: unknown) => {
        clearTimeout(timer);
        reject(failure);
      },
    );
  });
}
