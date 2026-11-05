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
import type { CopyContents } from './account-store';
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
