import 'fake-indexeddb/auto';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { type DeviceAccount, userHandleOf } from '../../auth/session-device';
import { TAB_LOCKS } from '../../auth/session-tabs';
import { SignedOutNotice } from '../../auth/signed-out-notice';
import { ErrorReporter } from '../../errors/error-reporter';
import type { RegistryEntry } from '../crypto/device-registry';
import { SmallArgon2Derivation } from '../crypto/testing/password-key-derivations';
import type { DeviceStatusResponse } from '../status/device-status-api';
import { DEVICE_STATUS_SOURCE } from '../status/device-status-source';
import { DEVICE_DATABASE, type DeviceStorage } from './device-storage';
import {
  COPY_CHANNELS,
  DEVICE_COPY_MARKER_KEY,
  DEVICE_STORAGE_OPENER,
  DeviceVault,
  PASSWORD_KEY_DERIVATION,
  STORAGE_PERSISTENCE,
} from './device-vault';
import { openIdbDeviceStorage } from './idb-device-storage';
import { ChannelBus, NamedLocks } from './testing/fake-device';

const JANA: DeviceAccount = {
  email: 'jana.kanarkova@example.cz',
  userHandle: userHandleOf('0190c3a2-7b1e-7cc1-8a52-3f1e2d4c5b6a'),
};
const PETR: DeviceAccount = {
  email: 'petr@example.cz',
  userHandle: userHandleOf('0190c3a2-7b1e-7cc1-8a52-000000000002'),
};
const PASSWORD = 'Kanárek 2026';
const IPHONE = 'aVBob25lLWRldmljZS1zZWNyZXQtb2YtamFuYS0wMDE';
const LATER = 'bGF0ZXItZGV2aWNlLXNlY3JldC1vZi1qYW5hLTAwMDI';
const PETRS = 'cGV0cnMtZGV2aWNlLXNlY3JldC1vZi1wZXRyLTAwMDM';

async function withStorage<T>(work: (storage: DeviceStorage) => Promise<T>): Promise<T> {
  const storage = await openIdbDeviceStorage();
  try {
    return await work(storage);
  } finally {
    storage.close();
  }
}

function storedEntries(): Promise<readonly RegistryEntry[]> {
  return withStorage((storage) => storage.entries());
}

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((database) => database.name ?? '');
}

describe('Given the device vault that asks the server how its sign-ins stand', () => {
  let answers: Map<string, DeviceStatusResponse | null>;
  let source: ReturnType<typeof vi.fn<(secret: string) => Promise<DeviceStatusResponse | null>>>;
  let bus: ChannelBus;
  let vault: DeviceVault;
  let notice: SignedOutNotice;

  function answer(secret: string, status: DeviceStatusResponse['status'], administrator = false) {
    answers.set(secret, { status, administrator });
  }

  function anotherTab(): DeviceVault {
    return createEnvironmentInjector([DeviceVault], TestBed.inject(EnvironmentInjector)).get(
      DeviceVault,
    );
  }

  async function plantAdministrationCopyOf(donorEntry: RegistryEntry): Promise<void> {
    await withStorage((storage) =>
      storage.write({
        putEntries: [
          {
            copyId: 'administration-copy',
            kind: 'administration',
            lookupTag: 'administration-lookup',
            userHandleTag: donorEntry.userHandleTag,
            wraps: [],
          },
        ],
      }),
    );
  }

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    answers = new Map();
    source = vi.fn(async (secret: string) => answers.get(secret) ?? null);
    bus = new ChannelBus();
    TestBed.configureTestingModule({
      providers: [
        { provide: DEVICE_STORAGE_OPENER, useValue: () => openIdbDeviceStorage() },
        { provide: PASSWORD_KEY_DERIVATION, useValue: new SmallArgon2Derivation() },
        { provide: COPY_CHANNELS, useValue: bus.factory },
        { provide: STORAGE_PERSISTENCE, useValue: vi.fn() },
        { provide: TAB_LOCKS, useValue: new NamedLocks() },
        { provide: ErrorReporter, useValue: { report: vi.fn() } },
        { provide: DEVICE_STATUS_SOURCE, useValue: source },
      ],
    });
    vault = TestBed.inject(DeviceVault);
    notice = TestBed.inject(SignedOutNotice);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('when Jana signs in with the device secret the server gave this sign-in', () => {
    beforeEach(async () => {
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD }, false, IPHONE);
    });

    it('then her copy keeps the secret and nothing is asked while she is signed in', async () => {
      const entries = await storedEntries();

      expect(entries.map((entry) => entry.deviceSecret)).toEqual([IPHONE]);
      expect(source).not.toHaveBeenCalled();
    });

    describe('and she signs out here', () => {
      it('then the device asks once and keeps her copy while the server says signed out', async () => {
        answer(IPHONE, 'signed-out');

        await vault.signedOut(JANA);

        expect(source.mock.calls).toEqual([[IPHONE]]);
        expect(await storedEntries()).toHaveLength(1);
        expect(notice.shown()).toBe(false);
      });

      it('then a copy whose sign-in was signed out from another device is deleted with the salt and the database', async () => {
        answer(IPHONE, 'wipe-all');

        await vault.signedOut(JANA);

        expect(await databaseNames()).not.toContain(DEVICE_DATABASE);
        expect(localStorage.getItem(DEVICE_COPY_MARKER_KEY)).toBeNull();
        expect(notice.shown()).toBe(true);
        expect(notice.reason()).toBe('device-data-deleted');
      });

      it('then a copy whose sign-in the server does not know is deleted', async () => {
        answer(IPHONE, 'unknown');

        await vault.signedOut(JANA);

        expect(await databaseNames()).not.toContain(DEVICE_DATABASE);
      });

      it('then a copy is kept when the server cannot be reached', async () => {
        answers.set(IPHONE, null);

        await vault.signedOut(JANA);

        expect(await storedEntries()).toHaveLength(1);
        expect(notice.shown()).toBe(false);
      });

      it('then a failing question keeps the copy and the sign-out still ends', async () => {
        source.mockRejectedValueOnce(new Error('offline'));

        await expect(vault.signedOut(JANA)).resolves.toBeUndefined();

        expect(await storedEntries()).toHaveLength(1);
      });
    });

    describe('and the device also keeps the administration copy of her account', () => {
      beforeEach(async () => {
        await plantAdministrationCopyOf((await storedEntries())[0]);
      });

      it('then a directive to delete the administration copy deletes only that copy', async () => {
        answer(IPHONE, 'wipe-admin');

        await vault.signedOut(JANA);

        expect((await storedEntries()).map((entry) => entry.kind)).toEqual(['donor']);
        expect(notice.shown()).toBe(false);
      });

      it('then an account that no longer holds the administrator role deletes the administration copy', async () => {
        answer(IPHONE, 'signed-out', false);

        await vault.signedOut(JANA);

        expect((await storedEntries()).map((entry) => entry.kind)).toEqual(['donor']);
      });

      it('then an administrator signed out here keeps both copies', async () => {
        answer(IPHONE, 'signed-out', true);

        await vault.signedOut(JANA);

        expect((await storedEntries()).map((entry) => entry.kind).sort()).toEqual([
          'administration',
          'donor',
        ]);
      });

      it('then a directive to delete everything deletes both copies of her account', async () => {
        answer(IPHONE, 'wipe-all');

        await vault.signedOut(JANA);

        expect(await databaseNames()).not.toContain(DEVICE_DATABASE);
      });
    });

    it('and she signs in again, then only the new secret is asked about', async () => {
      await vault.signedOut(JANA);
      source.mockClear();
      await vault.signedIn(JANA, { kind: 'password', password: PASSWORD }, false, LATER);
      answer(IPHONE, 'wipe-all');
      answer(LATER, 'signed-out');

      await vault.signedOut(JANA);

      expect(source.mock.calls).toEqual([[LATER]]);
      expect(await storedEntries()).toHaveLength(1);
    });

    it('and her session is lost while the copy of Petr stays signed out, then only her copy goes', async () => {
      await vault.signedOut(JANA);
      await vault.signedIn(PETR, { kind: 'password', password: 'Petrovo heslo' }, false, PETRS);
      answer(IPHONE, 'wipe-all');
      answer(PETRS, 'signed-out');

      await vault.sessionLost();

      const entries = await storedEntries();
      expect(entries.map((entry) => entry.deviceSecret)).toEqual([PETRS]);
    });

    it('and another tab holds her copy open, then a directive to delete it closes it there', async () => {
      const tab = anotherTab();
      await tab.restored(JANA);
      expect(tab.opened()).not.toBeNull();
      answer(IPHONE, 'wipe-all');

      await vault.sessionLost();

      await vi.waitFor(() => expect(tab.opened()).toBeNull());
    });

    it('and her session is restored with the server saying she is signed in, then the copy stays open', async () => {
      const tab = anotherTab();
      answer(IPHONE, 'signed-in');

      await tab.restored(JANA);

      expect(source.mock.calls).toEqual([[IPHONE]]);
      expect(tab.opened()).not.toBeNull();
    });
  });

  it('when Jana signs in with no device secret, then the device never asks about her copy', async () => {
    await vault.signedIn(JANA, { kind: 'password', password: PASSWORD });

    await vault.signedOut(JANA);

    expect(source).not.toHaveBeenCalled();
    expect((await storedEntries())[0].deviceSecret).toBeUndefined();
  });

  it('when Jana signs in on a public computer, then nothing is asked while that session lasts', async () => {
    await vault.signedIn(JANA, { kind: 'password', password: PASSWORD }, false, IPHONE);
    await vault.signedOut(JANA);
    source.mockClear();
    await vault.signedIn(PETR, { kind: 'password', password: 'Petrovo heslo' }, true);

    await vault.restored(PETR, true);

    expect(source).not.toHaveBeenCalled();
    expect(vault.mode()).toBe('memory');
  });

  it('when Jana signs in by a link while her copy is locked by her password, then the copy holds the new secret', async () => {
    await vault.signedIn(JANA, { kind: 'password', password: PASSWORD }, false, IPHONE);
    await vault.signedOut(JANA);

    await vault.signedIn(JANA, { kind: 'none' }, false, LATER);

    expect(vault.locked()).toBe(true);
    const entries = await storedEntries();
    expect(
      entries.map((entry) => [entry.deviceSecret, entry.wraps.map((wrap) => wrap.kind)]),
    ).toEqual([[LATER, ['password']]]);
  });
});
