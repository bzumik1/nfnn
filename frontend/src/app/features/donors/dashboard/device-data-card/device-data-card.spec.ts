import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth-store';
import { deviceAccountOf } from '../../../../core/auth/session-device';
import { SignedOutNotice } from '../../../../core/auth/signed-out-notice';
import { sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import type { AccountStore, CopyContents } from '../../../../core/device/store/account-store';
import {
  DeviceVault,
  type OpenedCopy,
  type VaultMode,
} from '../../../../core/device/store/device-vault';
import { Connectivity } from '../../../../core/connectivity/connectivity';
import { DonorCopySync, type SyncOutcome } from '../../../donations/device-copy/donor-copy-sync';
import { DeviceDataCard } from './device-data-card';

const DONOR = sampleDonor();

function normalized(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function openedWith(contents: CopyContents | null): OpenedCopy {
  return {
    store: { copyId: 'copy-1', contents: signal(contents) } as unknown as AccountStore,
    reason: 'sign-in',
    account: deviceAccountOf(DONOR),
  };
}

describe('Given the card "Data v tomto zařízení"', () => {
  let fixture: ComponentFixture<DeviceDataCard>;
  let vault: {
    mode: ReturnType<typeof signal<VaultMode | null>>;
    opened: ReturnType<typeof signal<OpenedCopy | null>>;
    locked: ReturnType<typeof signal<boolean>>;
    forget: ReturnType<typeof vi.fn>;
  };
  let download: {
    syncing: ReturnType<typeof signal<boolean>>;
    reload: ReturnType<typeof vi.fn>;
  };
  let reload: (outcome: SyncOutcome) => void;
  let logout: ReturnType<typeof vi.fn>;
  let offline: WritableSignal<boolean>;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function button(text: string): HTMLButtonElement {
    const found = Array.from(document.querySelectorAll('button')).find(
      (candidate) => normalized(candidate.textContent) === text,
    );
    if (found === undefined) {
      throw new Error(`No button ${text}`);
    }
    return found;
  }

  function state(): string {
    return normalized(root().querySelector('.device-data-state')?.textContent);
  }

  async function settle(): Promise<void> {
    await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    offline = signal(false);
    vault = {
      mode: signal<VaultMode | null>('stored'),
      opened: signal<OpenedCopy | null>(null),
      locked: signal(false),
      forget: vi.fn(async () => undefined),
    };
    download = {
      syncing: signal(false),
      reload: vi.fn(() => new Promise<SyncOutcome>((resolve) => (reload = resolve))),
    };
    logout = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      imports: [DeviceDataCard],
      providers: [
        provideRouter([]),
        { provide: DeviceVault, useValue: vault },
        { provide: DonorCopySync, useValue: download },
        { provide: AuthStore, useValue: { donor: signal(DONOR), logout } },
        { provide: Connectivity, useValue: { offline } },
      ],
    });
    fixture = TestBed.createComponent(DeviceDataCard);
    await settle();
  });

  it('when the copy is stored, then the card says when it was last updated, what it holds, that the server is unaffected and when sign-out keeps it', async () => {
    vault.opened.set(openedWith({ chunks: [], summary: {}, storedAt: '2026-11-05T09:30:00Z' }));
    await settle();

    expect(state()).toBe('Uloženo v zařízení · aktualizováno 5. 11. 2026 10:30');
    expect(normalized(root().querySelector('.device-data-about')?.textContent)).toBe(
      'Kopie vašich darů, potvrzení a bankovních účtů se v tomto prohlížeči ukládá zašifrovaně a klíč k ní zná jen toto zařízení. Na serveru se tím nic nemění. Když jste se přihlásili heslem, zůstane kopie po odhlášení zamčená tímto heslem. Po přihlášení přístupovým klíčem zůstane jen tehdy, když to váš klíč umí; jinak se odhlášením smaže.',
    );
  });

  it('when the stored time is shown, then the date and the time each stay whole but may wrap apart', async () => {
    vault.opened.set(openedWith({ chunks: [], summary: {}, storedAt: '2026-11-05T09:30:00Z' }));
    await settle();

    const parts = Array.from(root().querySelectorAll('.device-data-time')).map((part) =>
      normalized(part.textContent),
    );
    expect(parts).toEqual(['5. 11. 2026', '10:30']);
  });

  it('when a copy on this device stays locked, then the card says how it opens and offers no reload', async () => {
    vault.locked.set(true);
    await settle();

    expect(state()).toBe(
      'Kopie v tomto zařízení je zamčená, protože toto přihlášení ji odemknout nemůže. Otevře se, až se odhlásíte a znovu přihlásíte heslem nebo přístupovým klíčem, kterým se tu obvykle přihlašujete.',
    );
    expect(root().querySelector('.device-data-reload')).toBeNull();
    expect(button('Smazat data z tohoto zařízení').disabled).toBe(false);
  });

  it('when the first download is still running, then the card says the data are being saved', async () => {
    vault.opened.set(openedWith(null));
    download.syncing.set(true);
    await settle();

    expect(state()).toBe('Data se ukládají do zařízení…');
  });

  it('when nothing is stored yet, then the card says so', () => {
    expect(state()).toBe('V tomto zařízení zatím nic uloženo není.');
  });

  it('when the copy lives only in memory, then the card says nothing is stored, the server keeps everything, and offers no deletion', async () => {
    vault.mode.set('memory');
    vault.opened.set(openedWith(null));
    await settle();

    expect(state()).toBe(
      'V tomto prohlížeči se nic neukládá. Kopie vašich darů je jen v paměti této stránky a po jejím zavření zmizí; na serveru zůstává vše.',
    );
    expect(root().querySelector('.device-data-about')).toBeNull();
    expect(root().querySelector('.device-data-delete')).toBeNull();
  });

  describe('when the donor asks to load the data again', () => {
    beforeEach(async () => {
      button('Načíst data znovu').click();
      await settle();
    });

    it('then the button names the download and is disabled while it runs', () => {
      const running = button('Načítáme data…');

      expect(running.disabled).toBe(true);
      expect(download.reload).toHaveBeenCalledTimes(1);
    });

    it('and the data are stored, then a status line says so', async () => {
      reload('stored');
      await settle();

      expect(normalized(root().querySelector('[role="status"]:not(:empty)')?.textContent)).toBe(
        'Data jsou načtená znovu.',
      );
      expect(button('Načíst data znovu').disabled).toBe(false);
    });

    it('and the download fails, then an alert says what to do next', async () => {
      reload('failed');
      await settle();

      expect(normalized(root().querySelector('[role="alert"]:not(:empty)')?.textContent)).toBe(
        'Data se nepodařilo načíst. Zkontrolujte připojení a zkuste to prosím znovu.',
      );
    });

    it('and the copy is closed meanwhile, then the alert does not blame the connection', async () => {
      reload('no-copy');
      await settle();

      expect(normalized(root().querySelector('[role="alert"]:not(:empty)')?.textContent)).toBe(
        'Data se nepodařilo načíst. Zkuste to prosím za chvíli znovu, a když to nepůjde, napište nám na info@nfnn.cz a přiložte diagnostický soubor z části Když web nefunguje.',
      );
    });

    it('and the data do not match the server’s summary, then the alert says they could not be checked, which a stored time beside it does not contradict', async () => {
      reload('mismatch');
      await settle();

      expect(normalized(root().querySelector('[role="alert"]:not(:empty)')?.textContent)).toBe(
        'Data ze serveru se nepodařilo ověřit. Zkuste je prosím za chvíli načíst znovu, a když to nepůjde, napište nám na info@nfnn.cz a přiložte diagnostický soubor z části Když web nefunguje.',
      );
    });
  });

  it('when the device is offline and the donor asks to load the data again, then the button says it needs a connection and nothing is asked', async () => {
    offline.set(true);
    await settle();

    const reloadButton = button('Načíst data znovu');
    reloadButton.click();
    await settle();

    expect(download.reload).not.toHaveBeenCalled();
    expect(reloadButton.getAttribute('aria-disabled')).toBe('true');
    const hint = document.getElementById(reloadButton.getAttribute('aria-describedby') ?? '');
    expect(normalized(hint?.textContent)).toBe('Potřebuje připojení');
  });

  describe('when the donor asks to delete the data on this device', () => {
    beforeEach(async () => {
      button('Smazat data z tohoto zařízení').click();
      await settle();
    });

    it('then a dialog says the copy goes from this device, the donor is signed out here, the server keeps everything and the copy comes back at the next sign-in', () => {
      const dialog = document.querySelector('dialog')!;

      expect(normalized(dialog.querySelector('h2')?.textContent)).toBe(
        'Smazat data z tohoto zařízení?',
      );
      expect(normalized(dialog.querySelector('.ui-dialog__lead')?.textContent)).toBe(
        'Kopie vašich darů, potvrzení a bankovních účtů se z tohoto zařízení smaže a odhlásíme vás. Na serveru zůstane vše, jak je; po dalším přihlášení se kopie stáhne znovu.',
      );
      expect(vault.forget).not.toHaveBeenCalled();
    });

    it('and cancels, then nothing is deleted and the dialog closes', async () => {
      button('Zrušit').click();
      await settle();

      expect(document.querySelector('dialog')).toBeNull();
      expect(vault.forget).not.toHaveBeenCalled();
    });

    it('and confirms, then the copy is deleted first, the donor is signed out and goes home with the signed-out notice', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      const order: string[] = [];
      vault.forget.mockImplementation(async () => void order.push('forget'));
      logout.mockImplementation(() => {
        order.push('logout');
        return of(undefined);
      });

      button('Smazat data a odhlásit').click();
      await settle();

      await vi.waitFor(() => expect(TestBed.inject(SignedOutNotice).shown()).toBe(true));
      expect(TestBed.inject(SignedOutNotice).reason()).toBe('device-data-deleted');
      expect(order).toEqual(['forget', 'logout']);
      expect(vault.forget).toHaveBeenCalledWith(deviceAccountOf(DONOR));
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('and confirms while the deletion runs, then both dialog buttons are disabled and the confirmation names the deletion', async () => {
      vault.forget.mockImplementation(() => new Promise(() => undefined));

      button('Smazat data a odhlásit').click();
      await settle();

      expect(button('Mažeme data…').disabled).toBe(true);
      expect(button('Zrušit').disabled).toBe(true);
      expect(document.querySelector<HTMLButtonElement>('.dialog-close')?.disabled).toBe(true);
    });

    it('and the deletion fails, then the dialog stays open with an alert, the donor stays signed in and may try again', async () => {
      vault.forget.mockRejectedValueOnce(new Error('QuotaExceededError'));

      button('Smazat data a odhlásit').click();
      await settle();

      await vi.waitFor(() =>
        expect(
          normalized(document.querySelector('dialog [role="alert"]:not(:empty)')?.textContent),
        ).toBe(
          'Data z tohoto zařízení se nepodařilo smazat. Zkuste to prosím znovu. Když to nepůjde, smažte data webu nfnn.cz v nastavení prohlížeče.',
        ),
      );
      expect(logout).not.toHaveBeenCalled();
      expect(TestBed.inject(SignedOutNotice).shown()).toBe(false);
      expect(button('Smazat data a odhlásit').disabled).toBe(false);
      expect(button('Zrušit').disabled).toBe(false);
      await vi.waitFor(() => expect(document.activeElement).toBe(button('Smazat data a odhlásit')));
    });
  });
});
