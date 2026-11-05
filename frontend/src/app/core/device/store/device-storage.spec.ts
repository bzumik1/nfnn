import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { deleteDB, openDB } from 'idb';
import { generateSessionKey } from '../crypto/copy-keys';
import type { RegistryEntry } from '../crypto/device-registry';
import { DEVICE_DATABASE, type DeviceStorage, type StoredRecord } from './device-storage';
import { IdbDeviceStorage, openIdbDeviceStorage } from './idb-device-storage';
import { MemoryDeviceStorage } from './memory-device-storage';

function entry(copyId: string, lookupTag = `tag-${copyId}`): RegistryEntry {
  return {
    copyId,
    kind: 'donor',
    lookupTag,
    userHandleTag: `handle-${copyId}`,
    wraps: [{ kind: 'session', iv: 'aXY', sealed: 'c2VhbGVk' }],
  };
}

function record(copyId: string, recordId: string): StoredRecord {
  return { copyId, recordId, iv: `iv-${recordId}`, sealed: `sealed-${recordId}` };
}

const IMPLEMENTATIONS: readonly [string, () => Promise<DeviceStorage>][] = [
  ['IndexedDB', () => openIdbDeviceStorage()],
  ['memory', async () => new MemoryDeviceStorage()],
];

describe.each(IMPLEMENTATIONS)('Given the %s device storage', (_name, open) => {
  let storage: DeviceStorage;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    storage = await open();
  });

  afterEach(async () => {
    await storage.destroy();
  });

  it('when nothing was written, then it holds no salt, entry, session key or record', async () => {
    expect(await storage.deviceSalt()).toBeNull();
    expect(await storage.entries()).toEqual([]);
    expect(await storage.sessionKey('a')).toBeNull();
    expect(await storage.records('a')).toEqual([]);
  });

  it('when a salt, entries, a session key and records are written, then they read back as written', async () => {
    const key = await generateSessionKey();

    await storage.write({
      deviceSalt: 'c2FsdA',
      putEntries: [entry('a'), entry('b')],
      putSessionKeys: [{ copyId: 'a', key }],
      replaceRecords: { copyId: 'a', records: [record('a', 'r1'), record('a', 'r2')] },
    });

    expect(await storage.deviceSalt()).toBe('c2FsdA');
    expect([...(await storage.entries())].sort((x, y) => x.copyId.localeCompare(y.copyId))).toEqual(
      [entry('a'), entry('b')],
    );
    const stored = await storage.sessionKey('a');
    expect(stored?.extractable).toBe(false);
    expect(stored?.usages).toEqual(key.usages);
    expect(await storage.records('a')).toHaveLength(2);
    expect(await storage.records('b')).toEqual([]);
  });

  it('when the records of a copy are replaced, then only the new ones remain and another copy keeps its own', async () => {
    await storage.write({
      putEntries: [entry('a'), entry('b')],
      replaceRecords: { copyId: 'a', records: [record('a', 'old')] },
    });
    await storage.write({ replaceRecords: { copyId: 'b', records: [record('b', 'other')] } });

    await storage.write({ replaceRecords: { copyId: 'a', records: [record('a', 'new')] } });

    expect((await storage.records('a')).map((stored) => stored.recordId)).toEqual(['new']);
    expect((await storage.records('b')).map((stored) => stored.recordId)).toEqual(['other']);
  });

  it('when a replacement holds a record of another copy, then nothing of the change is written', async () => {
    await storage.write({
      putEntries: [entry('a')],
      replaceRecords: { copyId: 'a', records: [record('a', 'kept')] },
    });

    await expect(
      storage.write({
        deviceSalt: 'bmV3',
        putEntries: [entry('c')],
        replaceRecords: { copyId: 'a', records: [record('b', 'foreign')] },
      }),
    ).rejects.toBeInstanceOf(RangeError);

    expect(await storage.deviceSalt()).toBeNull();
    expect((await storage.entries()).map((stored) => stored.copyId)).toEqual(['a']);
    expect((await storage.records('a')).map((stored) => stored.recordId)).toEqual(['kept']);
  });

  it('when a copy is deleted, then its entry, session key and records go and the other copy stays', async () => {
    const key = await generateSessionKey();
    await storage.write({
      putEntries: [entry('a'), entry('b')],
      putSessionKeys: [
        { copyId: 'a', key },
        { copyId: 'b', key },
      ],
      replaceRecords: { copyId: 'a', records: [record('a', 'r1')] },
    });
    await storage.write({ replaceRecords: { copyId: 'b', records: [record('b', 'r2')] } });

    await storage.write({ deleteCopies: ['a'] });

    expect((await storage.entries()).map((stored) => stored.copyId)).toEqual(['b']);
    expect(await storage.sessionKey('a')).toBeNull();
    expect(await storage.records('a')).toEqual([]);
    expect(await storage.sessionKey('b')).not.toBeNull();
    expect(await storage.records('b')).toHaveLength(1);
  });

  it('when the salt is set to null and a session key is deleted, then both are gone', async () => {
    await storage.write({
      deviceSalt: 'c2FsdA',
      putEntries: [entry('a')],
      putSessionKeys: [{ copyId: 'a', key: await generateSessionKey() }],
    });

    await storage.write({ deviceSalt: null, deleteSessionKeys: ['a'] });

    expect(await storage.deviceSalt()).toBeNull();
    expect(await storage.sessionKey('a')).toBeNull();
    expect(await storage.entries()).toHaveLength(1);
  });

  it('when an entry read back is changed, then the stored entry stays as written', async () => {
    await storage.write({ putEntries: [entry('a')] });

    const [read] = await storage.entries();
    (read.wraps as unknown[]).length = 0;

    expect((await storage.entries())[0].wraps).toHaveLength(1);
  });

  it('when it is destroyed, then everything it held is gone', async () => {
    await storage.write({
      deviceSalt: 'c2FsdA',
      putEntries: [entry('a')],
      replaceRecords: { copyId: 'a', records: [record('a', 'r1')] },
    });

    await storage.destroy();
    storage = await open();

    expect(await storage.deviceSalt()).toBeNull();
    expect(await storage.entries()).toEqual([]);
    expect(await storage.records('a')).toEqual([]);
  });
});

describe('Given the IndexedDB device storage', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('when it opens, then the database is named nfnn.device and holds the four stores', async () => {
    const storage = await openIdbDeviceStorage();
    storage.close();

    const database = await openDB(DEVICE_DATABASE);
    expect([...database.objectStoreNames].sort()).toEqual([
      'copies',
      'meta',
      'records',
      'session-keys',
    ]);
    database.close();
  });

  async function heldOpen(): Promise<{ release(): void }> {
    const holder = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open(DEVICE_DATABASE, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const deletion = globalThis.indexedDB.deleteDatabase(DEVICE_DATABASE);
    return {
      release: () => {
        holder.close();
        void deletion;
      },
    };
  }

  it('when IndexedDB does not answer the opening in time, then the opening fails with a timeout', async () => {
    const held = await heldOpen();

    await expect(openIdbDeviceStorage({ openTimeoutMs: 30 })).rejects.toMatchObject({
      name: 'TimeoutError',
    });

    held.release();
  });

  it('when the opening timed out, then the late connection is closed and the next question opens the database again', async () => {
    const held = await heldOpen();
    const storage = new IdbDeviceStorage({ openTimeoutMs: 30 });
    await expect(storage.ready()).rejects.toMatchObject({ name: 'TimeoutError' });

    held.release();

    expect(await storage.entries()).toEqual([]);
    await storage.destroy();
    expect(await globalThis.indexedDB.databases()).toEqual([]);
  });

  it('when another tab deletes the database, then this connection gives way and opens a new one on the next question', async () => {
    const storage = await openIdbDeviceStorage();
    await storage.write({ deviceSalt: 'c2FsdA' });

    await deleteDB(DEVICE_DATABASE);

    expect(await storage.deviceSalt()).toBeNull();
    await storage.destroy();
  });

  it('when a write fails part way, then the transaction is aborted and nothing of it remains', async () => {
    const storage = await openIdbDeviceStorage();
    await storage.write({ putEntries: [entry('a')] });

    await expect(
      storage.write({
        deviceSalt: 'c2FsdA',
        putEntries: [{ ...entry('b'), copyId: undefined as unknown as string }],
      }),
    ).rejects.toBeDefined();

    expect(await storage.deviceSalt()).toBeNull();
    expect((await storage.entries()).map((stored) => stored.copyId)).toEqual(['a']);
    await storage.destroy();
  });

  it('when it is destroyed, then the database is deleted', async () => {
    const storage = await openIdbDeviceStorage();
    await storage.write({ deviceSalt: 'c2FsdA' });

    await storage.destroy();

    expect(await globalThis.indexedDB.databases()).toEqual([]);
  });
});
