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
import { DRAFT_KEEP_DELAY_MS, VaultDraftShelf } from './draft-shelf';
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
  let values: Address;
  let draft: FormDraft<Address>;

  async function edit(street: string): Promise<void> {
    values = { street };
    draft.changed();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await draft.flush();
  }

  async function draftsOf(account: DeviceAccount): Promise<readonly unknown[]> {
    const holder = shelf.holder('donor');
    expect(vault.opened()?.account.userHandle).toBe(account.userHandle);
    return holder === null ? [] : (await shelf.list('donor', holder)).map((kept) => kept.values);
  }

  beforeEach(async () => {
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
      ],
    });
    TestBed.inject(AdministrationAccess);
    vault = TestBed.inject(DeviceVault);
    shelf = new VaultDraftShelf(vault);
    await vault.signedIn(JANA, { kind: 'password', password: 'Janino heslo 2026' });
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
  });

  afterEach(() => TestBed.resetTestingModule());

  it('when Jana types, then her edit is kept in her own copy', async () => {
    await edit('Janina nová adresa 7');

    expect(await draftsOf(JANA)).toEqual([{ street: 'Janina nová adresa 7' }]);
  });

  it('when the tab turns to Petr while her form is open, then her later edits never reach his copy', async () => {
    await edit('Janina nová adresa 7');
    const petrsDevice = createEnvironmentInjector(
      [DeviceVault],
      TestBed.inject(EnvironmentInjector),
    ).get(DeviceVault);
    await petrsDevice.signedIn(PETR, { kind: 'password', password: 'Petrovo heslo 2026' });

    await vault.restored(PETR);
    TestBed.tick();
    await edit('Janina nová adresa 7b');

    expect(await draftsOf(PETR)).toEqual([]);
    expect(draft.offer()).toBeNull();
  });
});
