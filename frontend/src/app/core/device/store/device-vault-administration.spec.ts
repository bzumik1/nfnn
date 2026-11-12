import 'fake-indexeddb/auto';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { AdministrationAccess } from '../../auth/administration-access';
import { type DeviceAccount, userHandleOf } from '../../auth/session-device';
import { TAB_LOCKS } from '../../auth/session-tabs';
import { ErrorReporter } from '../../errors/error-reporter';
import { base64UrlToBytes } from '../crypto/device-bytes';
import type { PrfReading } from '../crypto/prf';
import { SmallArgon2Derivation } from '../crypto/testing/password-key-derivations';
import { AccountStore, type CopyContents } from './account-store';
import { OpenCopy } from '../crypto/copy-keys';
import {
  COPY_CHANNELS,
  DEVICE_STORAGE_OPENER,
  DeviceVault,
  PASSKEY_READER,
  PASSWORD_KEY_DERIVATION,
  STORAGE_PERSISTENCE,
} from './device-vault';
import { openIdbDeviceStorage } from './idb-device-storage';
import { ChannelBus, NamedLocks } from './testing/fake-device';
import { leaks, rawIndexedDbDump } from './testing/raw-scan';

const JANA: DeviceAccount = {
  email: 'jana.kanarkova@example.cz',
  userHandle: userHandleOf('0190c3a2-7b1e-7cc1-8a52-3f1e2d4c5b6a'),
  administrator: true,
};
const PETR: DeviceAccount = {
  email: 'petr@example.cz',
  userHandle: userHandleOf('0190c3a2-7b1e-7cc1-8a52-000000000002'),
  administrator: false,
};
const PASSWORD = 'Kanárek 2026';
const CREDENTIAL = 'Y3JlZGVudGlhbC0x';
const OTHER_CREDENTIAL = 'Y3JlZGVudGlhbC0y';
const CANARY = 'Zlatohlávek Správcovský';

function administrationContents(name: string): CopyContents {
  return {
    chunks: [
      {
        id: 'donations/payments:2026-11',
        rowsSha256: 'b'.repeat(64),
        rows: [{ counterpartyName: name }],
      },
    ],
    summary: { donations: { today: '2026-11-05', byYear: [] } },
    storedAt: '2026-11-05T10:00:00Z',
  };
}

function prfReading(credentialId = CREDENTIAL, fill = 7): PrfReading {
  return { credentialId, userHandle: JANA.userHandle, output: new Uint8Array(32).fill(fill) };
}

class FakeCredentials {
  answering: string | null = CREDENTIAL;
  output = 7;
  readonly asked: PublicKeyCredentialRequestOptions[] = [];

  async get(options: CredentialRequestOptions): Promise<Credential | null> {
    this.asked.push(options.publicKey!);
    if (this.answering === null) {
      return null;
    }
    const authenticatorData = new Uint8Array(37);
    authenticatorData[32] = 0x05;
    const rawId = base64UrlToBytes(this.answering).buffer;
    const output = new Uint8Array(32).fill(this.output).buffer;
    return {
      type: 'public-key',
      id: this.answering,
      rawId,
      response: { authenticatorData: authenticatorData.buffer, userHandle: null },
      getClientExtensionResults: () => ({ prf: { results: { first: output } } }),
    } as unknown as Credential;
  }
}

describe('Given the device vault keeping a copy of the administration for an administrator', () => {
  let locks: NamedLocks;
  let reporter: { report: ReturnType<typeof vi.fn> };
  let credentials: FakeCredentials;
  let access: AdministrationAccess;
  let vault: DeviceVault;

  async function storedEntries() {
    const storage = await openIdbDeviceStorage();
    const entries = await storage.entries();
    storage.close();
    return entries;
  }

  async function administrationWraps(): Promise<string[]> {
    const entry = (await storedEntries()).find((candidate) => candidate.kind === 'administration');
    return (entry?.wraps ?? []).map((wrap) => wrap.kind).sort();
  }

  async function donorWraps(): Promise<string[]> {
    const entry = (await storedEntries()).find((candidate) => candidate.kind === 'donor');
    return (entry?.wraps ?? []).map((wrap) => wrap.kind).sort();
  }

  async function signIn(account: DeviceAccount, secret: Parameters<DeviceVault['signedIn']>[1]) {
    access.signedIn();
    await vault.signedIn(account, secret);
  }

  function anotherStart(): DeviceVault {
    return createEnvironmentInjector([DeviceVault], TestBed.inject(EnvironmentInjector)).get(
      DeviceVault,
    );
  }

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    locks = new NamedLocks();
    reporter = { report: vi.fn() };
    credentials = new FakeCredentials();
    TestBed.configureTestingModule({
      providers: [
        { provide: DEVICE_STORAGE_OPENER, useValue: () => openIdbDeviceStorage() },
        { provide: PASSWORD_KEY_DERIVATION, useValue: new SmallArgon2Derivation() },
        { provide: COPY_CHANNELS, useValue: new ChannelBus().factory },
        { provide: STORAGE_PERSISTENCE, useValue: () => undefined },
        { provide: TAB_LOCKS, useValue: locks },
        { provide: ErrorReporter, useValue: reporter },
        { provide: PASSKEY_READER, useValue: { rpId: 'nfnn.cz', credentials } },
      ],
    });
    access = TestBed.inject(AdministrationAccess);
    vault = TestBed.inject(DeviceVault);
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('when Jana, an administrator, signs in with her password', () => {
    beforeEach(async () => {
      await signIn(JANA, { kind: 'password', password: PASSWORD });
    });

    it('then a second, empty copy opens for the administration, kept only under her password, beside her own copy', async () => {
      expect(vault.administration()?.reason).toBe('empty');
      expect(vault.administration()?.store.feed).toBe('administration');
      expect(vault.administration()?.store.copyId).not.toBe(vault.opened()?.store.copyId);
      expect(await administrationWraps()).toEqual(['password']);
      expect(await donorWraps()).toEqual(['password', 'session']);
      expect(vault.stores(vault.administration()!.store)).toBe(true);
    });

    it('and the administration is stored, then the raw database holds neither a name from it nor her password', async () => {
      await vault.replaceContents(vault.administration()!.store, administrationContents(CANARY));

      const dump = await rawIndexedDbDump();

      expect(leaks(dump, CANARY)).toBe(false);
      expect(leaks(dump, PASSWORD)).toBe(false);
      expect(vault.administration()?.store.contents()?.chunks[0].rows).toEqual([
        { counterpartyName: CANARY },
      ]);
    });

    it('and the app starts again, then her own copy opens but the administration stays locked until she unlocks it with her password', async () => {
      const copyId = vault.administration()!.store.copyId;
      await vault.replaceContents(vault.administration()!.store, administrationContents(CANARY));
      access.ended();
      const restarted = anotherStart();

      await restarted.restored(JANA);

      expect(restarted.opened()).not.toBeNull();
      expect(restarted.administration()).toBeNull();
      await restarted.unlockAdministrationWithPassword(JANA, PASSWORD, false);
      expect(restarted.administration()?.store.copyId).toBe(copyId);
      expect(restarted.administration()?.reason).toBe('unlocked');
    });

    it('and the app starts again and she unlocks with a passkey of her account the server confirmed, then a fresh copy opens under that passkey alone and the output is wiped', async () => {
      const copyId = vault.administration()!.store.copyId;
      await vault.replaceContents(vault.administration()!.store, administrationContents(CANARY));
      access.ended();
      const restarted = anotherStart();
      await restarted.restored(JANA);
      const reading = prfReading();

      expect(await restarted.unlockAdministrationWithPrf(JANA, reading, false)).toBe(true);

      expect(restarted.administration()?.store.copyId).not.toBe(copyId);
      expect(restarted.administration()?.reason).toBe('empty');
      expect(await administrationWraps()).toEqual(['prf']);
      expect(await restarted.administrationPasskeys(JANA, false)).toEqual([CREDENTIAL]);
      expect(reading.output.every((byte) => byte === 0)).toBe(true);
    });

    it('and she signs out while the passkey the server confirmed waits for the vault, then nothing opens for her and the copy keeps her password', async () => {
      await vault.lockAdministration();
      const reading = prfReading();

      const unlocking = vault.unlockAdministrationWithPrf(JANA, reading, false);
      const signingOut = vault.signedOut(JANA);

      expect(await unlocking).toBe(false);
      await signingOut;
      expect(vault.administration()).toBeNull();
      expect(await administrationWraps()).toEqual(['password']);
      expect(reading.output.every((byte) => byte === 0)).toBe(true);
    });

    it('and the administration locks while another tab holds the vault, then its copy closes at once, without waiting for the vault', async () => {
      const store = vault.administration()!.store;
      await vault.replaceContents(store, administrationContents(CANARY));
      let release: () => void = () => undefined;
      void locks.request('nfnn.device-vault', () => new Promise<void>((done) => (release = done)));

      access.lock();
      TestBed.tick();

      expect(vault.administration()).toBeNull();
      expect(store.contents()).toBeNull();
      release();
    });

    it('and the administration locks, then its copy closes and her own copy stays open', async () => {
      const store = vault.administration()!.store;
      await vault.replaceContents(store, administrationContents(CANARY));

      access.lock();
      TestBed.tick();
      await vault.administrationPasskeys(JANA, false);

      expect(vault.administration()).toBeNull();
      expect(store.contents()).toBeNull();
      expect(vault.opened()).not.toBeNull();
    });

    it('and she adds a passkey, then the administration keeps the passkey instead of her password, and her own copy keeps both', async () => {
      await vault.passkeyAdded(JANA, prfReading());

      expect(await administrationWraps()).toEqual(['prf']);
      expect(await donorWraps()).toEqual(['password', 'prf', 'session']);
      expect(await vault.administrationPasskeys(JANA, false)).toEqual([CREDENTIAL]);
    });

    it('and she changes her password, then the administration opens with the new one', async () => {
      const copyId = vault.administration()!.store.copyId;
      await vault.passwordChanged(JANA, 'Nové heslo 2026');
      await vault.lockAdministration();

      await vault.unlockAdministrationWithPassword(JANA, 'Nové heslo 2026', false);

      expect(vault.administration()?.store.copyId).toBe(copyId);
    });

    it('and the server says she is no longer an administrator, then only the administration leaves the device', async () => {
      const donorCopy = vault.opened()!.store.copyId;

      await vault.administrationRevoked(JANA);

      expect(vault.administration()).toBeNull();
      expect((await storedEntries()).map((entry) => [entry.kind, entry.copyId])).toEqual([
        ['donor', donorCopy],
      ]);
      expect(vault.opened()?.store.copyId).toBe(donorCopy);
    });

    it('and she deletes the data on this device, then both copies leave it', async () => {
      await vault.forget(JANA);

      expect(vault.administration()).toBeNull();
      expect(await storedEntries()).toEqual([]);
    });

    it('and she changes her password while the administration is locked, then the copy only the old password opens leaves the device', async () => {
      const copyId = vault.administration()!.store.copyId;
      await vault.lockAdministration();

      await vault.passwordChanged(JANA, 'Nové heslo 2026');

      expect((await storedEntries()).map((entry) => entry.copyId)).not.toContain(copyId);
      expect(await donorWraps()).toEqual(['password', 'session']);
    });

    it('and she adds a passkey while the administration is locked, then the copy kept under her password leaves the device', async () => {
      const copyId = vault.administration()!.store.copyId;
      await vault.lockAdministration();

      await vault.passkeyAdded(JANA, prfReading());

      expect((await storedEntries()).map((entry) => entry.copyId)).not.toContain(copyId);
      expect(await donorWraps()).toEqual(['password', 'prf', 'session']);
    });

    it('and she signs in again with a passkey, then a fresh copy under the passkey alone replaces the one under her password', async () => {
      const copyId = vault.administration()!.store.copyId;
      await vault.signedOut(JANA);
      access.ended();

      await signIn(JANA, { kind: 'prf', reading: prfReading() });

      expect(vault.administration()?.store.copyId).not.toBe(copyId);
      expect(vault.administration()?.reason).toBe('empty');
      expect(await administrationWraps()).toEqual(['prf']);
      expect(
        (await storedEntries()).filter((entry) => entry.kind === 'administration'),
      ).toHaveLength(1);
    });

    it('and the app starts again after the role was taken away, then the copy stays on the device, locked, until the server tells the device to delete it', async () => {
      await vault.signedOut(JANA);
      access.ended();
      const restarted = anotherStart();

      await restarted.restored({ ...JANA, administrator: false });

      expect(restarted.administration()).toBeNull();
      expect(await administrationWraps()).toEqual(['password']);
    });

    it('and reading the copy fails as she unlocks it, then its key is closed and nothing stays open', async () => {
      await vault.lockAdministration();
      vi.spyOn(AccountStore.prototype, 'load').mockRejectedValueOnce(new Error('read failed'));
      const closed = vi.spyOn(OpenCopy.prototype, 'close');

      await expect(vault.unlockAdministrationWithPassword(JANA, PASSWORD, false)).rejects.toThrow();

      expect(closed).toHaveBeenCalled();
      expect(vault.administration()).toBeNull();
      vi.restoreAllMocks();
    });

    it('and she signs out, then the administration closes and stays on the device under her password', async () => {
      await vault.signedOut(JANA);

      expect(vault.administration()).toBeNull();
      expect(await administrationWraps()).toEqual(['password']);
    });
  });

  describe('when Jana signs in with a passkey that gives a PRF output', () => {
    beforeEach(async () => {
      await signIn(JANA, { kind: 'prf', reading: prfReading() });
    });

    it('then the administration is kept under the passkey alone', async () => {
      expect(await administrationWraps()).toEqual(['prf']);
    });

    it('and the app starts again, then the same passkey unlocks the administration on the device, asked only for that passkey', async () => {
      const copyId = vault.administration()!.store.copyId;
      await vault.lockAdministration();

      const unlocked = await vault.unlockAdministrationWithPasskey(JANA, false);

      expect(unlocked).toBe(true);
      expect(vault.administration()?.store.copyId).toBe(copyId);
      expect(credentials.asked[0].rpId).toBe('nfnn.cz');
      expect(credentials.asked[0].allowCredentials?.length).toBe(1);
    });

    it('and she signs out while the passkey is still being asked, then the administration does not open for her afterwards', async () => {
      await vault.lockAdministration();
      let answer: () => void = () => undefined;
      const asked = new Promise<void>((resolve) => (answer = resolve));
      let ceremonyStarted = false;
      const get = credentials.get.bind(credentials);
      credentials.get = async (options) => {
        ceremonyStarted = true;
        await asked;
        return get(options);
      };
      const unlocking = vault.unlockAdministrationWithPasskey(JANA, false);
      await vi.waitFor(() => expect(ceremonyStarted).toBe(true));

      const signingOut = vault.signedOut(JANA);
      answer();

      expect(await unlocking).toBe(false);
      await signingOut;
      expect(vault.administration()).toBeNull();
    });

    it('and another passkey answers, then nothing opens and the copy is kept', async () => {
      const copyId = vault.administration()!.store.copyId;
      await vault.lockAdministration();
      credentials.answering = OTHER_CREDENTIAL;

      expect(await vault.unlockAdministrationWithPasskey(JANA, false)).toBe(false);

      expect(vault.administration()).toBeNull();
      expect((await storedEntries()).some((entry) => entry.copyId === copyId)).toBe(true);
    });

    it('and the passkey gives another output, then nothing opens and the copy is not replaced', async () => {
      const copyId = vault.administration()!.store.copyId;
      await vault.lockAdministration();
      credentials.output = 9;

      expect(await vault.unlockAdministrationWithPasskey(JANA, false)).toBe(false);

      expect(
        (await storedEntries()).filter((entry) => entry.kind === 'administration'),
      ).toMatchObject([{ copyId }]);
    });

    it('and she unlocks with her password and a code instead, then the copy stays locked and gains no password wrap', async () => {
      await vault.lockAdministration();

      await vault.unlockAdministrationWithPassword(JANA, PASSWORD, false);

      expect(vault.administration()).toBeNull();
      expect(await administrationWraps()).toEqual(['prf']);
    });
  });

  describe('when Jana has the administration open under her passkey in two tabs', () => {
    let otherAccess: AdministrationAccess;
    let other: DeviceVault;

    beforeEach(async () => {
      await signIn(JANA, { kind: 'prf', reading: prfReading() });
      const tab = createEnvironmentInjector(
        [DeviceVault, AdministrationAccess],
        TestBed.inject(EnvironmentInjector),
      );
      otherAccess = tab.get(AdministrationAccess);
      other = tab.get(DeviceVault);
      await other.restored(JANA);
      otherAccess.unlock();
      expect(await other.unlockAdministrationWithPasskey(JANA, false)).toBe(true);
      TestBed.tick();
    });

    it('then both tabs show the same copy', () => {
      expect(other.administration()?.store.copyId).toBe(vault.administration()?.store.copyId);
    });

    it('and this tab stores a new download, then the other tab shows it without being unlocked again', async () => {
      await vault.replaceContents(vault.administration()!.store, administrationContents(CANARY));

      await vi.waitFor(() =>
        expect(other.administration()?.store.contents()?.chunks[0].rows).toEqual([
          { counterpartyName: CANARY },
        ]),
      );
    });

    it('and the administration locks in this tab, then the other tab keeps its copy open and can still store into it', async () => {
      access.lock();
      TestBed.tick();
      await vault.administrationPasskeys(JANA, false);

      expect(vault.administration()).toBeNull();
      expect(other.administration()).not.toBeNull();
      expect(
        await other.replaceContents(other.administration()!.store, administrationContents(CANARY)),
      ).toBe(true);
    });

    it('and the server tells this tab she is no longer an administrator, then the other tab closes the copy too and stores nothing into it', async () => {
      const store = other.administration()!.store;

      await vault.administrationRevoked(JANA);

      await vi.waitFor(() => expect(other.administration()).toBeNull());
      expect(store.contents()).toBeNull();
      expect(await other.replaceContents(store, administrationContents(CANARY))).toBe(false);
      expect(await administrationWraps()).toEqual([]);
      expect(other.opened()).not.toBeNull();
    });
  });

  describe('when Jana signs in on a public computer, so nothing is stored', () => {
    it('then the administration lives in memory and unlocks there again with her password', async () => {
      access.signedIn();
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD }, true);
      const copyId = vault.administration()!.store.copyId;
      expect(vault.stores(vault.administration()!.store)).toBe(false);
      await vault.lockAdministration();

      await vault.unlockAdministrationWithPassword(JANA, PASSWORD, true);

      expect(vault.administration()?.store.copyId).toBe(copyId);
      expect((await indexedDB.databases()).length).toBe(0);
    });
  });

  describe('when Petr, who is not an administrator, signs in', () => {
    it('then only his own copy is kept', async () => {
      await signIn(PETR, { kind: 'password', password: PASSWORD });

      expect(vault.administration()).toBeNull();
      expect((await storedEntries()).map((entry) => entry.kind)).toEqual(['donor']);
    });
  });
});
