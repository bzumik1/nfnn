import { signal } from '@angular/core';
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
import { Connectivity } from '../../../../core/navigation/connectivity';
import {
  DonorCopyDownload,
  type DownloadOutcome,
} from '../../../donations/device-copy/donor-copy-download';
import { DeviceDataCard } from './device-data-card';

const DONOR = sampleDonor();

function normalized(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function openedWith(contents: CopyContents | null): OpenedCopy {
  return {
    store: { copyId: 'copy-1', contents: signal(contents) } as unknown as AccountStore,
    reason: 'sign-in',
  };
}

describe('Given the card "Data v tomto zařízení"', () => {
  let fixture: ComponentFixture<DeviceDataCard>;
  let vault: {
    mode: ReturnType<typeof signal<VaultMode | null>>;
    opened: ReturnType<typeof signal<OpenedCopy | null>>;
    forget: ReturnType<typeof vi.fn>;
  };
  let download: {
    downloading: ReturnType<typeof signal<boolean>>;
    reload: ReturnType<typeof vi.fn>;
  };
  let reload: (outcome: DownloadOutcome) => void;
  let logout: ReturnType<typeof vi.fn>;
  let offline: boolean;

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
    offline = false;
    vault = {
      mode: signal<VaultMode | null>('stored'),
      opened: signal<OpenedCopy | null>(null),
      forget: vi.fn(async () => undefined),
    };
    download = {
      downloading: signal(false),
      reload: vi.fn(() => new Promise<DownloadOutcome>((resolve) => (reload = resolve))),
    };
    logout = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      imports: [DeviceDataCard],
      providers: [
        provideRouter([]),
        { provide: DeviceVault, useValue: vault },
        { provide: DonorCopyDownload, useValue: download },
        { provide: AuthStore, useValue: { donor: signal(DONOR), logout } },
        { provide: Connectivity, useValue: { isOffline: () => offline } },
      ],
    });
    fixture = TestBed.createComponent(DeviceDataCard);
    await settle();
  });

  it('when the copy is stored, then the card says when it was last updated and that sign-out locks it', async () => {
    vault.opened.set(openedWith({ chunks: [], summary: {}, storedAt: '2026-11-05T09:30:00Z' }));
    await settle();

    expect(state()).toBe('Uloženo v zařízení · aktualizováno 05. 11. 2026 10:30');
    expect(normalized(root().querySelector('.device-data-about')?.textContent)).toContain(
      'Po odhlášení zůstane zamčená vaším heslem nebo přístupovým klíčem',
    );
  });

  it('when the first download is still running, then the card says the data are being saved', async () => {
    vault.opened.set(openedWith(null));
    download.downloading.set(true);
    await settle();

    expect(state()).toBe('Data se ukládají do zařízení…');
  });

  it('when nothing is stored yet, then the card says so', () => {
    expect(state()).toBe('V tomto zařízení zatím nic uloženo není.');
  });

  it('when the copy lives only in memory, then the card says nothing is stored and does not claim an encrypted copy', async () => {
    vault.mode.set('memory');
    vault.opened.set(openedWith(null));
    await settle();

    expect(state()).toContain('V tomto prohlížeči se nic neukládá.');
    expect(root().querySelector('.device-data-about')).toBeNull();
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
  });

  it('when the device is offline and the donor asks to load the data again, then the card says it needs a connection and asks nothing', async () => {
    offline = true;

    button('Načíst data znovu').click();
    await settle();

    expect(download.reload).not.toHaveBeenCalled();
    const offlineLine = root().querySelector('#device-data-offline');
    expect(normalized(offlineLine?.textContent)).toBe('Potřebuje připojení.');
    expect(button('Načíst data znovu').getAttribute('aria-describedby')).toBe(
      'device-data-offline',
    );
  });

  describe('when the donor asks to delete the data on this device', () => {
    beforeEach(async () => {
      button('Smazat data z tohoto zařízení').click();
      await settle();
    });

    it('then a dialog says the data go from this device, the donor is signed out here and the server keeps everything', () => {
      const dialog = document.querySelector('dialog')!;

      expect(normalized(dialog.querySelector('h2')?.textContent)).toBe(
        'Smazat data z tohoto zařízení?',
      );
      expect(normalized(dialog.querySelector('.ui-dialog__lead')?.textContent)).toBe(
        'Vaše dary a údaje se z tohoto zařízení smažou a odhlásíme vás tady. Na serveru zůstává vše, jak je.',
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

      button('Smazat a odhlásit').click();
      await settle();

      await vi.waitFor(() => expect(TestBed.inject(SignedOutNotice).shown()).toBe(true));
      expect(order).toEqual(['forget', 'logout']);
      expect(vault.forget).toHaveBeenCalledWith(deviceAccountOf(DONOR));
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('and confirms while the deletion runs, then both dialog buttons are disabled and the confirmation names the deletion', async () => {
      vault.forget.mockImplementation(() => new Promise(() => undefined));

      button('Smazat a odhlásit').click();
      await settle();

      expect(button('Mažeme data…').disabled).toBe(true);
      expect(button('Zrušit').disabled).toBe(true);
    });
  });
});
