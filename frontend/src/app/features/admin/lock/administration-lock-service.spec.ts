import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AdministrationAccess } from '../../../core/auth/administration-access';
import { AuthStore } from '../../../core/auth/auth-store';
import type { Donor, PasskeySignInOptions } from '../../../core/auth/donor';
import {
  PasskeyAuthenticator,
  PasskeyCeremonyError,
} from '../../../core/auth/passkey-authenticator';
import { deviceAccountOf } from '../../../core/auth/session-device';
import { sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { DeviceVault } from '../../../core/device/store/device-vault';
import { AdministrationCopyDownload } from '../device-copy/administration-copy-download';
import { AdministrationLockService } from './administration-lock-service';

const ADMINISTRATOR = sampleDonor({ roles: ['DONOR', 'ADMIN'] });
const UNLOCK = '/api/admin/donors/devices/current/unlock';
const SIGN_IN_OPTIONS = '/api/donors/auth/passkey/options';
const OPTIONS: PasskeySignInOptions = {
  challenge: 'dnlad3ZhLWtfYS1tZXppLWNoYWxsZW5nZQ',
  rpId: 'nfnn.cz',
  timeout: 60000,
  userVerification: 'required',
  allowCredentials: [],
};
const ASSERTION = {
  id: 'Y3JlZGVudGlhbC0x',
  rawId: 'Y3JlZGVudGlhbC0x',
  type: 'public-key' as const,
  response: {
    clientDataJSON: 'Y2xpZW50',
    authenticatorData: 'YXV0aA',
    signature: 'c2lnbmF0dXJl',
    userHandle: 'dXNlcg',
  },
};

describe('Given the lock of the administration in this tab', () => {
  let donor: ReturnType<typeof signal<Donor | null>>;
  let admin: ReturnType<typeof signal<boolean>>;
  let publicComputer: ReturnType<typeof signal<boolean>>;
  let vault: {
    administrationPasskeys: ReturnType<typeof vi.fn>;
    unlockAdministrationWithPasskey: ReturnType<typeof vi.fn>;
    unlockAdministrationWithPassword: ReturnType<typeof vi.fn>;
    unlockAdministrationWithPrf: ReturnType<typeof vi.fn>;
    prfInput: ReturnType<typeof vi.fn>;
  };
  let passkeys: { getWithPrf: ReturnType<typeof vi.fn> };
  let hasPasskeys: ReturnType<typeof vi.fn>;
  let prfOutput: Uint8Array<ArrayBuffer>;
  let access: AdministrationAccess;
  let lock: AdministrationLockService;
  let http: HttpTestingController;
  let logout: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logout = vi.fn(() => {
      donor.set(null);
      admin.set(false);
      return of(undefined);
    });
    donor = signal<Donor | null>(ADMINISTRATOR);
    admin = signal(true);
    publicComputer = signal(false);
    vault = {
      administrationPasskeys: vi.fn(async () => ['Y3JlZGVudGlhbC0x']),
      unlockAdministrationWithPasskey: vi.fn(async () => true),
      unlockAdministrationWithPassword: vi.fn(async () => undefined),
      unlockAdministrationWithPrf: vi.fn(async () => true),
      prfInput: vi.fn(async () => new Uint8Array(32)),
    };
    prfOutput = new Uint8Array(32).fill(7);
    passkeys = {
      getWithPrf: vi.fn(async () => ({
        credential: ASSERTION,
        prf: { credentialId: ASSERTION.id, userHandle: 'dXNlcg', output: prfOutput },
      })),
    };
    hasPasskeys = vi.fn(() => of(true));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: {
            donor: donor.asReadonly(),
            isAdmin: admin.asReadonly(),
            storesNothing: publicComputer.asReadonly(),
            logout,
            hasPasskeys,
          },
        },
        { provide: DeviceVault, useValue: vault },
        { provide: PasskeyAuthenticator, useValue: passkeys },
        { provide: AdministrationCopyDownload, useValue: { firstDownload: signal(null) } },
      ],
    });
    access = TestBed.inject(AdministrationAccess);
    lock = TestBed.inject(AdministrationLockService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when an administrator starts the app, then the administration is locked', () => {
    expect(lock.locked()).toBe(true);
  });

  it('when a donor without the role starts the app, then nothing is locked for them', () => {
    admin.set(false);

    expect(lock.locked()).toBe(false);
  });

  it('when the device holds a passkey wrap of the administration, then the passkey is offered', async () => {
    expect(await lock.passkeyUnlocks()).toBe(true);
    expect(vault.administrationPasskeys).toHaveBeenCalledWith(
      deviceAccountOf(ADMINISTRATOR),
      false,
    );
  });

  it('when the passkey opens the copy, then the administration is unlocked', async () => {
    expect(await lock.unlockWithPasskey()).toBe(true);

    expect(lock.locked()).toBe(false);
  });

  it('when the passkey does not open the copy, then the administration stays locked', async () => {
    vault.unlockAdministrationWithPasskey.mockResolvedValue(false);

    expect(await lock.unlockWithPasskey()).toBe(false);

    expect(lock.locked()).toBe(true);
  });

  it('when the server accepts the password and the code, then the administration is unlocked and the copy opens with the password, in memory on a public computer', async () => {
    publicComputer.set(true);
    const unlocked = firstValueFrom(lock.unlockWithPassword('správné heslo', '482913'));
    const request = http.expectOne('/api/admin/donors/devices/current/unlock');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      password: 'správné heslo',
      secondFactorCode: '482913',
    });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await unlocked;

    expect(lock.locked()).toBe(false);
    expect(vault.unlockAdministrationWithPassword).toHaveBeenCalledWith(
      deviceAccountOf(ADMINISTRATOR),
      'správné heslo',
      true,
    );
  });

  it('when she signs out while the server checks the password, then neither the administration nor the copy opens', async () => {
    const unlocked = firstValueFrom(lock.unlockWithPassword('správné heslo', '482913'));
    const request = http.expectOne('/api/admin/donors/devices/current/unlock');
    donor.set(null);
    admin.set(false);
    request.flush(null, { status: 204, statusText: 'No Content' });
    await unlocked;

    expect(access.unlocked()).toBe(false);
    expect(vault.unlockAdministrationWithPassword).not.toHaveBeenCalled();
  });

  it('when another administrator signs in while the passkey is asked, then the administration stays locked', async () => {
    vault.unlockAdministrationWithPasskey.mockImplementation(async () => {
      donor.set(
        sampleDonor({ id: '0190c3a2-7b1e-7cc1-8a52-0000000000ff', roles: ['DONOR', 'ADMIN'] }),
      );
      return true;
    });

    expect(await lock.unlockWithPasskey()).toBe(false);

    expect(access.unlocked()).toBe(false);
  });

  it('when the server refuses the code, then the administration stays locked and the copy stays closed', async () => {
    const unlocked = firstValueFrom(lock.unlockWithPassword('správné heslo', '000000'));
    http
      .expectOne('/api/admin/donors/devices/current/unlock')
      .flush(
        { type: 'https://nfnn.cz/problems/donors/second-factor-code-rejected', status: 400 },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(unlocked).rejects.toBeTruthy();
    expect(lock.locked()).toBe(true);
    expect(vault.unlockAdministrationWithPassword).not.toHaveBeenCalled();
  });

  describe('when the copy on this device has no passkey wrap and the account has a passkey', () => {
    beforeEach(() => vault.administrationPasskeys.mockResolvedValue([]));

    async function answerOptions(): Promise<void> {
      await vi.waitFor(() => http.expectOne(SIGN_IN_OPTIONS).flush(OPTIONS));
    }

    it('then the passkey of the account is offered', async () => {
      expect(await lock.accountPasskeyUnlocks()).toBe(true);
    });

    it('and the account has none, then no passkey of the account is offered', async () => {
      hasPasskeys.mockReturnValue(of(false));

      expect(await lock.accountPasskeyUnlocks()).toBe(false);
    });

    it('and the server accepts the passkey, then the administration is unlocked and the copy is wrapped with it, in memory on a public computer', async () => {
      publicComputer.set(true);
      const unlocked = lock.unlockWithAccountPasskey();
      await answerOptions();
      const request = await vi.waitFor(() => http.expectOne(UNLOCK));
      expect(request.request.body).toEqual({
        passkey: { challenge: OPTIONS.challenge, credential: ASSERTION },
      });
      expect(passkeys.getWithPrf).toHaveBeenCalledWith(OPTIONS, new Uint8Array(32));
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(await unlocked).toBe(true);
      expect(lock.locked()).toBe(false);
      expect(vault.unlockAdministrationWithPrf).toHaveBeenCalledWith(
        deviceAccountOf(ADMINISTRATOR),
        expect.objectContaining({ credentialId: ASSERTION.id }),
        true,
      );
    });

    it('and the server refuses the passkey, then the administration stays locked, the copy stays closed and the output is wiped', async () => {
      const unlocked = lock.unlockWithAccountPasskey();
      await answerOptions();
      (await vi.waitFor(() => http.expectOne(UNLOCK))).flush(
        { type: 'https://nfnn.cz/problems/donors/passkey-confirmation-rejected', status: 400 },
        { status: 400, statusText: 'Bad Request' },
      );

      await expect(unlocked).rejects.toBeTruthy();
      expect(lock.locked()).toBe(true);
      expect(vault.unlockAdministrationWithPrf).not.toHaveBeenCalled();
      expect(prfOutput.every((byte) => byte === 0)).toBe(true);
    });

    it('and the passkey is cancelled, then nothing is sent and the administration stays locked', async () => {
      passkeys.getWithPrf.mockRejectedValue(new PasskeyCeremonyError('cancelled'));
      const unlocked = lock.unlockWithAccountPasskey();
      await answerOptions();

      expect(await unlocked).toBe(false);
      http.expectNone(UNLOCK);
      expect(lock.locked()).toBe(true);
    });

    it('and the authenticator gives no PRF output, then the administration is unlocked and the copy stays as it is', async () => {
      passkeys.getWithPrf.mockResolvedValue({ credential: ASSERTION, prf: null });
      const unlocked = lock.unlockWithAccountPasskey();
      await answerOptions();
      (await vi.waitFor(() => http.expectOne(UNLOCK))).flush(null, {
        status: 204,
        statusText: 'No Content',
      });

      expect(await unlocked).toBe(true);
      expect(lock.locked()).toBe(false);
      expect(vault.unlockAdministrationWithPrf).not.toHaveBeenCalled();
    });

    it('and she signs out while the server checks the passkey, then neither the administration nor the copy opens', async () => {
      const unlocked = lock.unlockWithAccountPasskey();
      await answerOptions();
      const request = await vi.waitFor(() => http.expectOne(UNLOCK));
      donor.set(null);
      admin.set(false);
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(await unlocked).toBe(false);
      expect(access.unlocked()).toBe(false);
      expect(vault.unlockAdministrationWithPrf).not.toHaveBeenCalled();
      expect(prfOutput.every((byte) => byte === 0)).toBe(true);
    });
  });

  it('when it was unlocked and locks again, then the lock reads locked', () => {
    access.unlock();
    expect(lock.locked()).toBe(false);

    access.lock();

    expect(lock.locked()).toBe(true);
  });

  describe('when the administrator signs out from the lock panel', () => {
    it('then the administration stays locked the whole way out, so a kept page never shows, and the site opens', async () => {
      const seen: boolean[] = [];
      const router = TestBed.inject(Router);
      const navigate = router.navigateByUrl.bind(router);
      vi.spyOn(router, 'navigateByUrl').mockImplementation((url, extras) => {
        seen.push(lock.locked());
        return navigate(url, extras);
      });

      await lock.signOut();

      expect(logout).toHaveBeenCalledOnce();
      expect(seen).toEqual([true]);
      expect(router.url).toBe('/');
    });

    it('and the server cannot be reached, then the site opens all the same', async () => {
      logout.mockReturnValue(throwError(() => new Error('offline')));

      await lock.signOut();

      expect(TestBed.inject(Router).url).toBe('/');
    });
  });
});
