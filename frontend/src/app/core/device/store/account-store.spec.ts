import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { generateSessionKey, OpenCopy, openWithSessionKey } from '../crypto/copy-keys';
import { base64UrlToBytes, bytesToBase64Url } from '../crypto/device-bytes';
import { AccountStore, type CopyContents, type StoredDraft } from './account-store';
import type { DeviceStorage } from './device-storage';
import { openIdbDeviceStorage } from './idb-device-storage';
import { leaks, rawIndexedDbDump } from './testing/raw-scan';

const CANARY_NAME = 'Kanárek Zlatohlávek';
const CANARY_IBAN = 'CZ4955000000001041000071';
const CHUNK_ID = 'donations:2026';
const AES_GCM_TAG_BYTES = 16;

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

  describe('when the raw scan is planted with the name in another shape', () => {
    async function planted(value: unknown): Promise<void> {
      const database = await openDB('nfnn.raw-scan-planted', 1, {
        upgrade: (created) => void created.createObjectStore('values'),
      });
      await database.put('values', value, 'planted');
      database.close();
    }

    afterEach(() => {
      document.cookie = 'planted=; max-age=0';
      localStorage.clear();
    });

    it('as bytes in a Uint8Array, then it finds it', async () => {
      await planted(new TextEncoder().encode(`x${CANARY_NAME}y`));

      expect(leaks(await rawIndexedDbDump(), CANARY_NAME)).toBe(true);
    });

    it('as an ArrayBuffer, then it finds it', async () => {
      await planted(new TextEncoder().encode(`x${CANARY_NAME}y`).buffer);

      expect(leaks(await rawIndexedDbDump(), CANARY_NAME)).toBe(true);
    });

    it('as hex, then it finds it', async () => {
      const hex = Array.from(new TextEncoder().encode(CANARY_NAME), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      await planted({ field: hex.toUpperCase() });

      expect(leaks(await rawIndexedDbDump(), CANARY_NAME)).toBe(true);
    });

    it('URL-encoded in a cookie, then it finds it', async () => {
      document.cookie = `planted=${encodeURIComponent(CANARY_NAME)}`;

      expect(leaks(await rawIndexedDbDump(), CANARY_NAME)).toBe(true);
    });

    it('URL-encoded in local storage, then it finds it', async () => {
      localStorage.setItem('nfnn.planted', encodeURIComponent(CANARY_NAME));

      expect(leaks(await rawIndexedDbDump(), CANARY_NAME)).toBe(true);
    });
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

  it('when it is closed while its records are being written, then it shows no contents afterwards', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const slow: DeviceStorage = {
      ...storage,
      write: async (change) => {
        await held;
        await storage.write(change);
      },
    };
    const racing = new AccountStore(copy, slow, 'donor');

    const replaced = racing.replace(contents());
    await new Promise((resolve) => setTimeout(resolve, 20));
    racing.close();
    release();
    await replaced;

    expect(racing.contents()).toBeNull();
  });

  it('when it is closed while its records are being read, then it shows no contents afterwards', async () => {
    await store.replace(contents());
    const reader = new AccountStore(await sameCopy(copy), storage, 'donor');

    const loaded = reader.load();
    reader.close();

    await expect(loaded).resolves.toBe('damaged');
    expect(reader.contents()).toBeNull();
  });

  it('when contents of different sizes are stored, then every sealed record has the length of a size bucket of at least 1 KiB, so its size tells little about the gifts', async () => {
    const many: CopyContents = {
      ...contents(),
      chunks: [
        ...contents().chunks,
        {
          id: 'donations:2025',
          rowsSha256: 'c'.repeat(64),
          rows: Array.from({ length: 100 }, (_, index) => ({ amountMinor: index * 1000 })),
        },
      ],
    };
    await store.replace(many);

    const lengths = (await storage.records(copy.copyId)).map(
      (record) => base64UrlToBytes(record.sealed).length - AES_GCM_TAG_BYTES,
    );

    expect(lengths.length).toBe(4);
    for (const length of lengths) {
      expect(length).toBeGreaterThanOrEqual(1024);
      expect(Math.log2(length) % 1).toBe(0);
    }
    expect(new Set(lengths).size).toBeGreaterThan(1);
  });

  it('when it is closed, then its contents are gone and its copy refuses to seal', async () => {
    await store.replace(contents());

    store.close();

    expect(store.contents()).toBeNull();
    await expect(store.replace(contents())).rejects.toMatchObject({ reason: 'closed' });
  });
});

describe('Given an account store over IndexedDB whose copy the registry holds', () => {
  const CANARY_STREET = 'Kanárkova 1234';
  const PROFILE: StoredDraft = {
    key: 'donor-profile',
    base: 'base-1',
    values: { name: CANARY_NAME, street: CANARY_STREET },
    savedAt: '2026-11-06T09:00:00.000Z',
  };
  let storage: DeviceStorage;
  let copy: OpenCopy;
  let store: AccountStore;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    storage = await openIdbDeviceStorage();
    copy = await OpenCopy.create();
    await storage.write({
      putEntries: [
        {
          copyId: copy.copyId,
          kind: 'donor',
          lookupTag: 'tag',
          userHandleTag: 'handle',
          wraps: [{ kind: 'session', iv: 'aXY', sealed: 'c2VhbGVk' }],
        },
      ],
    });
    store = new AccountStore(copy, storage, 'donor');
  });

  afterEach(async () => {
    store.close();
    await storage.destroy();
  });

  it('when nothing was kept, then it holds no drafts', async () => {
    expect(await store.drafts()).toEqual([]);
  });

  it('when a draft is kept, then a new store of the same copy reads it back', async () => {
    await store.keepDraft(PROFILE);

    const reopened = new AccountStore(await sameCopy(copy), storage, 'donor');

    expect(await reopened.drafts()).toEqual([PROFILE]);
  });

  it('when a draft of the same form is kept again, then only the newer one remains', async () => {
    await store.keepDraft(PROFILE);

    await store.keepDraft({
      ...PROFILE,
      values: { name: 'Jana' },
      savedAt: '2026-11-06T09:01:00.000Z',
    });
    await store.keepDraft({ ...PROFILE, key: 'news/new', values: { title: 'Ples' } });

    expect(await store.drafts()).toEqual([
      { ...PROFILE, values: { name: 'Jana' }, savedAt: '2026-11-06T09:01:00.000Z' },
      { ...PROFILE, key: 'news/new', values: { title: 'Ples' } },
    ]);
    expect(await storage.drafts(copy.copyId)).toHaveLength(2);
  });

  it('when a draft is dropped, then the drafts of other forms stay', async () => {
    await store.keepDraft(PROFILE);
    await store.keepDraft({ ...PROFILE, key: 'news/new' });

    await store.dropDraft('donor-profile');

    expect((await store.drafts()).map((draft) => draft.key)).toEqual(['news/new']);
  });

  it('when a draft is kept, then the raw database holds neither its text, its form nor its field names, and the copy records stay as they were', async () => {
    await store.replace(contents());

    await store.keepDraft(PROFILE);

    const dump = await rawIndexedDbDump();
    for (const canary of [CANARY_NAME, CANARY_STREET, 'donor-profile', 'street', 'base-1']) {
      expect(leaks(dump, canary), canary).toBe(false);
    }
    expect(await store.load()).toBe('loaded');
    expect(await storage.records(copy.copyId)).toHaveLength(3);
  });

  it('when the copy contents are replaced, then the kept drafts stay', async () => {
    await store.keepDraft(PROFILE);

    await store.replace(contents());

    expect(await store.drafts()).toEqual([PROFILE]);
  });

  it('when a kept draft cannot be opened, then it is left out and the next draft kept removes it', async () => {
    await store.keepDraft(PROFILE);
    const [stored] = await storage.drafts(copy.copyId);
    const bytes = base64UrlToBytes(stored.sealed);
    bytes[3] ^= 0x01;
    await storage.write({ putDrafts: [{ ...stored, sealed: bytesToBase64Url(bytes) }] });

    expect(await store.drafts()).toEqual([]);

    await store.keepDraft({ ...PROFILE, key: 'news/new' });
    expect(await storage.drafts(copy.copyId)).toHaveLength(1);
  });

  it('when a draft is read as a copy record of the same id, then it does not open', async () => {
    await store.keepDraft(PROFILE);
    const [stored] = await storage.drafts(copy.copyId);
    await storage.write({ replaceRecords: { copyId: copy.copyId, records: [stored] } });

    expect(await store.load()).toBe('damaged');
  });

  it('when drafts of different lengths are kept, then every sealed draft has the length of a size bucket of at least 1 KiB', async () => {
    await store.keepDraft({ ...PROFILE, values: { body: 'x' } });
    await store.keepDraft({ ...PROFILE, key: 'news/new', values: { body: 'x'.repeat(3000) } });

    const lengths = (await storage.drafts(copy.copyId))
      .map((draft) => base64UrlToBytes(draft.sealed).length - AES_GCM_TAG_BYTES)
      .sort((first, second) => first - second);

    expect(lengths).toEqual([1024, 4096]);
  });

  it('when the copy is gone from the registry, then keeping a draft writes nothing', async () => {
    await storage.write({ deleteCopies: [copy.copyId] });

    await expect(store.keepDraft(PROFILE)).rejects.toBeInstanceOf(RangeError);
    expect(await storage.drafts(copy.copyId)).toEqual([]);
  });

  it('when it is closed, then it keeps no draft', async () => {
    store.close();

    await expect(store.keepDraft(PROFILE)).rejects.toMatchObject({ reason: 'closed' });
  });
});

async function sameCopy(copy: OpenCopy): Promise<OpenCopy> {
  const key = await generateSessionKey();
  return openWithSessionKey(copy, await copy.wrapWithSessionKey(key), key);
}
