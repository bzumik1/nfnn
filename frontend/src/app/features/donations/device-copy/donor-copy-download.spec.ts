import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { deviceAccountOf } from '../../../core/auth/session-device';
import type { AccountStore, CopyContents } from '../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import { rowsSha256 } from '../sync/canonical-rows';
import { DonorCopyDownload } from './donor-copy-download';
import type { SyncChunk } from './donor-sync-api';

const SUMMARY = { totalMinor: 150_000, firstReceiptYear: 2026 };
const DONOR_ID = '01a18e56-bdb0-775a-bd0a-a60756831369';
const JANA = deviceAccountOf({ id: DONOR_ID, email: 'jana@example.cz' });
const PETR_ID = '01a18e56-bdb0-775a-bd0a-000000000002';

class FakeVault {
  readonly opened = signal<OpenedCopy | null>(null);
  readonly stored: CopyContents[] = [];
  readonly locked: string[] = [];
  accepts = true;

  async withCopyLock<T>(store: AccountStore, work: () => Promise<T>): Promise<T> {
    this.locked.push(store.copyId);
    return work();
  }

  async replaceContents(_store: AccountStore, contents: CopyContents): Promise<boolean> {
    if (this.accepts) {
      this.stored.push(contents);
    }
    return this.accepts;
  }
}

function fakeStore(load: 'empty' | 'loaded' = 'empty'): AccountStore {
  return { copyId: 'copy-1', load: async () => load } as unknown as AccountStore;
}

async function chunk(id: string, rows: readonly unknown[]): Promise<SyncChunk> {
  return { id, rowsSha256: await rowsSha256(rows), count: rows.length, rows };
}

describe('Given the download of the donor copy', () => {
  let http: HttpTestingController;
  let vault: FakeVault;
  let reporter: { report: ReturnType<typeof vi.fn> };
  let download: DonorCopyDownload;
  let gifts2025: SyncChunk;
  let gifts2026: SyncChunk;

  beforeEach(async () => {
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
    download = TestBed.inject(DonorCopyDownload);
    gifts2025 = await chunk('donations:2025', [{ amountMinor: 50_000 }]);
    gifts2026 = await chunk('donations:2026', [{ amountMinor: 100_000 }]);
  });

  afterEach(() => http.verify());

  function answerManifest(
    chunks: readonly SyncChunk[],
    summary: unknown = SUMMARY,
    subject = DONOR_ID,
  ): void {
    http.expectOne('/api/donations/me/sync').flush({
      subject,
      summary,
      chunks: chunks.map(({ id, rowsSha256: digest, count }) => ({
        id,
        rowsSha256: digest,
        count,
      })),
    });
  }

  async function answerChunks(
    chunks: readonly SyncChunk[],
    options: { summary?: unknown; missing?: string[]; subject?: string } = {},
  ): Promise<void> {
    const request = await vi.waitFor(() =>
      http.expectOne((candidate) => candidate.url === '/api/donations/me/sync/chunks'),
    );
    expect(request.request.params.get('ids')).toBe(
      [...chunks.map((entry) => entry.id), ...(options.missing ?? [])].join(','),
    );
    request.flush({
      subject: options.subject ?? DONOR_ID,
      summary: options.summary ?? SUMMARY,
      chunks,
      missing: options.missing ?? [],
    });
  }

  function reloadOpenCopy(): Promise<string> {
    vault.opened.set({ store: fakeStore('loaded'), reason: 'restored', account: JANA });
    TestBed.tick();
    return download.reload();
  }

  async function settled(): Promise<void> {
    await vi.waitFor(() => expect(download.downloading()).toBe(false));
  }

  it('when a new empty copy opens, then the manifest and its chunks are downloaded and stored under the copy lock', async () => {
    vault.opened.set({ store: fakeStore(), reason: 'empty', account: JANA });
    TestBed.tick();

    await vi.waitFor(() => answerManifest([gifts2025, gifts2026]));
    await answerChunks([gifts2025, gifts2026]);
    await settled();

    expect(vault.locked).toEqual(['copy-1']);
    expect(vault.stored).toHaveLength(1);
    expect(vault.stored[0].summary).toEqual(SUMMARY);
    expect(vault.stored[0].chunks.map((stored) => stored.id)).toEqual([
      'donations:2025',
      'donations:2026',
    ]);
  });

  it('when an empty copy opens that another tab has already filled, then nothing is downloaded', async () => {
    vault.opened.set({ store: fakeStore('loaded'), reason: 'empty', account: JANA });
    TestBed.tick();

    await settled();

    http.expectNone('/api/donations/me/sync');
    expect(vault.stored).toEqual([]);
  });

  it('when a copy is restored on a reload, then nothing is downloaded', async () => {
    vault.opened.set({ store: fakeStore('loaded'), reason: 'restored', account: JANA });
    TestBed.tick();

    http.expectNone('/api/donations/me/sync');
  });

  it('when the manifest lists more than 64 chunks, then they are asked for in batches of 64', async () => {
    const many = await Promise.all(
      Array.from({ length: 65 }, (_, index) => chunk(`receipts:${2000 + index}`, [])),
    );
    const reloading = reloadOpenCopy();

    await vi.waitFor(() => answerManifest(many));
    await answerChunks(many.slice(0, 64));
    await answerChunks(many.slice(64));

    expect(await reloading).toBe('stored');
    expect(vault.stored[0].chunks).toHaveLength(65);
  });

  it('when a chunk changed between the manifest and the chunks, then the download starts again and stores the second answer', async () => {
    const changed = await chunk('donations:2026', [{ amountMinor: 120_000 }]);
    const reloading = reloadOpenCopy();

    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks([changed]);
    await vi.waitFor(() => answerManifest([changed]));
    await answerChunks([changed]);

    expect(await reloading).toBe('stored');
    expect(vault.stored[0].chunks[0].rows).toEqual([{ amountMinor: 120_000 }]);
    expect(reporter.report).not.toHaveBeenCalled();
  });

  it('when the rows of a chunk do not give its digest, then the download starts again', async () => {
    const forged: SyncChunk = { ...gifts2026, rows: [{ amountMinor: 999 }] };
    const reloading = reloadOpenCopy();

    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks([forged]);
    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks([gifts2026]);

    expect(await reloading).toBe('stored');
  });

  it('when the summary of the chunks differs from the manifest, or a chunk is missing, then the download starts again', async () => {
    const reloading = reloadOpenCopy();

    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks([gifts2026], { summary: { ...SUMMARY, totalMinor: 1 } });
    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks([], { missing: ['donations:2026'] });

    expect(await reloading).toBe('mismatch');
  });

  it('when two attempts in a row do not agree, then nothing is stored and the mismatch is reported', async () => {
    const forged: SyncChunk = { ...gifts2026, rows: [] };
    const reloading = reloadOpenCopy();

    for (let attempt = 0; attempt < 2; attempt++) {
      await vi.waitFor(() => answerManifest([gifts2026]));
      await answerChunks([forged]);
    }

    expect(await reloading).toBe('mismatch');
    expect(vault.stored).toEqual([]);
    expect(reporter.report).toHaveBeenCalledWith('device-copy-mismatch', 'global');
  });

  it('when the manifest names another donor than the copy, then nothing is stored and the mismatch is reported', async () => {
    const reloading = reloadOpenCopy();

    await vi.waitFor(() => answerManifest([gifts2026], SUMMARY, PETR_ID));

    expect(await reloading).toBe('mismatch');
    expect(vault.stored).toEqual([]);
    expect(reporter.report).toHaveBeenCalledWith('device-copy-mismatch', 'global');
  });

  it('when the chunks answer names another donor than the copy, then nothing is stored', async () => {
    const reloading = reloadOpenCopy();

    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks([gifts2026], { subject: PETR_ID });

    expect(await reloading).toBe('mismatch');
    expect(vault.stored).toEqual([]);
  });

  it('when the manifest is empty, then an empty copy with its summary is stored and no chunk is asked for', async () => {
    const reloading = reloadOpenCopy();

    await vi.waitFor(() => answerManifest([]));

    expect(await reloading).toBe('stored');
    expect(vault.stored[0].chunks).toEqual([]);
  });

  it('when the server cannot be reached, then the download fails without storing or reporting', async () => {
    const reloading = reloadOpenCopy();

    await vi.waitFor(() =>
      http.expectOne('/api/donations/me/sync').error(new ProgressEvent('error')),
    );

    expect(await reloading).toBe('failed');
    expect(vault.stored).toEqual([]);
    expect(reporter.report).not.toHaveBeenCalled();
  });

  it('when the copy was closed or deleted before the answer came, then the outcome says there is no copy', async () => {
    vault.accepts = false;
    const reloading = reloadOpenCopy();

    await vi.waitFor(() => answerManifest([]));

    expect(await reloading).toBe('no-copy');
  });

  it('when no copy is open and the donor asks to load the data again, then nothing is asked for', async () => {
    expect(await download.reload()).toBe('no-copy');
  });

  it('when a copy is open and the donor asks to load the data again, then it is downloaded even though it holds data', async () => {
    vault.opened.set({ store: fakeStore('loaded'), reason: 'restored', account: JANA });
    TestBed.tick();
    const reloading = download.reload();

    await vi.waitFor(() => answerManifest([gifts2025]));
    await answerChunks([gifts2025]);

    expect(await reloading).toBe('stored');
  });
});
