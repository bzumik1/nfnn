import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AdministrationAccess } from '../../../core/auth/administration-access';
import { AuthStore } from '../../../core/auth/auth-store';
import type { Donor } from '../../../core/auth/donor';
import { deviceAccountOf } from '../../../core/auth/session-device';
import { sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { DeviceVault } from '../../../core/device/store/device-vault';
import { AdministrationCopyDownload } from '../device-copy/administration-copy-download';
import { AdministrationLockService } from './administration-lock-service';

const ADMINISTRATOR = sampleDonor({ roles: ['DONOR', 'ADMIN'] });

describe('Given the lock of the administration in this tab', () => {
  let donor: ReturnType<typeof signal<Donor | null>>;
  let admin: ReturnType<typeof signal<boolean>>;
  let publicComputer: ReturnType<typeof signal<boolean>>;
  let vault: {
    administrationPasskeys: ReturnType<typeof vi.fn>;
    unlockAdministrationWithPasskey: ReturnType<typeof vi.fn>;
    unlockAdministrationWithPassword: ReturnType<typeof vi.fn>;
  };
  let access: AdministrationAccess;
  let lock: AdministrationLockService;
  let http: HttpTestingController;

  beforeEach(() => {
    donor = signal<Donor | null>(ADMINISTRATOR);
    admin = signal(true);
    publicComputer = signal(false);
    vault = {
      administrationPasskeys: vi.fn(async () => ['Y3JlZGVudGlhbC0x']),
      unlockAdministrationWithPasskey: vi.fn(async () => true),
      unlockAdministrationWithPassword: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthStore,
          useValue: {
            donor: donor.asReadonly(),
            isAdmin: admin.asReadonly(),
            storesNothing: publicComputer.asReadonly(),
          },
        },
        { provide: DeviceVault, useValue: vault },
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

  it('when it was unlocked and locks again, then the lock reads locked', () => {
    access.unlock();
    expect(lock.locked()).toBe(false);

    access.lock();

    expect(lock.locked()).toBe(true);
  });
});
