import 'fake-indexeddb/auto';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { AdministrationAccess } from '../auth/administration-access';
import { type DeviceAccount, userHandleOf } from '../auth/session-device';
import { TAB_LOCKS } from '../auth/session-tabs';
import { SmallArgon2Derivation } from '../device/crypto/testing/password-key-derivations';
import {
  COPY_CHANNELS,
  DEVICE_STORAGE_OPENER,
  DeviceVault,
  PASSWORD_KEY_DERIVATION,
  STORAGE_PERSISTENCE,
} from '../device/store/device-vault';
import { openIdbDeviceStorage } from '../device/store/idb-device-storage';
import { ChannelBus, NamedLocks } from '../device/store/testing/fake-device';
import { ErrorReporter } from '../errors/error-reporter';
import { DRAFT_KEEP_DELAY_MS, DRAFT_SHELF, VaultDraftShelf } from './draft-shelf';
import { type FormDraft, formDraft } from './form-draft';

const JANA: DeviceAccount = {
  email: 'jana@example.cz',
  userHandle: userHandleOf('0190c3a2-7b1e-7cc1-8a52-3f1e2d4c5b6a'),
  administrator: false,
};
const PETR: DeviceAccount = {
  email: 'petr@example.cz',
  userHandle: userHandleOf('0190c3a2-7b1e-7cc1-8a52-3f1e2d4c5b6b'),
  administrator: false,
};

interface Address {
  readonly street: string;
}

describe('Given the drafts of a donor form kept in the device copy of the signed-in donor', () => {
  let vault: DeviceVault;
  let shelf: VaultDraftShelf;
  let session: DeviceAccount | null;
  let values: Address;
  let draft: FormDraft<Address>;

  async function edit(street: string): Promise<void> {
    values = { street };
    draft.changed();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await draft.flush();
  }

  function anotherDevice(): DeviceVault {
    return createEnvironmentInjector([DeviceVault], TestBed.inject(EnvironmentInjector)).get(
      DeviceVault,
    );
  }

  async function draftsOf(account: DeviceAccount, on = vault): Promise<readonly unknown[]> {
    expect(on.opened()?.account.userHandle).toBe(account.userHandle);
    const store = on.opened()!.store;
    return (await on.drafts(store)).map((kept) => kept.values);
  }

  async function startForm(): Promise<void> {
    shelf = new VaultDraftShelf(vault, () => (session === null ? null : session.userHandle));
    values = { street: 'Dlouhá 12' };
    draft = TestBed.runInInjectionContext(() =>
      formDraft<Address>({
        copy: 'donor',
        key: () => 'profile',
        values: () => values,
        apply: () => undefined,
      }),
    );
    draft.ready('v1');
    TestBed.tick();
    await draft.flush();
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
        { provide: DRAFT_KEEP_DELAY_MS, useValue: 0 },
        {
          provide: DRAFT_SHELF,
          useFactory: () => shelf,
        },
      ],
    });
    TestBed.inject(AdministrationAccess);
    vault = TestBed.inject(DeviceVault);
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('when Jana starts the form with her copy open', () => {
    beforeEach(async () => {
      session = JANA;
      await vault.signedIn(JANA, { kind: 'password', password: 'Janino heslo 2026' });
      await startForm();
    });

    it('and she types, then her edit is kept in her own copy', async () => {
      await edit('Janina nová adresa 7');

      expect(await draftsOf(JANA)).toEqual([{ street: 'Janina nová adresa 7' }]);
    });

    it('and the tab turns to Petr while her form is open, then her later edits never reach his copy', async () => {
      await edit('Janina nová adresa 7');
      await anotherDevice().signedIn(PETR, { kind: 'password', password: 'Petrovo heslo 2026' });

      session = PETR;
      await vault.restored(PETR);
      TestBed.tick();
      await edit('Janina nová adresa 7b');

      expect(await draftsOf(PETR)).toEqual([]);
      expect(draft.offer()).toBeNull();
    });

    it('and Petr signs in in the tab, then the shelf refuses to keep anything under her copy', async () => {
      const hers = shelf.holder('donor', JANA.userHandle)!;
      await anotherDevice().signedIn(PETR, { kind: 'password', password: 'Petrovo heslo 2026' });

      session = PETR;
      await vault.restored(PETR);
      const kept = await shelf.keep('donor', hers, {
        key: 'profile',
        base: 'version:v1',
        values: { street: 'Janina nová adresa 7b' },
        savedAt: '2026-11-06T09:00:00.000Z',
      });

      expect(kept).toBe(false);
      expect(shelf.holder('donor', JANA.userHandle)).toBeNull();
      expect(await draftsOf(PETR)).toEqual([]);
    });
  });

  describe('when Jana starts the form while no copy of hers is open', () => {
    beforeEach(() => {
      session = JANA;
    });

    it('and her own copy opens, then her edit is kept there', async () => {
      await startForm();

      await vault.signedIn(JANA, { kind: 'password', password: 'Janino heslo 2026' });
      TestBed.tick();
      await edit('Janina nová adresa 7');

      expect(await draftsOf(JANA)).toEqual([{ street: 'Janina nová adresa 7' }]);
    });

    it('and Petr signs in and his copy opens in the tab, then her edits never reach his copy', async () => {
      await startForm();

      await vault.signedIn(PETR, { kind: 'password', password: 'Petrovo heslo 2026' });
      TestBed.tick();
      await edit('Janina nová adresa 7b');

      expect(await draftsOf(PETR)).toEqual([]);
    });

    it('and her own copy is kept but not opened when Petr signs in, then her edits never reach his copy', async () => {
      await vault.signedIn(JANA, { kind: 'password', password: 'Janino heslo 2026' });
      const restarted = anotherDevice();
      vault = restarted;
      await startForm();

      await restarted.signedIn(PETR, { kind: 'password', password: 'Petrovo heslo 2026' });
      TestBed.tick();
      await edit('Janina nová adresa 7b');

      expect(await draftsOf(PETR, restarted)).toEqual([]);
    });
  });
});
