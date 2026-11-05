import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type DeviceAccount, userHandleOf } from '../../../core/auth/session-device';
import type { AccountStore, CopyContents } from '../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import { rowsSha256 } from '../../donations/sync/canonical-rows';
import { AdministrationCopyDownload } from './administration-copy-download';

const ADMIN_ID = '0190c3a2-7b1e-7cc1-8a52-3f1e2d4c5b6a';
const JANA: DeviceAccount = {
  email: 'jana@example.cz',
  userHandle: userHandleOf(ADMIN_ID),
  administrator: true,
};
const PAYMENTS = [{ id: 'payment-1', counterpartyName: 'Petr Svoboda' }];
const ACCOUNTS = [{ donorId: 'donor-1', name: 'Petr Svoboda' }];
const SUMMARY = { today: '2026-11-05', byYear: [] };

class FakeVault {
  readonly opened = signal<OpenedCopy | null>(null);
  readonly administration = this.opened.asReadonly();
  readonly stored: CopyContents[] = [];
  readonly revoked: DeviceAccount[] = [];
  storesOnDevice = true;

  stores = () => this.storesOnDevice;
  withCopyLock = <T>(_store: AccountStore, work: () => Promise<T>) => work();
  replaceContents = async (_store: AccountStore, contents: CopyContents) => {
    this.stored.push(contents);
    return true;
  };
  administrationRevoked = async (account: DeviceAccount) => {
    this.revoked.push(account);
  };

  open(reason: OpenedCopy['reason']): void {
    this.opened.set({ store: { copyId: 'copy-1' } as AccountStore, reason, account: JANA });
  }
}

describe('Given the download of the administration into its copy on this device', () => {
  let vault: FakeVault;
  let http: HttpTestingController;
  let download: AdministrationCopyDownload;
  let reporter: { report: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vault = new FakeVault();
    reporter = { report: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DeviceVault, useValue: vault },
        { provide: ErrorReporter, useValue: reporter },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    download = TestBed.inject(AdministrationCopyDownload);
  });

  afterEach(() => http.verify());

  async function flush(): Promise<void> {
    TestBed.tick();
    for (let round = 0; round < 20; round++) {
      await new Promise((resolve) => setTimeout(resolve));
    }
  }

  async function answer(url: string, body: object): Promise<void> {
    const request = await vi.waitFor(() => http.expectOne((asked) => asked.url === url), {
      timeout: 2000,
    });
    request.flush(body);
    await flush();
  }

  async function manifests(administrator = true): Promise<void> {
    await answer('/api/admin/donations/sync', {
      subject: ADMIN_ID,
      administrator,
      summary: SUMMARY,
      chunks: administrator
        ? [{ id: 'payments:2026-11', rowsSha256: await rowsSha256(PAYMENTS), count: 1 }]
        : [],
    });
    if (administrator) {
      await answer('/api/admin/donors/sync', {
        subject: ADMIN_ID,
        administrator,
        chunks: [{ id: 'accounts:2026-11', rowsSha256: await rowsSha256(ACCOUNTS), count: 1 }],
      });
    }
  }

  async function chunks(): Promise<void> {
    await answer('/api/admin/donations/sync/chunks', {
      subject: ADMIN_ID,
      administrator: true,
      summary: SUMMARY,
      chunks: [
        {
          id: 'payments:2026-11',
          rowsSha256: await rowsSha256(PAYMENTS),
          count: 1,
          rows: PAYMENTS,
        },
      ],
      missing: [],
    });
    await answer('/api/admin/donors/sync/chunks', {
      subject: ADMIN_ID,
      administrator: true,
      chunks: [
        {
          id: 'accounts:2026-11',
          rowsSha256: await rowsSha256(ACCOUNTS),
          count: 1,
          rows: ACCOUNTS,
        },
      ],
      missing: [],
    });
  }

  describe('when an empty copy opens on a device that stores it', () => {
    beforeEach(async () => {
      vault.open('empty');
      await flush();
    });

    it('then the server first records that this device stores a copy, and only then is it downloaded', async () => {
      const record = http.expectOne('/api/admin/donors/devices/current/administration-copy');
      expect(record.request.method).toBe('POST');
      expect(http.match('/api/admin/donations/sync')).toHaveLength(0);
      record.flush(null, { status: 204, statusText: 'No Content' });
      await flush();

      await manifests();
      expect(download.firstDownload()).toEqual({ done: 0, total: 2 });
      await chunks();

      expect(vault.stored).toHaveLength(1);
      expect(vault.stored[0].chunks.map((chunk) => chunk.id)).toEqual([
        'donations/payments:2026-11',
        'donors/accounts:2026-11',
      ]);
      expect(vault.stored[0].summary).toEqual({ donations: SUMMARY });
      expect(download.firstDownload()).toBeNull();
    });

    it('and the record fails, then nothing is downloaded', async () => {
      http
        .expectOne('/api/admin/donors/devices/current/administration-copy')
        .flush(null, { status: 503, statusText: 'Unavailable' });
      await flush();

      expect(http.match(() => true)).toHaveLength(0);
      expect(vault.stored).toEqual([]);
    });

    it('and the server says the account is no longer an administrator, then the copy of the administration is cleared', async () => {
      http
        .expectOne('/api/admin/donors/devices/current/administration-copy')
        .flush(null, { status: 204, statusText: 'No Content' });
      await flush();

      await manifests(false);

      expect(vault.revoked).toEqual([JANA]);
      expect(vault.stored).toEqual([]);
    });
  });

  describe('when a copy already stored opens again after unlocking', () => {
    beforeEach(async () => {
      vault.open('unlocked');
      await flush();
    });

    it('then it is refreshed without a new record and without the first-download bar', async () => {
      await manifests();
      expect(download.firstDownload()).toBeNull();
      await chunks();

      expect(http.match('/api/admin/donors/devices/current/administration-copy')).toHaveLength(0);
      expect(vault.stored).toHaveLength(1);
    });

    it('and a chunk does not match its digest twice, then nothing is stored and the mismatch is reported', async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        await manifests();
        await answer('/api/admin/donations/sync/chunks', {
          subject: ADMIN_ID,
          administrator: true,
          summary: SUMMARY,
          chunks: [{ id: 'payments:2026-11', rowsSha256: 'f'.repeat(64), count: 1, rows: [] }],
          missing: [],
        });
      }

      expect(vault.stored).toEqual([]);
      expect(reporter.report).toHaveBeenCalledWith('device-copy-mismatch', 'global');
    });

    it('and the server refuses with 403, then the copy is kept as it is', async () => {
      http
        .expectOne('/api/admin/donations/sync')
        .flush(
          { type: 'https://nfnn.cz/problems/auth/forbidden', status: 403 },
          { status: 403, statusText: 'Forbidden' },
        );
      await flush();

      expect(vault.revoked).toEqual([]);
      expect(vault.stored).toEqual([]);
    });
  });

  describe('when an empty copy opens on a public computer, which keeps it only in memory', () => {
    it('then no record is made, since nothing is stored on the device', async () => {
      vault.storesOnDevice = false;
      vault.open('empty');
      await flush();

      expect(http.match('/api/admin/donors/devices/current/administration-copy')).toHaveLength(0);
      await manifests();
      await chunks();
      expect(vault.stored).toHaveLength(1);
    });
  });
});
