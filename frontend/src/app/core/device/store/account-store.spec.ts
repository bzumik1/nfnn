import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { generateSessionKey, OpenCopy, openWithSessionKey } from '../crypto/copy-keys';
import { base64UrlToBytes, bytesToBase64Url } from '../crypto/device-bytes';
import { AccountStore, type CopyContents } from './account-store';
import type { DeviceStorage } from './device-storage';
import { openIdbDeviceStorage } from './idb-device-storage';
import { leaks, rawIndexedDbDump } from './testing/raw-scan';

const CANARY_NAME = 'Kanárek Zlatohlávek';
const CANARY_IBAN = 'CZ4955000000001041000071';
const CHUNK_ID = 'donations:2026';

function contents(): CopyContents {
  return {
    chunks: [
      {
        id: CHUNK_ID,
        rowsSha256: 'a'.repeat(64),
        rows: [{ payerName: CANARY_NAME, counterpartyIban: CANARY_IBAN, amountMinor: 50_000 }],
      },
      { id: 'bank-accounts', rowsSha256: 'b'.repeat(64), rows: [] },
    ],
    summary: { totalMinor: 50_000, donor: CANARY_NAME },
    storedAt: '2026-11-05T10:00:00Z',
  };
}

describe('Given an account store over IndexedDB', () => {
  let storage: DeviceStorage;
  let copy: OpenCopy;
  let store: AccountStore;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    storage = await openIdbDeviceStorage();
    copy = await OpenCopy.create();
    store = new AccountStore(copy, storage, 'donor');
  });

  afterEach(async () => {
    store.close();
    await storage.destroy();
  });

  it('when nothing was stored, then loading finds it empty', async () => {
    expect(await store.load()).toBe('empty');
    expect(store.contents()).toBeNull();
  });

  it('when contents are stored, then a new store of the same copy loads them back with the chunks in order', async () => {
    await store.replace(contents());

    const reopened = new AccountStore(await sameCopy(copy), storage, 'donor');

    expect(await reopened.load()).toBe('loaded');
    expect(reopened.contents()).toEqual({
      ...contents(),
      chunks: [...contents().chunks].sort((first, second) => first.id.localeCompare(second.id)),
    });
  });

  it('when contents are stored, then they are shown at once and a later change to the given object does not reach them', async () => {
    const given = contents();

    await store.replace(given);
    (given.chunks as unknown[]).length = 0;

    expect(store.contents()?.chunks).toHaveLength(2);
  });

  it('when contents are stored, then the raw database holds neither the name, the IBAN nor a chunk id, plain or in base64', async () => {
    await store.replace(contents());

    const dump = await rawIndexedDbDump();

    expect(leaks(dump, CANARY_NAME)).toBe(false);
    expect(leaks(dump, CANARY_IBAN)).toBe(false);
    expect(leaks(dump, CHUNK_ID)).toBe(false);
    expect(leaks(dump, 'payerName')).toBe(false);
    expect((await storage.records(copy.copyId)).length).toBe(3);
  });

  it('when the raw scan is planted with the name in base64url, then it finds it', async () => {
    const planted = bytesToBase64Url(new TextEncoder().encode(`x${CANARY_NAME}y`));
    await storage.write({
      replaceRecords: {
        copyId: copy.copyId,
        records: [{ copyId: copy.copyId, recordId: 'planted', iv: 'aXY', sealed: planted }],
      },
    });

    expect(leaks(await rawIndexedDbDump(), CANARY_NAME)).toBe(true);
  });

  it('when contents are stored again, then only the new records remain', async () => {
    await store.replace(contents());
    const first = (await storage.records(copy.copyId)).map((record) => record.recordId);

    await store.replace({ ...contents(), chunks: [] });

    const second = (await storage.records(copy.copyId)).map((record) => record.recordId);
    expect(second).toHaveLength(1);
    expect(first).not.toContain(second[0]);
  });

  it('when the records are opened under another copy key, then loading reports the copy damaged', async () => {
    await store.replace(contents());
    const stranger = new AccountStore(
      await OpenCopy.withRoot(copy, new Uint8Array(32).fill(9)),
      storage,
      'donor',
    );

    expect(await stranger.load()).toBe('damaged');
    expect(stranger.contents()).toBeNull();
  });

  it('when one byte of a stored record is flipped, then loading reports the copy damaged', async () => {
    await store.replace(contents());
    const records = await storage.records(copy.copyId);
    const bytes = base64UrlToBytes(records[0].sealed);
    bytes[0] ^= 0x01;
    await storage.write({
      replaceRecords: {
        copyId: copy.copyId,
        records: [{ ...records[0], sealed: bytesToBase64Url(bytes) }, ...records.slice(1)],
      },
    });

    expect(await store.load()).toBe('damaged');
  });

  it('when a record of one feed is read as another feed, then loading reports the copy damaged', async () => {
    await store.replace(contents());
    const otherFeed = new AccountStore(await sameCopy(copy), storage, 'administration');

    expect(await otherFeed.load()).toBe('damaged');
  });

  it('when it is closed, then its contents are gone and its copy refuses to seal', async () => {
    await store.replace(contents());

    store.close();

    expect(store.contents()).toBeNull();
    await expect(store.replace(contents())).rejects.toMatchObject({ reason: 'closed' });
  });
});

async function sameCopy(copy: OpenCopy): Promise<OpenCopy> {
  const key = await generateSessionKey();
  return openWithSessionKey(copy, await copy.wrapWithSessionKey(key), key);
}
