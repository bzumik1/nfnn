import { TestBed } from '@angular/core/testing';
import type { DeviceAccount } from './core/auth/session-device';
import { DeviceVault } from './core/device/store/device-vault';
import { DonorCopySync } from './features/donations/device-copy/donor-copy-sync';
import { DeviceCopies } from './device-copies';

const JANA: DeviceAccount = { email: 'jana@example.cz', userHandle: 'AZDDonsefME' };

describe('Given the device copies of the app, loaded only when a session first needs them', () => {
  let vault: Record<string, ReturnType<typeof vi.fn>>;
  let downloads: number;
  let copies: DeviceCopies;

  beforeEach(() => {
    localStorage.clear();
    downloads = 0;
    vault = {
      prfInput: vi.fn(async () => new Uint8Array(32)),
      signedIn: vi.fn(async () => undefined),
      restored: vi.fn(async () => undefined),
      signedOut: vi.fn(async () => undefined),
      signedOutElsewhere: vi.fn(),
      sessionLost: vi.fn(async () => undefined),
      passwordChanged: vi.fn(async () => undefined),
      passwordRemoved: vi.fn(async () => undefined),
      passkeyAdded: vi.fn(async () => undefined),
      diagnostics: vi.fn(() => ({
        mode: 'stored',
        donorCopy: 'open',
        storedAge: 'under-1h',
        administrationCopy: 'none',
      })),
      connectionReturned: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: DeviceVault, useValue: vault },
        { provide: DonorCopySync, useFactory: () => ({ started: ++downloads }) },
      ],
    });
    copies = TestBed.inject(DeviceCopies);
  });

  it('when a donor signs in, then the vault receives the sign-in with its device secret and the download of the copy is started once', async () => {
    await copies.signedIn(JANA, { kind: 'password', password: 'heslo' }, false, 'd'.repeat(43));
    await copies.signedOut(JANA);

    expect(vault['signedIn']).toHaveBeenCalledWith(
      JANA,
      { kind: 'password', password: 'heslo' },
      false,
      'd'.repeat(43),
    );
    expect(vault['signedOut']).toHaveBeenCalledWith(JANA);
    expect(downloads).toBe(1);
  });

  it('when the sign-in dialog prepares the device, then the vault is loaded before any session starts, so a passkey ceremony gets its PRF input in time', async () => {
    copies.prepare();

    await vi.waitFor(() => expect(downloads).toBe(1));
    expect(await copies.prfInput()).toEqual(new Uint8Array(32));
    expect(downloads).toBe(1);
  });

  it('when a donor signs in or comes back on a public computer, then the vault is told to store nothing', async () => {
    await copies.signedIn(JANA, { kind: 'none' }, true);
    await copies.restored(JANA, true);

    expect(vault['signedIn']).toHaveBeenCalledWith(JANA, { kind: 'none' }, true, undefined);
    expect(vault['restored']).toHaveBeenCalledWith(JANA, true);
  });

  describe('when the code of the vault cannot be loaded', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: DeviceVault, useValue: vault },
          {
            provide: DonorCopySync,
            useFactory: () => {
              throw new TypeError('Failed to fetch dynamically imported module');
            },
          },
        ],
      });
      copies = TestBed.inject(DeviceCopies);
    });

    it('and a donor signs in with a passkey, then the PRF output is zeroed', async () => {
      const output = new Uint8Array(32).fill(9);
      const reading = { credentialId: 'Y3JlZA', userHandle: JANA.userHandle, output };

      await expect(copies.signedIn(JANA, { kind: 'prf', reading })).rejects.toThrow(TypeError);

      expect([...output].every((byte) => byte === 0)).toBe(true);
    });

    it('and a donor adds a passkey, then its PRF output is zeroed', async () => {
      const output = new Uint8Array(32).fill(9);

      await expect(
        copies.passkeyAdded(JANA, { credentialId: 'Y3JlZA', userHandle: JANA.userHandle, output }),
      ).rejects.toThrow(TypeError);

      expect([...output].every((byte) => byte === 0)).toBe(true);
    });
  });

  it('when the diagnostic file asks before any session needed a copy, then nothing is loaded and the state is unknown', async () => {
    expect(await copies.diagnostics()).toBeNull();
    expect(downloads).toBe(0);
  });

  it('when the diagnostic file asks after a session opened a copy, then it gets the state of the vault', async () => {
    await copies.restored(JANA);

    expect(await copies.diagnostics()).toEqual({
      mode: 'stored',
      donorCopy: 'open',
      storedAge: 'under-1h',
      administrationCopy: 'none',
    });
  });

  it('when another tab signs out before this tab needed a copy, then nothing is loaded', async () => {
    copies.signedOutElsewhere();
    await Promise.resolve();

    expect(vault['signedOutElsewhere']).not.toHaveBeenCalled();
    expect(downloads).toBe(0);
  });

  it('when another tab signs out after this tab opened a copy, then the vault closes it', async () => {
    await copies.restored(JANA);

    copies.signedOutElsewhere();

    await vi.waitFor(() => expect(vault['signedOutElsewhere']).toHaveBeenCalledTimes(1));
  });

  it('when the vault cannot give a PRF input, then the passkey sign-in goes on without one', async () => {
    vault['prfInput'].mockRejectedValue(new Error('no storage'));

    expect(await copies.prfInput()).toBeNull();
  });

  it('when the PRF input takes longer than the passkey prompt can wait, then the sign-in goes on without one', async () => {
    vi.useFakeTimers();
    try {
      vault['prfInput'].mockReturnValue(new Promise(() => undefined));

      const input = copies.prfInput();
      await vi.advanceTimersByTimeAsync(1500);

      expect(await input).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('when a session is lost and this device holds no copy, then nothing is loaded', async () => {
    await copies.sessionLost();

    expect(vault['sessionLost']).not.toHaveBeenCalled();
    expect(downloads).toBe(0);
  });

  it('when a session is lost and this device holds a copy, then the vault ends its sessions', async () => {
    localStorage.setItem('nfnn.device-copy', '1');

    await copies.sessionLost();

    expect(vault['sessionLost']).toHaveBeenCalledTimes(1);
  });

  it('when the connection returns before this tab needed a copy, then nothing is loaded', async () => {
    await copies.connectionReturned();

    expect(vault['connectionReturned']).not.toHaveBeenCalled();
    expect(downloads).toBe(0);
  });

  it('when the connection returns after this tab loaded the vault, then the vault asks again what it could not ask', async () => {
    await copies.restored(JANA);

    await copies.connectionReturned();

    expect(vault['connectionReturned']).toHaveBeenCalledTimes(1);
  });
});
