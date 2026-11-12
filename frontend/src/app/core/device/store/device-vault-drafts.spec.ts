import 'fake-indexeddb/auto';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { AdministrationAccess } from '../../auth/administration-access';
import { type DeviceAccount, userHandleOf } from '../../auth/session-device';
import { TAB_LOCKS } from '../../auth/session-tabs';
import { ErrorReporter } from '../../errors/error-reporter';
import { SmallArgon2Derivation } from '../crypto/testing/password-key-derivations';
import type { StoredDraft } from './account-store';
import {
  COPY_CHANNELS,
  DEVICE_STORAGE_OPENER,
  DeviceVault,
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
const PASSWORD = 'Kanárek 2026';
const CANARY_STREET = 'Kanárkova 1234';
const CANARY_TITLE = 'Zlatohlávkův ples';

const PROFILE: StoredDraft = {
  key: 'donor-profile',
  base: 'base-1',
  values: { street: CANARY_STREET },
  savedAt: '2026-11-06T09:00:00.000Z',
};
const NEWS: StoredDraft = {
  key: 'news/new',
  base: 'new',
  values: { title: CANARY_TITLE },
  savedAt: '2026-11-06T09:00:00.000Z',
};

describe('Given the device vault keeping drafts in the encrypted copies of an administrator', () => {
  let access: AdministrationAccess;
  let vault: DeviceVault;

  function anotherStart(): DeviceVault {
    return createEnvironmentInjector([DeviceVault], TestBed.inject(EnvironmentInjector)).get(
      DeviceVault,
    );
  }

  async function storedDraftCount(): Promise<number> {
    const storage = await openIdbDeviceStorage();
    let count = 0;
    for (const entry of await storage.entries()) {
      count += (await storage.drafts(entry.copyId)).length;
    }
    storage.close();
    return count;
  }

  async function signIn(secret: Parameters<DeviceVault['signedIn']>[1], storeNothing = false) {
    access.signedIn();
    await vault.signedIn(JANA, secret, storeNothing);
  }

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: DEVICE_STORAGE_OPENER, useValue: () => openIdbDeviceStorage() },
        { provide: PASSWORD_KEY_DERIVATION, useValue: new SmallArgon2Derivation() },
        { provide: COPY_CHANNELS, useValue: new ChannelBus().factory },
        { provide: STORAGE_PERSISTENCE, useValue: () => undefined },
        { provide: TAB_LOCKS, useValue: new NamedLocks() },
        { provide: ErrorReporter, useValue: { report: vi.fn() } },
      ],
    });
    access = TestBed.inject(AdministrationAccess);
    vault = TestBed.inject(DeviceVault);
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('when Jana signs in with her password and keeps a draft in each copy', () => {
    beforeEach(async () => {
      await signIn({ kind: 'password', password: PASSWORD });
      expect(await vault.keepDraft(vault.opened()!.store, PROFILE)).toBe(true);
      expect(await vault.keepDraft(vault.administration()!.store, NEWS)).toBe(true);
    });

    it('then each copy reads back only its own draft', async () => {
      expect(await vault.drafts(vault.opened()!.store)).toEqual([PROFILE]);
      expect(await vault.drafts(vault.administration()!.store)).toEqual([NEWS]);
    });

    it('then the raw database holds neither the text of a draft nor the form it belongs to', async () => {
      const dump = await rawIndexedDbDump();

      for (const canary of [CANARY_STREET, CANARY_TITLE, 'donor-profile', 'news/new']) {
        expect(leaks(dump, canary), canary).toBe(false);
      }
    });

    it('and the page is loaded again, then her own draft is back and the administration draft comes back only once she unlocks', async () => {
      access.ended();
      const restarted = anotherStart();

      await restarted.restored(JANA);

      expect(await restarted.drafts(restarted.opened()!.store)).toEqual([PROFILE]);
      expect(restarted.administration()).toBeNull();
      access.unlock();
      await restarted.unlockAdministrationWithPassword(JANA, PASSWORD, false);
      expect(await restarted.drafts(restarted.administration()!.store)).toEqual([NEWS]);
    });

    it('and she signs out and in again with her password, then both drafts are back', async () => {
      await vault.signedOut(JANA);
      await signIn({ kind: 'password', password: PASSWORD });

      expect(await vault.drafts(vault.opened()!.store)).toEqual([PROFILE]);
      expect(await vault.drafts(vault.administration()!.store)).toEqual([NEWS]);
    });

    it('and a draft is dropped, then the other copy keeps its own', async () => {
      await vault.dropDraft(vault.opened()!.store, 'donor-profile');

      expect(await vault.drafts(vault.opened()!.store)).toEqual([]);
      expect(await vault.drafts(vault.administration()!.store)).toEqual([NEWS]);
    });

    it('and the administration locks, then its draft is neither read nor kept until it is unlocked again', async () => {
      const store = vault.administration()!.store;

      access.lock();
      TestBed.tick();

      expect(await vault.keepDraft(store, { ...NEWS, values: { title: 'Jiný' } })).toBe(false);
      expect(await vault.drafts(store)).toEqual([]);
      await vault.unlockAdministrationWithPassword(JANA, PASSWORD, false);
      expect(await vault.drafts(vault.administration()!.store)).toEqual([NEWS]);
    });

    it('and the server says she is no longer an administrator, then the administration draft leaves the device and her own stays', async () => {
      await vault.administrationRevoked(JANA);

      expect(await storedDraftCount()).toBe(1);
      expect(await vault.drafts(vault.opened()!.store)).toEqual([PROFILE]);
    });

    it('and she deletes the data on this device, then every draft leaves it with the copies', async () => {
      await vault.forget(JANA);

      expect((await indexedDB.databases()).map((database) => database.name)).toEqual([]);
      expect(await storedDraftCount()).toBe(0);
    });

    it('and she has signed out, then a store of the closed copy keeps nothing', async () => {
      const store = vault.opened()!.store;
      await vault.signedOut(JANA);

      expect(await vault.keepDraft(store, PROFILE)).toBe(false);
      expect(await vault.drafts(store)).toEqual([]);
    });
  });

  describe('when Jana signs in by a link from her e-mail, so her copy has only a session wrap', () => {
    it('and she signs out, then her draft is deleted with the copy', async () => {
      await signIn({ kind: 'none' });
      await vault.keepDraft(vault.opened()!.store, PROFILE);

      await vault.signedOut(JANA);

      expect((await indexedDB.databases()).map((database) => database.name)).toEqual([]);
    });
  });

  describe('when Jana signs in on a public computer and asks to store nothing', () => {
    it('then no draft is kept, not even in memory', async () => {
      await signIn({ kind: 'password', password: PASSWORD }, true);

      expect(await vault.keepDraft(vault.opened()!.store, PROFILE)).toBe(false);
      expect(await vault.drafts(vault.opened()!.store)).toEqual([]);
      expect(await indexedDB.databases()).toEqual([]);
    });
  });
});
