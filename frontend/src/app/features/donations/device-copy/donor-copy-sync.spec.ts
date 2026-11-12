import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../../core/auth/auth-store';
import type { Donor } from '../../../core/auth/donor';
import { deviceAccountOf } from '../../../core/auth/session-device';
import { sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import type { AccountStore, CopyContents } from '../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import { DiagnosticEvents } from '../../../core/diagnostics/diagnostic-events';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import { sharedCases } from '../../../../testing/shared-cases';
import { rowsSha256 } from '../sync/canonical-rows';
import { DonorCopyLink } from './donor-copy';
import {
  CATCH_UP_PAUSE_MS,
  copyProfileOf,
  DonorCopySync,
  REBUILD_PAUSE_MS,
  SYNC_REQUEST_TIMEOUT_MS,
} from './donor-copy-sync';
import { type DonationRow, summarizeDonations } from './donor-copy-view';
import type { SyncChunk } from './donor-sync-api';

const DONOR_ID = '01a18e56-bdb0-775a-bd0a-a60756831369';
const JANA = deviceAccountOf({ id: DONOR_ID, email: 'jana@example.cz' });
const PETR_ID = '01a18e56-bdb0-775a-bd0a-000000000002';
const RECEIPT_YEARS = { yearlyReceiptsAvailableThrough: 2025, receiptsAvailableFrom: 2026 };
const SIGNATURE = new TextEncoder().encode('signature of the signatory');
const PORTRAIT = new TextEncoder().encode('portrait of the signatory');

class FakeStore {
  readonly copyId = 'copy-1';
  readonly contents = signal<CopyContents | null>(null);
  persisted: CopyContents | null = null;
  damaged = false;
  loads = 0;

  async load(): Promise<'empty' | 'loaded' | 'damaged'> {
    this.loads++;
    if (this.damaged) {
      this.contents.set(null);
      return 'damaged';
    }
    this.contents.set(this.persisted);
    return this.persisted === null ? 'empty' : 'loaded';
  }
}

class FakeVault {
  readonly opened = signal<OpenedCopy | null>(null);
  readonly mode = signal<'stored' | 'memory' | null>('stored');
  readonly stored: CopyContents[] = [];
  readonly locked: string[] = [];
  accepts = true;

  async withCopyLock<T>(store: AccountStore, work: () => Promise<T>): Promise<T> {
    this.locked.push(store.copyId);
    return work();
  }

  async replaceContents(store: AccountStore, contents: CopyContents): Promise<boolean> {
    if (!this.accepts) {
      return false;
    }
    this.stored.push(contents);
    const fake = store as unknown as FakeStore;
    fake.persisted = contents;
    fake.contents.set(contents);
    return true;
  }
}

function gift(id: string, receivedAt: string, amountMinor: number): DonationRow {
  return {
    id,
    receivedAt,
    amountMinor,
    currency: 'CZK',
    status: 'RECEIVED',
    source: 'BANK_TRANSFER',
    purpose: 'GENERAL',
    pairedBy: 'VARIABLE_SYMBOL',
    bankAccountId: null,
    symbolClaimId: null,
  };
}

async function chunk(id: string, rows: readonly unknown[]): Promise<SyncChunk> {
  return { id, rowsSha256: await rowsSha256(rows), count: rows.length, rows };
}

function summaryOf(chunks: readonly SyncChunk[], bankDataAsOf = '2026-10-20T09:00:00Z'): unknown {
  const rows = chunks
    .filter((entry) => entry.id.startsWith('donations:'))
    .flatMap((entry) => entry.rows) as DonationRow[];
  return { ...summarizeDonations(rows), ...RECEIPT_YEARS, bankDataAsOf };
}

async function hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function activeReceipt(signature: string, portrait: string, status = 'ACTIVE'): unknown {
  return {
    id: `receipt-${signature.slice(0, 4)}-${status}`,
    status,
    kind: 'YEARLY',
    number: '000001',
    donationId: null,
    year: 2025,
    issuedAt: '2026-01-02T08:00:00Z',
    supersededAt: null,
    receipt: {
      signatory: { signatureImage: { sha256: signature }, portraitImage: { sha256: portrait } },
    },
  };
}

describe('Given the sync of the donor copy', () => {
  let http: HttpTestingController;
  let vault: FakeVault;
  let store: FakeStore;
  let reporter: { report: ReturnType<typeof vi.fn> };
  let sync: DonorCopySync;
  let gifts2025: SyncChunk;
  let gifts2026: SyncChunk;
  let signedIn: ReturnType<typeof signal<Donor | null>>;
  let session: ReturnType<typeof signal<string | null>>;
  let acceptedAt: ReturnType<typeof signal<string | null>>;
  let fromDevice: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    signedIn = signal<Donor | null>(null);
    session = signal<string | null>(null);
    acceptedAt = signal<string | null>(null);
    fromDevice = signal(false);
    vault = new FakeVault();
    store = new FakeStore();
    reporter = { report: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DeviceVault, useValue: vault },
        { provide: ErrorReporter, useValue: reporter },
        {
          provide: AuthStore,
          useValue: {
            donor: signedIn.asReadonly(),
            session: session.asReadonly(),
            sessionAcceptedAt: acceptedAt.asReadonly(),
            fromDevice: fromDevice.asReadonly(),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    sync = TestBed.inject(DonorCopySync);
    gifts2025 = await chunk('donations:2025', [gift('gift-1', '2025-04-01', 50_000)]);
    gifts2026 = await chunk('donations:2026', [gift('gift-2', '2026-03-15', 100_000)]);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  function answerManifest(
    chunks: readonly SyncChunk[],
    summary: unknown = summaryOf(chunks),
    subject = DONOR_ID,
  ): void {
    http.expectOne('/api/donations/me/sync').flush(manifestOf(chunks, summary, subject));
  }

  function manifestOf(
    chunks: readonly SyncChunk[],
    summary: unknown = summaryOf(chunks),
    subject = DONOR_ID,
  ): object {
    return {
      subject,
      summary,
      chunks: chunks.map(({ id, rowsSha256: digest, count }) => ({
        id,
        rowsSha256: digest,
        count,
      })),
    };
  }

  async function answerChunks(
    asked: readonly string[],
    chunks: readonly SyncChunk[],
    options: { summary?: unknown; missing?: string[]; subject?: string } = {},
  ): Promise<void> {
    const request = await vi.waitFor(() =>
      http.expectOne((candidate) => candidate.url === '/api/donations/me/sync/chunks'),
    );
    expect(request.request.params.get('ids')).toBe(asked.join(','));
    request.flush({
      subject: options.subject ?? DONOR_ID,
      summary: options.summary ?? summaryOf(chunks),
      chunks,
      missing: options.missing ?? [],
    });
  }

  async function holding(chunks: readonly SyncChunk[]): Promise<void> {
    store.persisted = {
      chunks: chunks.map(({ id, rowsSha256: digest, rows }) => ({ id, rowsSha256: digest, rows })),
      summary: summaryOf(chunks, '2026-10-19T09:00:00Z'),
      storedAt: '2026-10-19T10:00:00Z',
    };
    store.contents.set(store.persisted);
  }

  function open(reason: OpenedCopy['reason'] = 'restored'): void {
    vault.opened.set({ store: store as unknown as AccountStore, reason, account: JANA });
    TestBed.tick();
  }

  async function settled(): Promise<void> {
    await vi.waitFor(() => expect(sync.syncing()).toBe(false));
  }

  it('when a new empty copy opens, then every chunk of the manifest is downloaded and stored under the copy lock while the first sync shows', async () => {
    open('empty');

    await vi.waitFor(() => expect(sync.firstSync()).toBe(true));
    await vi.waitFor(() => answerManifest([gifts2025, gifts2026]));
    await answerChunks(['donations:2025', 'donations:2026'], [gifts2025, gifts2026]);
    await settled();

    expect(vault.locked).toEqual(['copy-1']);
    expect(vault.stored).toHaveLength(1);
    expect(vault.stored[0].chunks.map((stored) => stored.id)).toEqual([
      'donations:2025',
      'donations:2026',
    ]);
    expect(sync.firstSync()).toBe(false);
    expect(sync.view()?.items.map((item) => item.id)).toEqual(['gift-2', 'gift-1']);
  });

  it('when the signed-in donor owns the copy, then the stored contents carry their profile, so the copy can show the account without the server', async () => {
    const jana = sampleDonor({ id: DONOR_ID, email: 'jana@example.cz' });
    signedIn.set(jana);
    open('empty');

    await vi.waitFor(() => answerManifest([gifts2025]));
    await answerChunks(['donations:2025'], [gifts2025]);
    await settled();

    expect(vault.stored[0].profile).toEqual({
      id: jana.id,
      type: jana.type,
      name: jana.name,
      email: jana.email,
      roles: jana.roles,
      address: jana.address,
      companyIdentifier: jana.companyIdentifier,
      variableSymbol: jana.variableSymbol,
    });
  });

  it('when the profile is stored, then it keeps only what the account shows without the server and never a pending address, the second factor or the dates', async () => {
    signedIn.set(
      sampleDonor({
        id: DONOR_ID,
        pendingEmailChange: { newEmail: 'nova@example.cz', expiresAt: '2026-11-13T10:00:00Z' },
      }),
    );
    open('empty');

    await vi.waitFor(() => answerManifest([gifts2025]));
    await answerChunks(['donations:2025'], [gifts2025]);
    await settled();

    expect(Object.keys(vault.stored[0].profile as object).sort()).toEqual([
      'address',
      'companyIdentifier',
      'email',
      'id',
      'name',
      'roles',
      'type',
      'variableSymbol',
    ]);
  });

  it('when the owner is signed in with a remembered session, then the stored contents carry its kind and the time the server last accepted it', async () => {
    signedIn.set(sampleDonor({ id: DONOR_ID, email: 'jana@example.cz' }));
    session.set('REMEMBERED');
    acceptedAt.set('2026-11-12T07:55:00.000Z');
    open('empty');

    await vi.waitFor(() => answerManifest([gifts2025]));
    await answerChunks(['donations:2025'], [gifts2025]);
    await settled();

    expect(vault.stored[0].session).toEqual({
      kind: 'REMEMBERED',
      acceptedAt: '2026-11-12T07:55:00.000Z',
    });
  });

  it('when another donor is signed in while the copy syncs, then the stored contents keep the session the copy had', async () => {
    const kept = { kind: 'REMEMBERED', acceptedAt: '2026-11-10T08:00:00.000Z' };
    await holding([gifts2025]);
    store.persisted = { ...store.persisted!, session: kept };
    store.contents.set(store.persisted);
    signedIn.set(sampleDonor({ id: PETR_ID, email: 'petr@example.cz' }));
    session.set('BROWSER');
    acceptedAt.set('2026-11-12T07:55:00.000Z');
    open('restored');

    await vi.waitFor(() => answerManifest([gifts2025, gifts2026]));
    await answerChunks(['donations:2026'], [gifts2025, gifts2026]);
    await settled();

    expect(vault.stored[0].session).toEqual(kept);
  });

  it('when the copy was opened without the server, then it asks the server nothing until the session is accepted again', async () => {
    await holding([gifts2025]);
    signedIn.set(sampleDonor({ id: DONOR_ID, email: 'jana@example.cz' }));
    fromDevice.set(true);
    open('offline');

    expect(await sync.sync()).toBe('failed');
    http.expectNone('/api/donations/me/sync');
    expect(vault.stored).toHaveLength(0);
  });

  it('when nobody is signed in while the copy syncs, then the stored contents keep the profile the copy had', async () => {
    const kept = copyProfileOf(sampleDonor({ id: DONOR_ID, name: 'Jana z kopie' }));
    await holding([gifts2025]);
    store.persisted = { ...store.persisted!, profile: kept };
    store.contents.set(store.persisted);
    open('restored');

    await vi.waitFor(() => answerManifest([gifts2025, gifts2026]));
    await answerChunks(['donations:2026'], [gifts2025, gifts2026]);
    await settled();

    expect(vault.stored[0].profile).toEqual(kept);
  });

  it("when the owner signs in under a changed name, then the stored contents take the new profile over the copy's older one", async () => {
    await holding([gifts2025]);
    store.persisted = {
      ...store.persisted!,
      profile: copyProfileOf(sampleDonor({ id: DONOR_ID, name: 'Jana Stará' })),
    };
    store.contents.set(store.persisted);
    signedIn.set(sampleDonor({ id: DONOR_ID, name: 'Jana Nová' }));
    open('restored');

    await vi.waitFor(() => answerManifest([gifts2025, gifts2026]));
    await answerChunks(['donations:2026'], [gifts2025, gifts2026]);
    await settled();

    expect((vault.stored[0].profile as { name: string }).name).toBe('Jana Nová');
  });

  it('when the signed-in donor is not the one whose copy is open, then the stored contents keep the profile the copy had and take none of theirs', async () => {
    const kept = copyProfileOf(
      sampleDonor({ id: DONOR_ID, email: 'jana@example.cz', name: 'Jana z kopie' }),
    );
    await holding([gifts2025]);
    store.persisted = { ...store.persisted!, profile: kept };
    store.contents.set(store.persisted);
    signedIn.set(sampleDonor({ id: PETR_ID, email: 'petr@example.cz' }));
    open('restored');

    await vi.waitFor(() => answerManifest([gifts2025, gifts2026]));
    await answerChunks(['donations:2026'], [gifts2025, gifts2026]);
    await settled();

    expect(vault.stored[0].profile).toEqual(kept);
  });

  it('when a copy opens, then the sync names the donor whose copy it is, and none once it closes', async () => {
    expect(sync.owner()).toBeNull();
    await holding([gifts2025]);
    open('restored');

    expect(sync.owner()).toBe(JANA.userHandle);
    await vi.waitFor(() => answerManifest([gifts2025]));
    await settled();
    vault.opened.set(null);
    TestBed.tick();
    expect(sync.owner()).toBeNull();
  });

  it('when a restored copy opens, then only the chunks whose digest changed are asked for, the others are kept and the one no longer listed goes', async () => {
    const gifts2024 = await chunk('donations:2024', [gift('gift-0', '2024-12-31', 10_000)]);
    await holding([gifts2024, gifts2025, gifts2026]);
    const changed = await chunk('donations:2026', [
      gift('gift-3', '2026-06-01', 20_000),
      gift('gift-2', '2026-03-15', 100_000),
    ]);
    open('restored');

    await vi.waitFor(() => answerManifest([gifts2025, changed]));
    await answerChunks(['donations:2026'], [changed], { summary: summaryOf([gifts2025, changed]) });
    await settled();

    expect(vault.stored).toHaveLength(1);
    expect(vault.stored[0].chunks).toEqual([
      { id: 'donations:2025', rowsSha256: gifts2025.rowsSha256, rows: gifts2025.rows },
      { id: 'donations:2026', rowsSha256: changed.rowsSha256, rows: changed.rows },
    ]);
    expect(vault.stored[0].summary).toEqual(summaryOf([gifts2025, changed]));
  });

  it('when a copy that holds gifts syncs, then the first sync never shows', async () => {
    await holding([gifts2025]);
    open('restored');

    await vi.waitFor(() => expect(sync.syncing()).toBe(true));
    expect(sync.firstSync()).toBe(false);
    await vi.waitFor(() => answerManifest([gifts2025, gifts2026]));
    expect(sync.firstSync()).toBe(false);
    await answerChunks(['donations:2026'], [gifts2026], {
      summary: summaryOf([gifts2025, gifts2026]),
    });
    await settled();

    expect(sync.firstSync()).toBe(false);
  });

  it('when another tab stored the copy after this tab read it, then the sync loads it again under the lock and asks only for what changed since', async () => {
    await holding([gifts2025]);
    store.contents.set(null);
    open('restored');

    await vi.waitFor(() => answerManifest([gifts2025, gifts2026]));
    await answerChunks(['donations:2026'], [gifts2026], {
      summary: summaryOf([gifts2025, gifts2026]),
    });
    await settled();

    expect(store.loads).toBe(1);
    expect(vault.stored[0].chunks.map((stored) => stored.id)).toEqual([
      'donations:2025',
      'donations:2026',
    ]);
  });

  it('when the stored copy cannot be read, then every chunk is downloaded again', async () => {
    await holding([gifts2025, gifts2026]);
    store.damaged = true;
    open('restored');

    await vi.waitFor(() => answerManifest([gifts2025, gifts2026]));
    await answerChunks(['donations:2025', 'donations:2026'], [gifts2025, gifts2026]);
    await settled();

    expect(vault.stored).toHaveLength(1);
    expect(vault.stored[0].chunks.map((stored) => stored.id)).toEqual([
      'donations:2025',
      'donations:2026',
    ]);
  });

  it('when nothing changed, then no chunk is asked for and the copy is stored again with the manifest’s summary', async () => {
    await holding([gifts2025]);
    open('sign-in');

    await vi.waitFor(() => answerManifest([gifts2025]));
    await settled();

    http.expectNone('/api/donations/me/sync/chunks');
    expect(vault.stored[0].chunks).toEqual(store.persisted?.chunks);
    expect(vault.stored[0].summary).toEqual(summaryOf([gifts2025]));
  });

  it('when it starts, then the donor pages reach it through the link, and it says whether the device keeps the copy', () => {
    expect(TestBed.inject(DonorCopyLink).copy()).toBe(sync);
    expect(sync.keepsOnDevice()).toBe(true);

    vault.mode.set('memory');

    expect(sync.keepsOnDevice()).toBe(false);
  });

  it('when the manifest is empty, then an empty copy with its summary is stored and no chunk is asked for', async () => {
    open('empty');

    await vi.waitFor(() => answerManifest([]));
    await settled();

    http.expectNone('/api/donations/me/sync/chunks');
    expect(vault.stored[0].chunks).toEqual([]);
    expect(vault.stored[0].summary).toEqual(summaryOf([]));
  });

  it('when the manifest lists more than 64 changed chunks, then they are asked for in batches of 64', async () => {
    const many = await Promise.all(
      Array.from({ length: 65 }, (_, index) => chunk(`receipts:${2000 + index}`, [])),
    );
    open();
    const reloading = sync.reload();

    await vi.waitFor(() => answerManifest(many));
    await answerChunks(
      many.slice(0, 64).map((entry) => entry.id),
      many.slice(0, 64),
    );
    await answerChunks(
      many.slice(64).map((entry) => entry.id),
      many.slice(64),
    );

    expect(await reloading).toBe('stored');
    expect(vault.stored[0].chunks).toHaveLength(65);
  });

  it('when a chunk changed between the manifest and the chunks, then the sync starts again and stores the second answer', async () => {
    const changed = await chunk('donations:2026', [gift('gift-2', '2026-03-15', 120_000)]);
    open('empty');

    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [changed], { summary: summaryOf([gifts2026]) });
    await vi.waitFor(() => answerManifest([changed]));
    await answerChunks(['donations:2026'], [changed]);
    await settled();

    expect(vault.stored[0].chunks[0].rows).toEqual(changed.rows);
    expect(reporter.report).not.toHaveBeenCalled();
  });

  it('when the rows of a chunk do not give its digest, then the sync starts again', async () => {
    const forged: SyncChunk = { ...gifts2026, rows: [gift('gift-2', '2026-03-15', 999)] };
    open('empty');

    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [forged], { summary: summaryOf([gifts2026]) });
    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [gifts2026]);
    await settled();

    expect(vault.stored[0].chunks[0].rows).toEqual(gifts2026.rows);
  });

  it('when a chunk names another digest than the manifest although its rows give the manifest’s, then the sync starts again rather than store it under that digest', async () => {
    const renamed: SyncChunk = { ...gifts2026, rowsSha256: gifts2025.rowsSha256 };
    open('empty');

    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [renamed], { summary: summaryOf([gifts2026]) });
    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [gifts2026]);
    await settled();

    expect(vault.stored).toHaveLength(1);
    expect(vault.stored[0].chunks[0].rowsSha256).toBe(gifts2026.rowsSha256);
  });

  it('when an asked chunk is neither served nor listed as missing, twice, then nothing is stored and the mismatch is reported', async () => {
    open('empty');

    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [], { summary: summaryOf([gifts2026]) });
    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [], { summary: summaryOf([gifts2026]) });
    await settled();

    expect(vault.stored).toEqual([]);
    expect(reporter.report).toHaveBeenCalledTimes(1);
  });

  it('when a changed chunk comes back missing or with another summary twice, then nothing is stored and the mismatch is reported', async () => {
    open('empty');

    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [gifts2026], { summary: { other: true } });
    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [], { missing: ['donations:2026'] });
    await settled();

    expect(vault.stored).toEqual([]);
    expect(reporter.report).toHaveBeenCalledWith('device-copy-mismatch', 'global');
  });

  it('when a sync stores the copy and a later one cannot verify it, then the diagnostic file lists both outcomes and nothing of the data', async () => {
    open('empty');
    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [gifts2026]);
    await settled();

    const reloading = sync.reload();
    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [], { summary: summaryOf([gifts2026]) });
    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [], { summary: summaryOf([gifts2026]) });
    await reloading;

    const listed = TestBed.inject(DiagnosticEvents).listed();
    expect(listed.map(({ kind, detail }) => [kind, detail])).toEqual([
      ['copy-sync', 'stored'],
      ['copy-sync', 'mismatch'],
    ]);
    expect(JSON.stringify(listed)).not.toMatch(/gift-2|donations:2026|100000/);
  });

  it('when the manifest names another donor than the copy, then nothing is stored, and since the session changed rather than the data, nothing is reported', async () => {
    open();
    const reloading = sync.reload();

    await vi.waitFor(() => answerManifest([gifts2026], summaryOf([gifts2026]), PETR_ID));

    expect(await reloading).toBe('mismatch');
    expect(vault.stored).toEqual([]);
    expect(reporter.report).not.toHaveBeenCalled();
  });

  it('when the server does not answer in time, then the sync fails, so the copy lock is not held for ever', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      open();
      const reloading = sync.reload();
      await vi.waitFor(() => http.expectOne('/api/donations/me/sync'));

      await vi.advanceTimersByTimeAsync(SYNC_REQUEST_TIMEOUT_MS);

      expect(await reloading).toBe('failed');
      expect(vault.stored).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('when the chunks answer names another donor than the copy, then nothing is stored', async () => {
    open();
    const reloading = sync.reload();

    await vi.waitFor(() => answerManifest([gifts2026]));
    await answerChunks(['donations:2026'], [gifts2026], { subject: PETR_ID });

    expect(await reloading).toBe('mismatch');
    expect(vault.stored).toEqual([]);
  });

  it('when the server cannot be reached, then the sync fails and the copy stays as it was, unreported', async () => {
    await holding([gifts2025]);
    open();

    await vi.waitFor(() =>
      http.expectOne('/api/donations/me/sync').error(new ProgressEvent('error')),
    );
    await settled();

    expect(vault.stored).toEqual([]);
    expect(store.contents()?.chunks.map((entry) => entry.id)).toEqual(['donations:2025']);
    expect(reporter.report).not.toHaveBeenCalled();
  });

  it('when the copy was closed or deleted before the answer came, then the outcome says there is no copy', async () => {
    vault.accepts = false;
    open();
    const reloading = sync.reload();

    await vi.waitFor(() => answerManifest([]));

    expect(await reloading).toBe('no-copy');
  });

  it('when no copy is open, then nothing is asked for', async () => {
    expect(await sync.reload()).toBe('no-copy');
    expect(await sync.sync()).toBe('no-copy');
  });

  it('when the donor asks to load the data again, then every chunk is asked for even though the copy holds them', async () => {
    await holding([gifts2025]);
    open();
    await vi.waitFor(() => answerManifest([gifts2025]));
    await settled();
    const reloading = sync.reload();

    await vi.waitFor(() => answerManifest([gifts2025]));
    await answerChunks(['donations:2025'], [gifts2025]);

    expect(await reloading).toBe('stored');
  });

  it('when more syncs are asked for while one runs, then one more runs after it, as a full download if one of them asked for it', async () => {
    await holding([gifts2025]);
    open();
    const first = sync.sync();
    const running = await vi.waitFor(() => http.expectOne('/api/donations/me/sync'));
    const second = sync.sync();
    const third = sync.reload();

    running.flush(manifestOf([gifts2025]));
    expect(await first).toBe('stored');
    await vi.waitFor(() => answerManifest([gifts2025]));
    await answerChunks(['donations:2025'], [gifts2025]);

    expect(await second).toBe('stored');
    expect(await third).toBe('stored');
    http.expectNone('/api/donations/me/sync');
  });

  it('when the donor area catches up while a sync runs, then it waits for that sync instead of asking again', async () => {
    await holding([gifts2025]);
    open();
    const running = await vi.waitFor(() => http.expectOne('/api/donations/me/sync'));

    const caughtUp = sync.catchUp();
    running.flush(manifestOf([gifts2025]));

    expect(await caughtUp).toBe('stored');
    http.expectNone('/api/donations/me/sync');
  });

  it('when the donor area catches up right after a sync, then nothing is asked for', async () => {
    await holding([gifts2025]);
    open();
    await vi.waitFor(() => answerManifest([gifts2025]));
    await settled();

    expect(await sync.catchUp()).toBe('stored');
    http.expectNone('/api/donations/me/sync');
  });

  it('when the donor area catches up later, then it syncs again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await holding([gifts2025]);
    open();
    await vi.waitFor(() => answerManifest([gifts2025]));
    await settled();
    vi.setSystemTime(Date.now() + CATCH_UP_PAUSE_MS);

    const catching = sync.catchUp();
    await vi.waitFor(() => answerManifest([gifts2025]));

    expect(await catching).toBe('stored');
  });

  for (const sharedCase of sharedCases('sync/manifest.json')) {
    describe(`Given the shared case ${sharedCase.name}`, () => {
      it('when a new empty copy syncs against the manifest and chunks the server answers for it, then it stores exactly those chunks and summary and agrees with them', async () => {
        const { subject, summary, chunks } = sharedCase.expected;
        const account = deviceAccountOf({ id: subject, email: 'jana@example.cz' });
        vault.opened.set({ store: store as unknown as AccountStore, reason: 'empty', account });
        TestBed.tick();

        await vi.waitFor(() =>
          http.expectOne('/api/donations/me/sync').flush(manifestOf(chunks, summary, subject)),
        );
        if (chunks.length > 0) {
          await answerChunks(
            chunks.map((entry) => entry.id),
            chunks,
            { summary, subject },
          );
        }
        await settled();

        expect(vault.stored).toHaveLength(1);
        expect(vault.stored[0].chunks).toEqual(
          chunks.map(({ id, rowsSha256: digest, rows }) => ({ id, rowsSha256: digest, rows })),
        );
        expect(vault.stored[0].summary).toEqual(summary);
        expect(sync.view()?.agrees).toBe(true);
        expect(reporter.report).not.toHaveBeenCalled();
      });
    });
  }

  describe('Given a copy whose gifts do not give the figures of its summary', () => {
    let wrong: unknown;

    beforeEach(() => {
      wrong = { ...(summaryOf([gifts2026]) as object), totalAmountMinor: 1 };
    });

    it('when it syncs, then it downloads the whole copy again once, and when that does not agree either, reports it once', async () => {
      await holding([gifts2026]);
      open();

      await vi.waitFor(() => answerManifest([gifts2026], wrong));
      await vi.waitFor(() => answerManifest([gifts2026], wrong));
      await answerChunks(['donations:2026'], [gifts2026], { summary: wrong });
      await settled();

      expect(vault.stored).toHaveLength(2);
      expect(reporter.report).toHaveBeenCalledTimes(1);
      expect(reporter.report).toHaveBeenCalledWith('device-copy-mismatch', 'global');
    });

    it('when it syncs again within the hour, then it neither downloads the whole copy nor reports again', async () => {
      await holding([gifts2026]);
      open();
      await vi.waitFor(() => answerManifest([gifts2026], wrong));
      await vi.waitFor(() => answerManifest([gifts2026], wrong));
      await answerChunks(['donations:2026'], [gifts2026], { summary: wrong });
      await settled();

      const again = sync.sync();
      await vi.waitFor(() => answerManifest([gifts2026], wrong));

      expect(await again).toBe('mismatch');
      expect(reporter.report).toHaveBeenCalledTimes(1);
    });

    it('when it syncs again after the hour, then it downloads the whole copy again', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      await holding([gifts2026]);
      open();
      await vi.waitFor(() => answerManifest([gifts2026], wrong));
      await vi.waitFor(() => answerManifest([gifts2026], wrong));
      await answerChunks(['donations:2026'], [gifts2026], { summary: wrong });
      await settled();
      vi.setSystemTime(Date.now() + REBUILD_PAUSE_MS);

      const again = sync.sync();
      await vi.waitFor(() => answerManifest([gifts2026], wrong));
      await vi.waitFor(() => answerManifest([gifts2026], wrong));
      await answerChunks(['donations:2026'], [gifts2026], { summary: wrong });

      expect(await again).toBe('mismatch');
      expect(reporter.report).toHaveBeenCalledTimes(2);
    });

    it('when the whole download agrees, then the rebuilt copy is kept and nothing is reported', async () => {
      await holding([gifts2026]);
      open();

      await vi.waitFor(() => answerManifest([gifts2026], wrong));
      await vi.waitFor(() => answerManifest([gifts2026]));
      await answerChunks(['donations:2026'], [gifts2026]);
      await settled();

      expect(sync.view()?.agrees).toBe(true);
      expect(reporter.report).not.toHaveBeenCalled();
    });
  });

  describe('Given an issued receipt in the copy', () => {
    let signature: string;
    let portrait: string;

    beforeEach(async () => {
      signature = await hex(SIGNATURE);
      portrait = await hex(PORTRAIT);
    });

    function image(bytes: Uint8Array, mediaType: string): (request: TestRequest) => void {
      return (request) => {
        const buffer = new ArrayBuffer(bytes.length);
        new Uint8Array(buffer).set(bytes);
        request.flush(buffer, { headers: { 'Content-Type': mediaType } });
      };
    }

    async function answerImages(
      answers: Readonly<Record<string, (request: TestRequest) => void>>,
    ): Promise<void> {
      const left = new Map(Object.entries(answers));
      while (left.size > 0) {
        const requests = await vi.waitFor(() => {
          const found = http.match((candidate) =>
            candidate.url.startsWith('/api/donations/me/receipt-images/'),
          );
          expect(found).not.toHaveLength(0);
          return found;
        });
        for (const request of requests) {
          const answer = left.get(request.request.url.split('/').pop() ?? '');
          expect(answer).toBeDefined();
          left.delete(request.request.url.split('/').pop() ?? '');
          answer?.(request);
        }
      }
    }

    it('when it syncs, then the signature and the portrait of the active receipt are downloaded and kept in the copy', async () => {
      const receipts = await chunk('receipts:2025', [activeReceipt(signature, portrait)]);
      open('empty');

      await vi.waitFor(() => answerManifest([receipts]));
      await answerChunks(['receipts:2025'], [receipts]);
      await answerImages({
        [portrait]: image(PORTRAIT, 'image/jpeg'),
        [signature]: image(SIGNATURE, 'image/png'),
      });
      await settled();

      expect(vault.stored[0].images?.map((image) => [image.sha256, image.mediaType])).toEqual(
        [
          [portrait, 'image/jpeg'],
          [signature, 'image/png'],
        ].sort(([first], [second]) => first.localeCompare(second)),
      );
    });

    it('when an image does not give its digest or cannot be downloaded, then it is not kept and the copy is stored anyway', async () => {
      const receipts = await chunk('receipts:2025', [activeReceipt(signature, portrait)]);
      open('empty');

      await vi.waitFor(() => answerManifest([receipts]));
      await answerChunks(['receipts:2025'], [receipts]);
      await answerImages({
        [portrait]: image(SIGNATURE, 'image/jpeg'),
        [signature]: (request) => request.error(new ProgressEvent('error')),
      });
      await settled();

      expect(vault.stored[0].images).toBeUndefined();
      expect(vault.stored[0].chunks).toHaveLength(1);
    });

    it('when the images are kept already, then they are not downloaded again, and when their receipt is replaced, they go', async () => {
      const receipts = await chunk('receipts:2025', [activeReceipt(signature, portrait)]);
      open('empty');
      await vi.waitFor(() => answerManifest([receipts]));
      await answerChunks(['receipts:2025'], [receipts]);
      await answerImages({
        [portrait]: image(PORTRAIT, 'image/jpeg'),
        [signature]: image(SIGNATURE, 'image/png'),
      });
      await settled();

      const again = sync.sync();
      await vi.waitFor(() => answerManifest([receipts]));
      expect(await again).toBe('stored');
      expect(vault.stored[1].images).toHaveLength(2);

      const replaced = await chunk('receipts:2025', [
        activeReceipt(signature, portrait, 'REPLACED'),
      ]);
      const later = sync.sync();
      await vi.waitFor(() => answerManifest([replaced]));
      await answerChunks(['receipts:2025'], [replaced]);

      expect(await later).toBe('stored');
      expect(vault.stored[2].images).toBeUndefined();
    });
  });
});
