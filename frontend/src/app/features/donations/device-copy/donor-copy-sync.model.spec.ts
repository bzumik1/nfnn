import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import fc from 'fast-check';
import { defer, Observable, of } from 'rxjs';
import { type DeviceAccount, userHandleOf } from '../../../core/auth/session-device';
import { TAB_LOCKS } from '../../../core/auth/session-tabs';
import { SmallArgon2Derivation } from '../../../core/device/crypto/testing/password-key-derivations';
import type { CopyContents } from '../../../core/device/store/account-store';
import type { DeviceStorage, StorageChange } from '../../../core/device/store/device-storage';
import {
  COPY_CHANNELS,
  DEVICE_STORAGE_OPENER,
  DeviceVault,
  PASSWORD_KEY_DERIVATION,
  STORAGE_PERSISTENCE,
} from '../../../core/device/store/device-vault';
import { MemoryDeviceStorage } from '../../../core/device/store/memory-device-storage';
import { ChannelBus, NamedLocks } from '../../../core/device/store/testing/fake-device';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import { ReceiptsApi } from '../receipt-pdf/receipts-api';
import { rowsSha256 } from '../sync/canonical-rows';
import { DonorCopySync, type SyncOutcome } from './donor-copy-sync';
import { type DonationRow, donorCopyView, summarizeDonations } from './donor-copy-view';
import { DonorSyncApi, type SyncChunk, type SyncChunks, type SyncManifest } from './donor-sync-api';

const JANA_ID = '0190c3a2-7b1e-7cc1-8a52-3f1e2d4c5b6a';
const PETR_ID = '0190c3a2-7b1e-7cc1-8a52-000000000002';
const JANA: DeviceAccount = { email: 'jana@example.cz', userHandle: userHandleOf(JANA_ID) };
const PETR: DeviceAccount = { email: 'petr@example.cz', userHandle: userHandleOf(PETR_ID) };
const ACCOUNTS = { [JANA_ID]: JANA, [PETR_ID]: PETR } as const;
const PASSWORDS = { [JANA_ID]: 'Kanárek 2026', [PETR_ID]: 'Stehlík 2026' } as const;
type AccountId = typeof JANA_ID | typeof PETR_ID;
const YEARS = [2024, 2025, 2026] as const;

interface Gift {
  readonly id: string;
  readonly year: number;
  readonly amountMinor: number;
  readonly status: 'RECEIVED' | 'REFUNDED';
}

class ServerModel {
  gifts: Gift[] = [];
  subject: string;
  wrongSummary = false;
  changeBeforeChunks = false;
  private next = 1;

  constructor(readonly donor: AccountId) {
    this.subject = donor;
  }

  add(year: number, amountMinor: number): void {
    this.gifts.push({
      id: `gift-${this.donor}-${this.next++}`,
      year,
      amountMinor,
      status: 'RECEIVED',
    });
  }

  refund(index: number): void {
    if (this.gifts.length > 0) {
      const at = index % this.gifts.length;
      this.gifts[at] = { ...this.gifts[at], status: 'REFUNDED' };
    }
  }

  remove(index: number): void {
    if (this.gifts.length > 0) {
      this.gifts.splice(index % this.gifts.length, 1);
    }
  }

  async chunks(): Promise<SyncChunk[]> {
    const chunks: SyncChunk[] = [];
    for (const year of YEARS) {
      const rows = this.gifts
        .filter((gift) => gift.year === year)
        .sort((first, second) => (first.id < second.id ? 1 : -1))
        .map(rowOf);
      if (rows.length > 0) {
        chunks.push({
          id: `donations:${year}`,
          rowsSha256: await rowsSha256(rows),
          count: rows.length,
          rows,
        });
      }
    }
    return chunks;
  }

  summary(): unknown {
    const figures = summarizeDonations(this.gifts.map(rowOf));
    return {
      ...figures,
      totalAmountMinor: figures.totalAmountMinor + (this.wrongSummary ? 1 : 0),
      yearlyReceiptsAvailableThrough: 2025,
      receiptsAvailableFrom: 2026,
      bankDataAsOf: '2026-11-05T09:00:00Z',
    };
  }
}

function rowOf(gift: Gift): DonationRow {
  return {
    id: gift.id,
    receivedAt: `${gift.year}-06-01`,
    amountMinor: gift.amountMinor,
    currency: 'CZK',
    status: gift.status,
    source: 'BANK_TRANSFER',
    purpose: 'GENERAL',
    pairedBy: 'VARIABLE_SYMBOL',
    bankAccountId: null,
    symbolClaimId: null,
  };
}

class ModelSyncApi {
  constructor(private readonly serverOf: () => ServerModel) {}

  private get server(): ServerModel {
    return this.serverOf();
  }

  manifest(): Observable<SyncManifest> {
    return defer(async () => ({
      subject: this.server.subject,
      summary: this.server.summary(),
      chunks: (await this.server.chunks()).map(({ id, rowsSha256: digest, count }) => ({
        id,
        rowsSha256: digest,
        count,
      })),
    }));
  }

  chunks(ids: readonly string[]): Observable<SyncChunks> {
    return defer(async () => {
      if (this.server.changeBeforeChunks) {
        this.server.changeBeforeChunks = false;
        this.server.add(2026, 777);
      }
      const all = await this.server.chunks();
      return {
        subject: this.server.subject,
        summary: this.server.summary(),
        chunks: all.filter((entry) => ids.includes(entry.id)),
        missing: ids.filter((id) => !all.some((entry) => entry.id === id)),
      };
    });
  }
}

class Disk implements DeviceStorage {
  readonly kind = 'indexed-db' as const;
  inner = new MemoryDeviceStorage();
  crashNextWrite = false;

  deviceSalt() {
    return this.inner.deviceSalt();
  }
  entries() {
    return this.inner.entries();
  }
  sessionKey(copyId: string) {
    return this.inner.sessionKey(copyId);
  }
  records(copyId: string) {
    return this.inner.records(copyId);
  }
  drafts(copyId: string) {
    return this.inner.drafts(copyId);
  }
  async write(change: StorageChange): Promise<void> {
    if (this.crashNextWrite) {
      this.crashNextWrite = false;
      throw new DOMException('The tab closed during the write', 'AbortError');
    }
    return this.inner.write(change);
  }
  destroy() {
    return this.inner.destroy();
  }
  close(): void {
    return undefined;
  }
}

type Command =
  | { readonly kind: 'add'; readonly year: number; readonly amountMinor: number }
  | { readonly kind: 'refund'; readonly index: number }
  | { readonly kind: 'remove'; readonly index: number }
  | { readonly kind: 'sync'; readonly changeBeforeChunks: boolean; readonly full: boolean }
  | { readonly kind: 'crash' }
  | { readonly kind: 'evict' }
  | { readonly kind: 'reload' }
  | { readonly kind: 'wrong-summary' }
  | { readonly kind: 'another-donor' }
  | { readonly kind: 'switch-account' };

const commands: fc.Arbitrary<Command> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant('add' as const),
      year: fc.constantFrom(...YEARS),
      amountMinor: fc.integer({ min: 1, max: 1_000_000 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('refund' as const), index: fc.nat() }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('remove' as const), index: fc.nat() }) },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant('sync' as const),
      changeBeforeChunks: fc.boolean(),
      full: fc.boolean(),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'crash' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'evict' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'reload' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'wrong-summary' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'another-donor' as const }) },
  { weight: 2, arbitrary: fc.constant({ kind: 'switch-account' as const }) },
);

function chunkIdsOf(contents: CopyContents | null): string[] {
  return (contents?.chunks ?? []).map((chunk) => `${chunk.id}@${chunk.rowsSha256}`);
}

function giftIdsOf(contents: CopyContents | null): string[] {
  return (contents?.chunks ?? []).flatMap((chunk) =>
    (chunk.rows as readonly { readonly id: string }[]).map((row) => row.id),
  );
}

describe('Given a model of the donor copy kept on a device while the server changes', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('when syncs, crashes mid-write, evictions, reloads, a wrong summary, another donor’s answers and a second account signing in on the device come in any order, then each copy only ever holds its own donor’s gifts as a whole sync stored them and ends as a fresh download', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(commands, { minLength: 1, maxLength: 20 }), async (steps) => {
        TestBed.resetTestingModule();
        const servers = {
          [JANA_ID]: new ServerModel(JANA_ID),
          [PETR_ID]: new ServerModel(PETR_ID),
        };
        let current: AccountId = JANA_ID;
        let server = servers[current];
        const disk = new Disk();
        const reporter = { report: vi.fn() };
        const bus = new ChannelBus();
        TestBed.configureTestingModule({
          providers: [
            { provide: DEVICE_STORAGE_OPENER, useValue: async () => disk },
            { provide: PASSWORD_KEY_DERIVATION, useValue: new SmallArgon2Derivation() },
            { provide: COPY_CHANNELS, useValue: bus.factory },
            { provide: STORAGE_PERSISTENCE, useValue: () => undefined },
            { provide: TAB_LOCKS, useValue: new NamedLocks() },
            { provide: ErrorReporter, useValue: reporter },
            { provide: DonorSyncApi, useValue: new ModelSyncApi(() => server) },
            { provide: ReceiptsApi, useValue: { image: () => of() } },
          ],
        });
        localStorage.clear();
        let tab = null as EnvironmentInjector | null;
        let vault!: DeviceVault;
        let sync!: DonorCopySync;
        let evicted = false;
        const contents = (): CopyContents | null => vault.opened()?.store.contents() ?? null;
        const freshIds = async (): Promise<string[]> =>
          chunkIdsOf({ chunks: await server.chunks(), summary: null, storedAt: '' });

        async function startTab(signIn = false): Promise<void> {
          tab?.destroy();
          tab = createEnvironmentInjector(
            [DeviceVault, DonorCopySync],
            TestBed.inject(EnvironmentInjector),
          );
          vault = tab.get(DeviceVault);
          sync = tab.get(DonorCopySync);
          if (!signIn) {
            await vault.restored(ACCOUNTS[current]);
          }
          if (vault.opened() === null) {
            await vault.signedIn(ACCOUNTS[current], {
              kind: 'password',
              password: PASSWORDS[current],
            });
            underPassword[current] = true;
          }
          TestBed.tick();
          await sync.sync();
          evicted = false;
        }

        async function switchAccount(): Promise<void> {
          if (!underPassword[current]) {
            heldBy[current] = [];
          }
          await vault.signedOut(ACCOUNTS[current]);
          current = current === JANA_ID ? PETR_ID : JANA_ID;
          server = servers[current];
          await vault.signedIn(ACCOUNTS[current], {
            kind: 'password',
            password: PASSWORDS[current],
          });
          underPassword[current] = true;
          expect(chunkIdsOf(contents())).toEqual(heldBy[current]);
          evicted = false;
          TestBed.tick();
          await sync.sync();
        }

        const heldBy: Record<AccountId, string[]> = { [JANA_ID]: [], [PETR_ID]: [] };
        const underPassword: Record<AccountId, boolean> = { [JANA_ID]: false, [PETR_ID]: false };
        await startTab(true);
        let held = chunkIdsOf(contents());

        for (const step of steps) {
          switch (step.kind) {
            case 'add':
              server.add(step.year, step.amountMinor);
              break;
            case 'refund':
              server.refund(step.index);
              break;
            case 'remove':
              server.remove(step.index);
              break;
            case 'wrong-summary':
              server.wrongSummary = !server.wrongSummary;
              break;
            case 'another-donor':
              server.subject = server.subject === server.donor ? 'another-donor' : server.donor;
              break;
            case 'switch-account':
              disk.crashNextWrite = false;
              heldBy[current] = evicted ? [] : held;
              await switchAccount();
              held = chunkIdsOf(contents());
              break;
            case 'crash':
              disk.crashNextWrite = true;
              break;
            case 'evict':
              disk.inner = new MemoryDeviceStorage();
              evicted = true;
              heldBy[JANA_ID] = [];
              heldBy[PETR_ID] = [];
              underPassword[JANA_ID] = false;
              underPassword[PETR_ID] = false;
              break;
            case 'reload':
              disk.crashNextWrite = false;
              await startTab();
              held = chunkIdsOf(contents());
              break;
            case 'sync': {
              server.changeBeforeChunks = step.changeBeforeChunks;
              const before = chunkIdsOf(contents());
              const crashing = disk.crashNextWrite;
              const outcome: SyncOutcome = await (step.full ? sync.reload() : sync.sync());
              server.changeBeforeChunks = false;
              const after = chunkIdsOf(contents());
              const writes = server.subject === server.donor && !evicted;
              if (!writes) {
                expect(outcome).toBe(
                  evicted && server.subject === server.donor ? 'no-copy' : 'mismatch',
                );
                expect(evicted ? [before, []] : [before]).toContainEqual(after);
              } else if (crashing) {
                expect(outcome).toBe('failed');
                expect(after).toEqual(before);
                disk.crashNextWrite = false;
              } else {
                expect(outcome).toBe(server.wrongSummary ? 'mismatch' : 'stored');
                expect(after).toEqual(await freshIds());
              }
              held = after;
              break;
            }
          }
          expect(chunkIdsOf(contents())).toEqual(held);
          expect(giftIdsOf(contents()).every((id) => id.startsWith(`gift-${current}-`))).toBe(true);
        }

        for (const model of Object.values(servers)) {
          model.subject = model.donor;
          model.wrongSummary = false;
        }
        disk.crashNextWrite = false;
        if (evicted) {
          await startTab();
        }
        for (let account = 0; account < 2; account++) {
          expect(await sync.sync()).toBe('stored');
          expect(chunkIdsOf(contents())).toEqual(await freshIds());
          expect(contents()?.summary).toEqual(server.summary());
          expect(donorCopyView(contents())?.agrees).toBe(true);
          heldBy[current] = chunkIdsOf(contents());
          if (account === 0) {
            await switchAccount();
          }
        }
        expect(
          reporter.report.mock.calls.every(([kind]) =>
            ['device-copy-mismatch', 'device-store-evicted'].includes(kind as string),
          ),
        ).toBe(true);
        tab?.destroy();
      }),
      { numRuns: 100 },
    );
  }, 120_000);
});
