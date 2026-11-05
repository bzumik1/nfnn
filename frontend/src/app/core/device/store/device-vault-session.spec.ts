import 'fake-indexeddb/auto';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { AuthStore } from '../../auth/auth-store';
import { PasskeyAuthenticator } from '../../auth/passkey-authenticator';
import { deviceAccountOf, SESSION_DEVICE } from '../../auth/session-device';
import { SESSION_CHANNEL, TAB_LOCKS } from '../../auth/session-tabs';
import {
  authResponse,
  FakePasskeyAuthenticator,
  sampleDonor,
} from '../../auth/testing/donor-fixtures';
import { FakeSessionChannel } from '../../auth/testing/fake-session-tabs';
import { ErrorReporter } from '../../errors/error-reporter';
import { SmallArgon2Derivation } from '../crypto/testing/password-key-derivations';
import {
  COPY_CHANNELS,
  DEVICE_STORAGE_OPENER,
  DeviceVault,
  PASSWORD_KEY_DERIVATION,
  STORAGE_PERSISTENCE,
} from './device-vault';
import { openIdbDeviceStorage } from './idb-device-storage';
import { ChannelBus, NamedLocks } from './testing/fake-device';

const PETR_DONOR = sampleDonor({
  id: '01a18e56-bdb0-775a-bd0a-000000000002',
  email: 'petr@example.cz',
});
const PETR = deviceAccountOf(PETR_DONOR);

describe('Given the auth store of one tab over the real device vault', () => {
  let store: AuthStore;
  let vault: DeviceVault;
  let http: HttpTestingController;

  function anotherTab(): DeviceVault {
    return createEnvironmentInjector([DeviceVault], TestBed.inject(EnvironmentInjector)).get(
      DeviceVault,
    );
  }

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    const bus = new ChannelBus();
    const channel = new FakeSessionChannel();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PasskeyAuthenticator, useValue: new FakePasskeyAuthenticator() },
        { provide: SESSION_CHANNEL, useValue: () => channel },
        { provide: DEVICE_STORAGE_OPENER, useValue: () => openIdbDeviceStorage() },
        { provide: PASSWORD_KEY_DERIVATION, useValue: new SmallArgon2Derivation() },
        { provide: COPY_CHANNELS, useValue: bus.factory },
        { provide: STORAGE_PERSISTENCE, useValue: vi.fn() },
        { provide: TAB_LOCKS, useValue: new NamedLocks() },
        { provide: ErrorReporter, useValue: { report: vi.fn() } },
        { provide: SESSION_DEVICE, useExisting: DeviceVault },
      ],
    });
    store = TestBed.inject(AuthStore);
    vault = TestBed.inject(DeviceVault);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  describe('when Jana is signed in here and Petr signs in with his password in another tab', () => {
    beforeEach(async () => {
      store.login('jana@example.cz', 'correct horse battery').subscribe();
      http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
      await vi.waitFor(() => expect(vault.opened()).not.toBeNull());
      await anotherTab().signedIn(PETR, { kind: 'password', password: 'Petrovo heslo 2026' });
    });

    it('and the next refresh here answers for Petr, then his copy opens here unlocked', async () => {
      store.refresh().subscribe();
      await vi.waitFor(() =>
        http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-2', PETR_DONOR)),
      );

      await vi.waitFor(() => expect(vault.opened()?.account.userHandle).toBe(PETR.userHandle));
      expect(vault.locked()).toBe(false);
      const reloaded = anotherTab();
      await reloaded.restored(PETR);
      expect(reloaded.opened()?.store.copyId).toBe(vault.opened()?.store.copyId);
    });
  });
});
