import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import type { Donor } from '../../../core/auth/donor';
import { PasskeyAuthenticator } from '../../../core/auth/passkey-authenticator';
import { sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { AdministrationLockPanel } from './administration-lock-panel';
import { AdministrationLockService } from './administration-lock-service';

describe('Given the panel of the locked administration', () => {
  let fixture: ComponentFixture<AdministrationLockPanel>;
  let donor: ReturnType<typeof signal<Donor | null>>;
  let lock: {
    passkeyUnlocks: ReturnType<typeof vi.fn>;
    unlockWithPasskey: ReturnType<typeof vi.fn>;
    unlockWithPassword: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
  let logout: ReturnType<typeof vi.fn>;
  let online: boolean;

  async function render(options: { passkey: boolean; donor?: Partial<Donor> }): Promise<void> {
    donor = signal<Donor | null>(
      sampleDonor({
        roles: ['DONOR', 'ADMIN'],
        hasPassword: true,
        secondFactor: { enabled: true, neededForAdministration: false },
        ...options.donor,
      }),
    );
    lock = {
      passkeyUnlocks: vi.fn(async () => options.passkey),
      unlockWithPasskey: vi.fn(async () => true),
      unlockWithPassword: vi.fn(() => of(undefined)),
      signOut: vi.fn(async () => undefined),
    };
    logout = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      imports: [AdministrationLockPanel],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AdministrationLockService, useValue: lock },
        { provide: AuthStore, useValue: { donor: donor.asReadonly(), logout } },
        { provide: PasskeyAuthenticator, useValue: { supported: () => true } },
      ],
    });
    fixture = TestBed.createComponent(AdministrationLockPanel);
    document.body.appendChild(fixture.nativeElement);
    await settle();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function element(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function buttons(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button')).map((button) =>
      (button as HTMLElement).textContent!.replace(/\s+/g, ' ').trim(),
    );
  }

  function type(selector: string, value: string): void {
    const input = element(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  beforeEach(() => {
    online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  });

  afterEach(() => {
    fixture?.nativeElement.remove();
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
  });

  describe('when the device keeps the administration under a passkey', () => {
    beforeEach(() => render({ passkey: true }));

    it('then it says the administration is locked, why, and offers the passkey first, with the password beside it', () => {
      expect(element('h1')?.textContent?.trim()).toBe('Správa je zamčená');
      expect(element('.lock-lead')?.textContent).toContain('Zamykají se po 5 minutách');
      expect(buttons()).toEqual([
        'Odemknout přístupovým klíčem',
        'Použít heslo',
        'Odhlásit se z tohoto zařízení',
      ]);
    });

    it('then the focus moves to its heading, so a screen reader says at once that the administration locked', () => {
      expect(document.activeElement).toBe(element('h1'));
    });

    it('then nothing asks for the passkey until the button is pressed', () => {
      expect(lock.unlockWithPasskey).not.toHaveBeenCalled();
    });

    it('and the passkey is pressed, then the administration is unlocked with it', async () => {
      element('button.lock-passkey')!.click();
      await settle();

      expect(lock.unlockWithPasskey).toHaveBeenCalledOnce();
      expect(element('[role="alert"]')).toBeNull();
    });

    it('and the passkey does not open it, then it says so and offers the password', async () => {
      lock.unlockWithPasskey.mockResolvedValue(false);

      element('button.lock-passkey')!.click();
      await settle();

      expect(element('[role="alert"]')?.textContent).toContain('Přístupový klíč správu neodemkl');
    });

    it('and the device is offline, then it says that only the passkey works without a connection', async () => {
      online = false;
      window.dispatchEvent(new Event('offline'));
      await settle();

      expect(element('.lock-lead')?.textContent).toContain('Jste offline');
      expect(element('.lock-lead')?.textContent).toContain(
        'Přístupový klíč funguje i bez připojení.',
      );
      expect((element('button.lock-use-password') as HTMLButtonElement).disabled).toBe(true);
      expect((element('button.lock-passkey') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('when the device keeps the administration under a passkey and the account has no password with a code', () => {
    beforeEach(() =>
      render({
        passkey: true,
        donor: { secondFactor: { enabled: false, neededForAdministration: false } },
      }),
    );

    it('and the passkey does not open it, then it says so without offering a password that cannot unlock', async () => {
      lock.unlockWithPasskey.mockResolvedValue(false);

      element('button.lock-passkey')!.click();
      await settle();

      const alert = element('[role="alert"]')?.textContent ?? '';
      expect(alert).toContain('Přístupový klíč správu neodemkl');
      expect(alert).not.toContain('heslo');
    });
  });

  describe('when the device keeps the administration under the password only', () => {
    beforeEach(() => render({ passkey: false }));

    it('then the password is the main way to unlock', () => {
      expect(buttons()).toEqual(['Použít heslo', 'Odhlásit se z tohoto zařízení']);
      expect(element('button.lock-use-password')?.classList).toContain('ui-button--primary');
    });

    it('and the device is offline, then it says the password waits for a connection and promises no passkey', async () => {
      online = false;
      window.dispatchEvent(new Event('offline'));
      await settle();

      expect(element('.lock-lead')?.textContent).toContain('Jste offline');
      expect(element('.lock-lead')?.textContent).not.toContain('Přístupový klíč');
    });

    describe('and the password is chosen', () => {
      beforeEach(async () => {
        element('button.lock-use-password')!.click();
        await settle();
      });

      it('then the password and the code from the app are asked, with the account name for the password manager', () => {
        expect(element('h1')?.textContent?.trim()).toBe('Odemknout heslem');
        expect(element('#zamek-heslo')?.getAttribute('autocomplete')).toBe('current-password');
        expect(element('#zamek-kod')?.getAttribute('autocomplete')).toBe('one-time-code');
        expect((element('input[autocomplete="username"]') as HTMLInputElement).value).toBe(
          donor()!.email,
        );
        expect(document.activeElement).toBe(element('#zamek-heslo'));
      });

      it('and both are sent, then the server checks them and the panel clears the fields', async () => {
        type('#zamek-heslo', 'správné heslo');
        type('#zamek-kod', ' 482913 ');
        await settle();
        element('form')!.dispatchEvent(new Event('submit'));
        await settle();

        expect(lock.unlockWithPassword).toHaveBeenCalledWith('správné heslo', '482913');
        await settle();
        expect((element('#zamek-heslo') as HTMLInputElement).value).toBe('');
        expect((element('#zamek-kod') as HTMLInputElement).value).toBe('');
      });

      it('and the code is not six digits, then the field says so and nothing is sent', async () => {
        type('#zamek-heslo', 'správné heslo');
        type('#zamek-kod', '4829');
        element('form')!.dispatchEvent(new Event('submit'));
        await settle();

        expect(lock.unlockWithPassword).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain('Kód má přesně šest číslic.');
      });

      it('and the server refuses them, then its reason is shown', async () => {
        lock.unlockWithPassword.mockReturnValue(
          throwError(
            () =>
              new HttpErrorResponse({
                status: 400,
                error: {
                  type: 'https://nfnn.cz/problems/donors/second-factor-code-rejected',
                  title: 'Kód nesouhlasí',
                  detail: 'Opište prosím nový kód z aplikace.',
                  status: 400,
                },
              }),
          ),
        );
        type('#zamek-heslo', 'správné heslo');
        type('#zamek-kod', '000000');
        element('form')!.dispatchEvent(new Event('submit'));
        await settle();

        expect(element('[role="alert"]')?.textContent).toContain('Kód nesouhlasí');
      });

      it('and Zpět is pressed, then the first view comes back with the focus on its heading', async () => {
        element('button.lock-back')!.click();
        await settle();

        expect(element('h1')?.textContent?.trim()).toBe('Správa je zamčená');
        expect(document.activeElement).toBe(element('h1'));
      });
    });
  });

  describe('when neither a passkey on this device nor a password with a code can unlock it', () => {
    beforeEach(() =>
      render({
        passkey: false,
        donor: {
          hasPassword: false,
          secondFactor: { enabled: false, neededForAdministration: false },
        },
      }),
    );

    it('then it says to sign out and sign in again, and offers only signing out', async () => {
      expect(element('.lock-panel')?.textContent).toContain('Odhlaste se a přihlaste se znovu.');
      expect(buttons()).toEqual(['Odhlásit se z tohoto zařízení']);

      element('button.lock-sign-out')!.click();
      await settle();

      expect(lock.signOut).toHaveBeenCalledOnce();
    });
  });
});
