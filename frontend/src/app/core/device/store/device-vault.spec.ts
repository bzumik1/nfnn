import 'fake-indexeddb/auto';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { type DeviceAccount, userHandleOf } from '../../auth/session-device';
import { TAB_LOCKS } from '../../auth/session-tabs';
import { ErrorReporter } from '../../errors/error-reporter';
import type { PrfReading } from '../crypto/prf';
import { PasswordKeyFailure, type PasswordKeyQuestion } from '../crypto/password-key';
import { SmallArgon2Derivation } from '../crypto/testing/password-key-derivations';
import type { CopyContents } from './account-store';
import { DEVICE_DATABASE, type DeviceStorage, type StorageChange } from './device-storage';
import {
  COPY_CHANNELS,
  DEVICE_COPY_MARKER_KEY,
  DEVICE_STORAGE_OPENER,
  DeviceVault,
  PASSWORD_KEY_DERIVATION,
  STORAGE_PERSISTENCE,
  VAULT_LOCK_NAME,
} from './device-vault';
import { openIdbDeviceStorage } from './idb-device-storage';
import { MemoryDeviceStorage } from './memory-device-storage';
import { ChannelBus, NamedLocks } from './testing/fake-device';
import { leaks, rawIndexedDbDump } from './testing/raw-scan';

const JANA: DeviceAccount = {
  email: 'jana.kanarkova@example.cz',
  userHandle: userHandleOf('0190c3a2-7b1e-7cc1-8a52-3f1e2d4c5b6a'),
};
const PETR: DeviceAccount = {
  email: 'petr@example.cz',
  userHandle: userHandleOf('0190c3a2-7b1e-7cc1-8a52-000000000002'),
};
const NEWCOMER: DeviceAccount = {
  email: JANA.email,
  userHandle: userHandleOf('0190c3a2-7b1e-7cc1-8a52-000000000003'),
};
const PASSWORD = 'Kanárek 2026';
const CREDENTIAL = 'Y3JlZGVudGlhbC0x';
const CANARY = 'Zlatohlávek Kanárkový';

function contentsOf(name: string): CopyContents {
  return {
    chunks: [{ id: 'donations:2026', rowsSha256: 'a'.repeat(64), rows: [{ payerName: name }] }],
    summary: { totalMinor: 50_000 },
    storedAt: '2026-11-05T10:00:00Z',
  };
}

function prfReading(fill = 7): PrfReading {
  return {
    credentialId: CREDENTIAL,
    userHandle: JANA.userHandle,
    output: new Uint8Array(32).fill(fill),
  };
}

class GatedDerivation extends SmallArgon2Derivation {
  private gate: Promise<void> | null = null;
  private release: () => void = () => undefined;

  hold(): void {
    this.gate = new Promise((resolve) => (this.release = resolve));
  }

  open(): void {
    this.gate = null;
    this.release();
  }

  failing: PasswordKeyFailure | null = null;

  override async derive(question: PasswordKeyQuestion) {
    if (this.failing !== null) {
      throw this.failing;
    }
    const gate = this.gate;
    const derived = super.derive(question);
    if (gate !== null) {
      await gate;
    }
    return derived;
  }
}

class FailingWrites implements DeviceStorage {
  readonly kind = 'indexed-db' as const;
  private readonly inner = new MemoryDeviceStorage();
  failing = true;

  deviceSalt() {
    return this.inner.deviceSalt();
  }
  entries() {
    return this.inner.entries();
  }
  sessionKey(copyId: string) {
    return this.inner.sessionKey(copyId);
  }
  records(copyId: string) {
    return this.inner.records(copyId);
  }
  async write(change: StorageChange): Promise<void> {
    if (this.failing) {
      throw new DOMException('The quota is full', 'QuotaExceededError');
    }
    return this.inner.write(change);
  }
  destroy() {
    return this.inner.destroy();
  }
  close(): void {
    this.inner.close();
  }
}

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((database) => database.name ?? '');
}

async function rawStorage(): Promise<DeviceStorage> {
  return openIdbDeviceStorage();
}

async function wrapsOf(vault: DeviceVault): Promise<string[]> {
  const storage = await rawStorage();
  const entries = await storage.entries();
  storage.close();
  const copyId = vault.opened()?.store.copyId;
  const entry = copyId === undefined ? entries[0] : entries.find((e) => e.copyId === copyId);
  return (entry?.wraps ?? []).map((wrap) => wrap.kind).sort();
}

describe('Given the device vault over IndexedDB with real WebCrypto', () => {
  let bus: ChannelBus;
  let locks: NamedLocks;
  let reporter: { report: ReturnType<typeof vi.fn> };
  let persist: ReturnType<typeof vi.fn>;
  let opener: ReturnType<typeof vi.fn>;
  let derivation: GatedDerivation;
  let vault: DeviceVault;

  function anotherTab(): DeviceVault {
    return createEnvironmentInjector([DeviceVault], TestBed.inject(EnvironmentInjector)).get(
      DeviceVault,
    );
  }

  async function storedEntries() {
    const storage = await rawStorage();
    const entries = await storage.entries();
    storage.close();
    return entries;
  }

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    bus = new ChannelBus();
    locks = new NamedLocks();
    reporter = { report: vi.fn() };
    persist = vi.fn();
    derivation = new GatedDerivation();
    opener = vi.fn(() => openIdbDeviceStorage());
    TestBed.configureTestingModule({
      providers: [
        { provide: DEVICE_STORAGE_OPENER, useValue: opener },
        { provide: PASSWORD_KEY_DERIVATION, useValue: derivation },
        { provide: COPY_CHANNELS, useValue: bus.factory },
        { provide: STORAGE_PERSISTENCE, useValue: persist },
        { provide: TAB_LOCKS, useValue: locks },
        { provide: ErrorReporter, useValue: reporter },
      ],
    });
    vault = TestBed.inject(DeviceVault);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('when Jana signs in with her password for the first time', () => {
    beforeEach(async () => {
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });
    });

    it('then an empty copy opens, stored on the device, with a session and a password wrap', async () => {
      expect(vault.opened()?.reason).toBe('empty');
      expect(vault.mode()).toBe('stored');
      expect(await wrapsOf(vault)).toEqual(['password', 'session']);
      expect(derivation.requested).toHaveLength(1);
    });

    it('then the browser is asked once to keep the storage and the device notes that it holds a copy', async () => {
      await vault.signedOut(JANA);
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

      expect(persist).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(DEVICE_COPY_MARKER_KEY)).toBe('1');
    });

    it('and she signs out and the password key cannot be derived at the next sign-in, then her copy is kept locked, not replaced', async () => {
      const copyId = vault.opened()!.store.copyId;
      await vault.replaceContents(vault.opened()!.store, contentsOf(CANARY));
      await vault.signedOut(JANA);
      derivation.failing = new PasswordKeyFailure('timeout');

      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

      expect(vault.opened()).toBeNull();
      expect(vault.locked()).toBe(true);
      expect((await storedEntries()).map((entry) => entry.copyId)).toEqual([copyId]);
      derivation.failing = null;
      await vault.signedOut(JANA);
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });
      expect(vault.opened()?.store.copyId).toBe(copyId);
      expect(vault.opened()?.reason).toBe('sign-in');
    });

    it('then every change ran under the Web Lock of the vault', () => {
      expect(locks.requested).toContain(VAULT_LOCK_NAME);
    });

    it('and her gifts are stored, then the raw database holds neither her e-mail, her password nor a name from her gifts', async () => {
      await vault.replaceContents(vault.opened()!.store, contentsOf(CANARY));

      const dump = await rawIndexedDbDump();

      expect(leaks(dump, CANARY)).toBe(false);
      expect(leaks(dump, JANA.email)).toBe(false);
      expect(leaks(dump, PASSWORD)).toBe(false);
      expect(leaks(dump, JANA.userHandle)).toBe(false);
    });

    it('and the page is loaded again, then the new tab opens the same copy with the session key and shows her gifts', async () => {
      const copyId = vault.opened()!.store.copyId;
      await vault.replaceContents(vault.opened()!.store, contentsOf(CANARY));
      const reloaded = anotherTab();

      await reloaded.restored(JANA);

      expect(reloaded.opened()?.store.copyId).toBe(copyId);
      expect(reloaded.opened()?.reason).toBe('restored');
      expect(reloaded.opened()?.store.contents()).toEqual(contentsOf(CANARY));
      expect(derivation.requested).toHaveLength(1);
    });

    it('and she signs out, then the copy stays with only its password wrap and its session key is gone', async () => {
      const copyId = vault.opened()!.store.copyId;

      await vault.signedOut(JANA);

      expect(vault.opened()).toBeNull();
      const entries = await storedEntries();
      expect(entries.map((entry) => entry.copyId)).toEqual([copyId]);
      expect(entries[0].wraps.map((wrap) => wrap.kind)).toEqual(['password']);
      const storage = await rawStorage();
      expect(await storage.sessionKey(copyId)).toBeNull();
      storage.close();
    });

    it('and she signs out and in again with the same password, then the same copy opens with her gifts', async () => {
      const copyId = vault.opened()!.store.copyId;
      await vault.replaceContents(vault.opened()!.store, contentsOf(CANARY));
      await vault.signedOut(JANA);

      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

      expect(vault.opened()?.store.copyId).toBe(copyId);
      expect(vault.opened()?.reason).toBe('sign-in');
      expect(vault.opened()?.store.contents()).toEqual(contentsOf(CANARY));
    });

    it('and she signs out and in with a password changed elsewhere, then the old copy is replaced by a new empty one', async () => {
      const copyId = vault.opened()!.store.copyId;
      await vault.replaceContents(vault.opened()!.store, contentsOf(CANARY));
      await vault.signedOut(JANA);

      await vault.signedIn(JANA, { kind: 'password', password: 'Jiné heslo 2026' });

      expect(vault.opened()?.store.copyId).not.toBe(copyId);
      expect(vault.opened()?.reason).toBe('empty');
      expect((await storedEntries()).map((entry) => entry.copyId)).toEqual([
        vault.opened()!.store.copyId,
      ]);
    });

    it('and she changes her password here, then the copy opens with the new password and no longer with the old', async () => {
      const copyId = vault.opened()!.store.copyId;
      await vault.passwordChanged(JANA, 'Nové heslo 2026');
      await vault.signedOut(JANA);

      await vault.signedIn(JANA, { kind: 'password', password: 'Nové heslo 2026' });
      expect(vault.opened()?.store.copyId).toBe(copyId);
      await vault.signedOut(JANA);
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

      expect(vault.opened()?.store.copyId).not.toBe(copyId);
    });

    it('and she removes her password, then the password wrap is gone and sign-out deletes the copy', async () => {
      await vault.passwordRemoved(JANA);
      expect(await wrapsOf(vault)).toEqual(['session']);

      await vault.signedOut(JANA);

      expect(await storedEntries()).toEqual([]);
    });

    it('and she adds a passkey with PRF, then the copy gains its wrap and the PRF output is zeroed', async () => {
      const reading = prfReading();

      await vault.passkeyAdded(JANA, reading);

      expect(await wrapsOf(vault)).toEqual(['password', 'prf', 'session']);
      expect(reading.output.every((byte) => byte === 0)).toBe(true);
    });

    it('and she changes her e-mail and signs in with it, then the same copy opens and is found under the new address', async () => {
      const copyId = vault.opened()!.store.copyId;
      const before = (await storedEntries())[0].lookupTag;
      await vault.signedOut(JANA);
      const moved = { ...JANA, email: 'jana.nova@example.cz' };

      await vault.signedIn(moved, { kind: 'password', password: PASSWORD });

      expect(vault.opened()?.store.copyId).toBe(copyId);
      expect((await storedEntries())[0].lookupTag).not.toBe(before);
    });

    it('and she deletes the data on this device, then the copy, the device salt and the database are gone', async () => {
      const inputBefore = await vault.prfInput();

      await vault.forget(JANA);

      expect(vault.opened()).toBeNull();
      expect((await indexedDB.databases()).map((database) => database.name)).not.toContain(
        DEVICE_DATABASE,
      );
      expect(localStorage.getItem(DEVICE_COPY_MARKER_KEY)).toBeNull();
      const inputAfter = await vault.prfInput();
      expect(inputAfter).not.toEqual(inputBefore);
    });

    it('and she deletes the data and the sign-out follows, then no database is made again', async () => {
      await vault.forget(JANA);

      await vault.signedOut(JANA);
      await anotherTab().signedOut(JANA);

      expect((await indexedDB.databases()).map((database) => database.name)).not.toContain(
        DEVICE_DATABASE,
      );
    });

    it('then the opened copy names her account', () => {
      expect(vault.opened()?.account).toEqual(JANA);
    });

    it('and the page is left without a sign-out and a later refresh is refused before anyone is known, then only the password wrap stays and no session key is left', async () => {
      const copyId = vault.opened()!.store.copyId;
      const later = anotherTab();

      await later.sessionLost();

      const entries = await storedEntries();
      expect(entries.map((entry) => entry.wraps.map((wrap) => wrap.kind))).toEqual([['password']]);
      const storage = await rawStorage();
      expect(await storage.sessionKey(copyId)).toBeNull();
      storage.close();
    });

    it('and the page is left without a sign-out and Petr signs in, then her copy keeps only its password wrap', async () => {
      const copyId = vault.opened()!.store.copyId;
      const later = anotherTab();

      await later.signedIn(PETR, { kind: 'password', password: 'Petrovo heslo' });

      const jana = (await storedEntries()).find((entry) => entry.copyId === copyId);
      expect(jana?.wraps.map((wrap) => wrap.kind)).toEqual(['password']);
      const storage = await rawStorage();
      expect(await storage.sessionKey(copyId)).toBeNull();
      storage.close();
    });

    it('and another tab signs out while her new password is being wrapped, then the copy still opens with the new password and shows her gifts', async () => {
      await vault.replaceContents(vault.opened()!.store, contentsOf(CANARY));
      derivation.hold();
      const changing = vault.passwordChanged(JANA, 'Nové heslo 2026');
      await vi.waitFor(() => expect(derivation.requested).toHaveLength(2));

      const other = anotherTab();
      const signingOut = other.signedOut(JANA);
      vault.signedOutElsewhere();
      derivation.open();
      await changing;
      await signingOut;
      await vi.waitFor(() => expect(vault.opened()).toBeNull());
      const later = anotherTab();
      await later.signedIn(JANA, { kind: 'password', password: 'Nové heslo 2026' });

      expect(later.opened()?.store.contents()).toEqual(contentsOf(CANARY));
    });

    it('and another tab has her copy open and she deletes the data here, then the other tab closes its copy', async () => {
      const other = anotherTab();
      await other.restored(JANA);
      expect(other.opened()).not.toBeNull();

      await vault.forget(JANA);

      expect(other.opened()).toBeNull();
    });

    it('and another tab has her copy open and this tab stores new gifts, then the other tab shows them', async () => {
      const other = anotherTab();
      await other.restored(JANA);

      await vault.replaceContents(vault.opened()!.store, contentsOf(CANARY));
      await vi.waitFor(() => expect(other.opened()?.store.contents()).toEqual(contentsOf(CANARY)));
    });

    it('and another tab deleted the copy, then storing new gifts here is refused', async () => {
      const store = vault.opened()!.store;
      const other = anotherTab();
      await other.forget(JANA);

      expect(await vault.replaceContents(store, contentsOf(CANARY))).toBe(false);
    });
  });

  describe('when Jana and Petr both keep a copy on this device', () => {
    beforeEach(async () => {
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });
      await vault.replaceContents(vault.opened()!.store, contentsOf('Jana'));
      await vault.signedOut(JANA);
      await vault.signedIn(PETR, { kind: 'password', password: 'Petrovo heslo' });
      await vault.replaceContents(vault.opened()!.store, contentsOf('Petr'));
    });

    it('then Petr sees only his gifts and Jana only hers', async () => {
      expect(vault.opened()?.store.contents()).toEqual(contentsOf('Petr'));
      await vault.signedOut(PETR);

      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

      expect(vault.opened()?.store.contents()).toEqual(contentsOf('Jana'));
    });

    it("and Jana deletes her data, then Petr's copy and the device salt stay", async () => {
      await vault.signedOut(PETR);
      const storage = await rawStorage();
      const salt = await storage.deviceSalt();
      storage.close();

      await vault.forget(JANA);

      const entries = await storedEntries();
      expect(entries).toHaveLength(1);
      const after = await rawStorage();
      expect(await after.deviceSalt()).toBe(salt);
      after.close();
      await vault.signedIn(PETR, { kind: 'password', password: 'Petrovo heslo' });
      expect(vault.opened()?.store.contents()).toEqual(contentsOf('Petr'));
    });
  });

  describe('when another account with the e-mail Jana once had signs in on this device', () => {
    beforeEach(async () => {
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });
      await vault.replaceContents(vault.opened()!.store, contentsOf(CANARY));
    });

    it("then Jana's copy does not open for it, even with its session wrap still there", async () => {
      await anotherTab().signedIn(NEWCOMER, { kind: 'password', password: 'Cizí heslo 2026' });

      const later = anotherTab();
      await later.signedIn(NEWCOMER, { kind: 'password', password: 'Cizí heslo 2026' });
      expect(later.opened()?.store.contents()).not.toEqual(contentsOf(CANARY));
    });

    it("then Jana's copy stays and opens again with her password", async () => {
      await vault.signedOut(JANA);
      await vault.signedIn(NEWCOMER, { kind: 'password', password: 'Cizí heslo 2026' });
      await vault.signedOut(NEWCOMER);

      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

      expect(vault.opened()?.store.contents()).toEqual(contentsOf(CANARY));
    });

    it("and it deletes its data here, then Jana's copy stays", async () => {
      await vault.signedOut(JANA);
      await vault.signedIn(NEWCOMER, { kind: 'password', password: 'Cizí heslo 2026' });

      await vault.forget(NEWCOMER);
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

      expect(vault.opened()?.store.contents()).toEqual(contentsOf(CANARY));
    });
  });

  describe('when Jana keeps a copy locked by her password and signs in with no secret to open it', () => {
    beforeEach(async () => {
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });
      await vault.replaceContents(vault.opened()!.store, contentsOf(CANARY));
      await vault.signedOut(JANA);
    });

    it('then nothing opens, the vault says the copy is locked, and it opens again with her password', async () => {
      await vault.signedIn(JANA, { kind: 'none' });

      expect(vault.opened()).toBeNull();
      expect(vault.locked()).toBe(true);
      await vault.signedOut(JANA);
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

      expect(vault.locked()).toBe(false);
      expect(vault.opened()?.store.contents()).toEqual(contentsOf(CANARY));
    });

    it('and she signs in with a passkey that never wrapped this copy, then the copy stays locked and her password still opens it', async () => {
      await vault.signedIn(JANA, {
        kind: 'prf',
        reading: { ...prfReading(), credentialId: 'another-synced-passkey' },
      });

      expect(vault.opened()).toBeNull();
      expect(vault.locked()).toBe(true);
      await vault.signedOut(JANA);
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });
      expect(vault.opened()?.store.contents()).toEqual(contentsOf(CANARY));
    });

    it('and the page is loaded again, then the locked copy is kept and no new one is made', async () => {
      await anotherTab().restored(JANA);

      const entries = await storedEntries();
      expect(entries).toHaveLength(1);
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });
      expect(vault.opened()?.store.contents()).toEqual(contentsOf(CANARY));
    });
  });

  describe('when the device holds no copy and a passkey sign-in asks for the PRF input', () => {
    it('and the sign-in is cancelled, then no database is made', async () => {
      expect(await vault.prfInput()).not.toBeNull();

      expect(await databaseNames()).not.toContain(DEVICE_DATABASE);
    });

    it('and the sign-in completes, then the copy is wrapped under the input that was asked', async () => {
      const input = await vault.prfInput();

      await vault.signedIn(JANA, { kind: 'prf', reading: prfReading() });

      expect(await vault.prfInput()).toEqual(input);
    });
  });

  describe('when the device storage opens but refuses every write', () => {
    beforeEach(() => {
      opener.mockImplementation(async () => new FailingWrites());
    });

    it('then the copy lives in memory and the failure is reported', async () => {
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

      expect(vault.mode()).toBe('memory');
      expect(vault.opened()).not.toBeNull();
      expect(reporter.report).toHaveBeenCalledWith(
        'device-store-open',
        'global',
        expect.objectContaining({ name: 'QuotaExceededError' }),
      );
    });
  });

  describe('when the deletion of the data on this device fails', () => {
    it('then the copy stays open and stored, so the card and a reload keep working', async () => {
      const storage = new FailingWrites();
      storage.failing = false;
      opener.mockImplementation(async () => storage);
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });
      const copyId = vault.opened()?.store.copyId;
      storage.failing = true;

      await expect(vault.forget(JANA)).rejects.toMatchObject({ name: 'QuotaExceededError' });

      expect(vault.opened()?.store.copyId).toBe(copyId);
      expect((await storage.entries()).map((entry) => entry.copyId)).toEqual([copyId]);
    });
  });

  describe('when Jana signs in with a passkey that gives a PRF output', () => {
    beforeEach(async () => {
      await vault.signedIn(JANA, { kind: 'prf', reading: prfReading() });
    });

    it('then the copy has a session and a PRF wrap', async () => {
      expect(await wrapsOf(vault)).toEqual(['prf', 'session']);
    });

    it('and she signs out and in with the same passkey, then the same copy opens', async () => {
      const copyId = vault.opened()!.store.copyId;
      await vault.signedOut(JANA);

      await vault.signedIn(JANA, { kind: 'prf', reading: prfReading() });

      expect(vault.opened()?.store.copyId).toBe(copyId);
    });

    it('and the reading was handed over, then its output was zeroed', async () => {
      const reading = prfReading();
      await vault.signedOut(JANA);

      await vault.signedIn(JANA, { kind: 'prf', reading });

      expect(reading.output.every((byte) => byte === 0)).toBe(true);
    });
  });

  describe('when Jana signs in by a link from her e-mail, with no secret to wrap the copy', () => {
    beforeEach(async () => {
      await vault.signedIn(JANA, { kind: 'none' });
    });

    it('and she signs out, then the copy is deleted and so is the database', async () => {
      await vault.signedOut(JANA);

      expect((await indexedDB.databases()).map((database) => database.name)).not.toContain(
        DEVICE_DATABASE,
      );
    });
  });

  describe('when Jana signs in and asks to store nothing on this device', () => {
    it('then the copy lives in memory only and nothing reaches IndexedDB or Web Storage', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');

      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD }, true);
      await vault.replaceContents(vault.opened()!.store, contentsOf(CANARY));

      expect(vault.mode()).toBe('memory');
      expect(vault.opened()?.store.contents()).toEqual(contentsOf(CANARY));
      expect(opener).not.toHaveBeenCalled();
      expect(await indexedDB.databases()).toEqual([]);
      expect(setItem).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
      setItem.mockRestore();
    });

    it('and she signs out, then the copy is gone with the memory', async () => {
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD }, true);

      await vault.signedOut(JANA);

      expect(vault.opened()).toBeNull();
      expect(vault.mode()).toBeNull();
    });
  });

  describe('when IndexedDB cannot be opened', () => {
    beforeEach(() => {
      opener.mockImplementation(() =>
        Promise.reject(
          new DOMException('The device storage did not answer in time', 'TimeoutError'),
        ),
      );
    });

    it('then the copy lives in memory, the failure is reported and nothing is stored', async () => {
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

      expect(vault.mode()).toBe('memory');
      expect(vault.opened()).not.toBeNull();
      expect(reporter.report).toHaveBeenCalledWith(
        'device-store-open',
        'global',
        expect.objectContaining({ name: 'TimeoutError' }),
      );
      expect(localStorage.getItem(DEVICE_COPY_MARKER_KEY)).toBeNull();
    });
  });

  describe('when two tabs start a session of Jana at the same moment', () => {
    it('then the vault lock lets one create the copy and the other open it, so the device holds one copy under one salt', async () => {
      const other = anotherTab();

      await Promise.all([
        vault.signedIn(JANA, { kind: 'password', password: PASSWORD }),
        other.restored(JANA),
      ]);

      const entries = await storedEntries();
      expect(entries).toHaveLength(1);
      expect(vault.opened()?.store.copyId).toBe(entries[0].copyId);
      expect(other.opened()?.store.copyId).toBe(entries[0].copyId);
    });
  });

  describe('when Jana signed in by the e-mail link, so her copy has only a session wrap', () => {
    it('and her session is lost in one tab, then the copy is deleted and the other tab closes it', async () => {
      await vault.signedIn(JANA, { kind: 'none' });
      const other = anotherTab();
      await other.restored(JANA);
      expect(other.opened()).not.toBeNull();

      await vault.sessionLost();

      expect(await storedEntries()).toEqual([]);
      await vi.waitFor(() => expect(other.opened()).toBeNull());
    });

    it('and another tab cannot read the records at its reload, then that tab moves to memory and leaves her session wrap alone', async () => {
      await vault.signedIn(JANA, { kind: 'none' });
      opener.mockImplementation(async () => {
        const storage = await openIdbDeviceStorage();
        return Object.assign(Object.create(storage) as DeviceStorage, {
          records: async () => {
            throw new DOMException('The read failed', 'UnknownError');
          },
        });
      });
      const other = anotherTab();

      await other.restored(JANA);

      expect(other.mode()).toBe('memory');
      expect(vault.opened()).not.toBeNull();
      expect((await storedEntries()).flatMap((entry) => entry.wraps.map((w) => w.kind))).toEqual([
        'session',
      ]);
    });
  });

  describe('when the storage refuses a write after the copy was stored', () => {
    it('then the session wrap left in IndexedDB is dropped before the copy moves to memory', async () => {
      const storage = new FailingWrites();
      storage.failing = false;
      opener.mockImplementation(async () => storage);
      const realWrite = storage.write.bind(storage);
      let state: 'before' | 'stored' | 'refused' = 'before';
      storage.write = async (change) => {
        if (state === 'stored') {
          state = 'refused';
          throw new DOMException('The quota is full', 'QuotaExceededError');
        }
        if ((change.putSessionKeys ?? []).length > 0) {
          state = 'stored';
        }
        return realWrite(change);
      };

      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

      expect(state).toBe('refused');
      expect(vault.mode()).toBe('memory');
      expect(vault.opened()).not.toBeNull();
      expect(await storage.entries()).toEqual([]);
    });
  });

  describe('when two downloads of one copy run at once', () => {
    it('then the copy lock runs them one after the other', async () => {
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });
      const store = vault.opened()!.store;
      const order: string[] = [];
      let releaseFirst: () => void = () => undefined;
      const firstHeld = new Promise<void>((resolve) => (releaseFirst = resolve));

      const first = vault.withCopyLock(store, async () => {
        order.push('first started');
        await firstHeld;
        order.push('first done');
      });
      const second = vault.withCopyLock(store, async () => void order.push('second started'));
      await new Promise((resolve) => setTimeout(resolve, 10));
      releaseFirst();
      await Promise.all([first, second]);

      expect(order).toEqual(['first started', 'first done', 'second started']);
    });
  });

  describe('when the browser emptied the storage while the device held a copy', () => {
    it('then the next start reports the eviction once and opens a new empty copy to download again', async () => {
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });
      await vault.replaceContents(vault.opened()!.store, contentsOf(CANARY));
      TestBed.resetTestingModule();
      globalThis.indexedDB = new IDBFactory();
      TestBed.configureTestingModule({
        providers: [
          { provide: DEVICE_STORAGE_OPENER, useValue: () => openIdbDeviceStorage() },
          { provide: PASSWORD_KEY_DERIVATION, useValue: derivation },
          { provide: COPY_CHANNELS, useValue: bus.factory },
          { provide: STORAGE_PERSISTENCE, useValue: persist },
          { provide: TAB_LOCKS, useValue: locks },
          { provide: ErrorReporter, useValue: reporter },
        ],
      });
      const restarted = TestBed.inject(DeviceVault);

      await restarted.restored(JANA);

      expect(reporter.report).toHaveBeenCalledWith('device-store-evicted', 'global');
      expect(restarted.opened()?.reason).toBe('empty');
      expect(restarted.opened()?.store.contents()).toBeNull();
    });

    it('and the device never held a copy, then nothing is reported', async () => {
      await vault.restored(JANA);

      expect(reporter.report).not.toHaveBeenCalled();
      expect(vault.opened()?.reason).toBe('empty');
    });
  });
});
