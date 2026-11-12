import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { firstValueFrom, type Observable, timeout } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import type { Donor } from '../../../core/auth/donor';
import { userHandleOf } from '../../../core/auth/session-device';
import { bytesToBase64Url } from '../../../core/device/crypto/device-bytes';
import type {
  AccountStore,
  CopyContents,
  StoredChunk,
  StoredImage,
} from '../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import { DiagnosticEvents } from '../../../core/diagnostics/diagnostic-events';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import { ReceiptsApi } from '../receipt-pdf/receipts-api';
import { canonicalRows, rowsSha256 } from '../sync/canonical-rows';
import { type DonorCopy, DonorCopyLink, type SyncOutcome } from './donor-copy';
import { donorCopyView, imageDigestsOf, issuedReceiptsOf } from './donor-copy-view';
import { DonorSyncApi, MAX_CHUNKS_PER_REQUEST, type SyncChunk } from './donor-sync-api';

export type { SyncOutcome } from './donor-copy';

export const SYNC_ATTEMPTS = 2;
export const REBUILD_PAUSE_MS = 60 * 60 * 1000;
export const CATCH_UP_PAUSE_MS = 30_000;
export const SYNC_REQUEST_TIMEOUT_MS = 30_000;

type Fetched = CopyContents | 'changed' | 'another-donor';

export type CopyProfile = Pick<
  Donor,
  'id' | 'type' | 'name' | 'email' | 'roles' | 'address' | 'companyIdentifier' | 'variableSymbol'
>;

export function copyProfileOf(donor: Donor): CopyProfile {
  return {
    id: donor.id,
    type: donor.type,
    name: donor.name,
    email: donor.email,
    roles: donor.roles,
    address: donor.address,
    companyIdentifier: donor.companyIdentifier,
    variableSymbol: donor.variableSymbol,
  };
}

interface QueuedSync {
  full: boolean;
  readonly promise: Promise<SyncOutcome>;
}

@Injectable({ providedIn: 'root' })
export class DonorCopySync implements DonorCopy {
  private readonly vault = inject(DeviceVault);
  private readonly auth = inject(AuthStore);
  private readonly api = inject(DonorSyncApi);
  private readonly receipts = inject(ReceiptsApi);
  private readonly reporter = inject(ErrorReporter);
  private readonly diagnostics = inject(DiagnosticEvents);
  private readonly running = signal(0);
  private queued: QueuedSync | null = null;
  private active: Promise<SyncOutcome> | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private lastRebuildAt: number | null = null;
  private lastReportAt: number | null = null;
  private readonly lastSyncedAt = new WeakMap<AccountStore, number>();

  readonly syncing = computed(() => this.running() > 0);
  readonly open = computed(() => this.vault.opened() !== null);
  readonly owner = computed(() => this.vault.opened()?.account.userHandle ?? null);
  readonly keepsOnDevice = computed(() => this.vault.mode() === 'stored');
  readonly view = computed(() => donorCopyView(this.vault.opened()?.store.contents() ?? null));
  readonly firstSync = computed(
    () => this.syncing() && this.open() && this.vault.opened()?.store.contents() === null,
  );

  constructor() {
    inject(DonorCopyLink).copy.set(this);
    effect(() => {
      if (this.vault.opened() !== null) {
        untracked(() => void this.sync());
      }
    });
  }

  sync(): Promise<SyncOutcome> {
    return this.schedule(false);
  }

  reload(): Promise<SyncOutcome> {
    return this.schedule(true);
  }

  catchUp(): Promise<SyncOutcome> {
    const pending = this.queued?.promise ?? this.active;
    if (pending !== null) {
      return pending;
    }
    const store = this.vault.opened()?.store;
    const syncedAt = store === undefined ? undefined : this.lastSyncedAt.get(store);
    if (syncedAt !== undefined && Date.now() - syncedAt < CATCH_UP_PAUSE_MS) {
      return Promise.resolve('stored');
    }
    return this.sync();
  }

  private schedule(full: boolean): Promise<SyncOutcome> {
    if (this.vault.opened() === null) {
      return Promise.resolve('no-copy');
    }
    const queued = this.queued;
    if (queued !== null) {
      queued.full ||= full;
      return queued.promise;
    }
    const entry: QueuedSync = {
      full,
      promise: this.tail.then(() => {
        if (this.queued === entry) {
          this.queued = null;
        }
        this.active = entry.promise;
        return this.recorded(this.runOnOpenCopy(entry.full)).finally(() => {
          if (this.active === entry.promise) {
            this.active = null;
          }
        });
      }),
    };
    this.queued = entry;
    this.tail = entry.promise.catch(() => undefined);
    return entry.promise;
  }

  private async recorded(outcome: Promise<SyncOutcome>): Promise<SyncOutcome> {
    const detail = await outcome;
    this.diagnostics.record({ kind: 'copy-sync', place: null, name: null, detail });
    return detail;
  }

  private async runOnOpenCopy(full: boolean): Promise<SyncOutcome> {
    const opened = this.vault.opened();
    if (opened === null) {
      return 'no-copy';
    }
    this.running.update((count) => count + 1);
    try {
      return await this.vault.withCopyLock(opened.store, () => this.synced(opened, full));
    } catch {
      return 'failed';
    } finally {
      this.running.update((count) => count - 1);
    }
  }

  private async synced(opened: OpenedCopy, full: boolean): Promise<SyncOutcome> {
    const store = opened.store;
    if ((await store.load()) === 'damaged') {
      full = true;
    }
    const outcome = await this.applied(opened, full);
    if (outcome !== 'stored') {
      return outcome;
    }
    this.lastSyncedAt.set(store, Date.now());
    if (donorCopyView(store.contents())?.agrees !== false) {
      return outcome;
    }
    if (!full && this.mayRebuild()) {
      this.lastRebuildAt = Date.now();
      const rebuilt = await this.applied(opened, true);
      if (rebuilt !== 'stored' || donorCopyView(store.contents())?.agrees !== false) {
        return rebuilt;
      }
    }
    this.reportMismatch();
    return 'mismatch';
  }

  private async applied(opened: OpenedCopy, full: boolean): Promise<SyncOutcome> {
    const store = opened.store;
    const before = store.contents();
    const stored = full ? null : before;
    for (let attempt = 0; attempt < SYNC_ATTEMPTS; attempt++) {
      let fetched: Fetched;
      try {
        fetched = await this.fetched(opened.account.userHandle, stored);
      } catch {
        return 'failed';
      }
      if (fetched === 'another-donor') {
        return 'mismatch';
      }
      if (fetched !== 'changed') {
        const contents = this.withProfile(
          await this.withImages(fetched, before?.images ?? []),
          opened,
          before,
        );
        return (await this.vault.replaceContents(store, contents)) ? 'stored' : 'no-copy';
      }
    }
    this.reportMismatch();
    return 'mismatch';
  }

  private async fetched(userHandle: string, stored: CopyContents | null): Promise<Fetched> {
    const manifest = await answered(this.api.manifest());
    if (userHandleOf(manifest.subject) !== userHandle) {
      return 'another-donor';
    }
    const kept = new Map((stored?.chunks ?? []).map((chunk) => [chunk.id, chunk]));
    const wanted = manifest.chunks
      .filter((entry) => kept.get(entry.id)?.rowsSha256 !== entry.rowsSha256)
      .map((entry) => entry.id);
    const served = new Map<string, SyncChunk>();
    for (let start = 0; start < wanted.length; start += MAX_CHUNKS_PER_REQUEST) {
      const answer = await answered(
        this.api.chunks(wanted.slice(start, start + MAX_CHUNKS_PER_REQUEST)),
      );
      if (userHandleOf(answer.subject) !== userHandle) {
        return 'another-donor';
      }
      if (answer.missing.length > 0 || !sameSummary(answer.summary, manifest.summary)) {
        return 'changed';
      }
      for (const chunk of answer.chunks) {
        served.set(chunk.id, chunk);
      }
    }
    const chunks: StoredChunk[] = [];
    for (const entry of manifest.chunks) {
      const fresh = served.get(entry.id);
      if (fresh !== undefined) {
        if (
          fresh.rowsSha256 !== entry.rowsSha256 ||
          (await rowsSha256(fresh.rows)) !== entry.rowsSha256
        ) {
          return 'changed';
        }
        chunks.push({ id: fresh.id, rowsSha256: fresh.rowsSha256, rows: fresh.rows });
        continue;
      }
      const old = kept.get(entry.id);
      if (old === undefined || old.rowsSha256 !== entry.rowsSha256) {
        return 'changed';
      }
      chunks.push(old);
    }
    return { chunks, summary: manifest.summary, storedAt: new Date().toISOString() };
  }

  private withProfile(
    contents: CopyContents,
    opened: OpenedCopy,
    before: CopyContents | null,
  ): CopyContents {
    const donor = this.auth.donor();
    const profile =
      donor !== null && userHandleOf(donor.id) === opened.account.userHandle
        ? copyProfileOf(donor)
        : before?.profile;
    return profile === undefined ? contents : { ...contents, profile };
  }

  private async withImages(
    contents: CopyContents,
    previous: readonly StoredImage[],
  ): Promise<CopyContents> {
    const kept = new Map(previous.map((image) => [image.sha256, image]));
    const images: StoredImage[] = [];
    for (const sha256 of imageDigestsOf(issuedReceiptsOf(contents))) {
      const image = kept.get(sha256) ?? (await this.downloadedImage(sha256));
      if (image !== null) {
        images.push(image);
      }
    }
    return images.length === 0 ? contents : { ...contents, images };
  }

  private async downloadedImage(sha256: string): Promise<StoredImage | null> {
    try {
      const image = await answered(this.receipts.image(sha256));
      const bytes = new Uint8Array(image.bytes);
      if ((await hexDigest(bytes)) !== sha256) {
        return null;
      }
      return { sha256, mediaType: image.mediaType, base64: bytesToBase64Url(bytes) };
    } catch {
      return null;
    }
  }

  private mayRebuild(): boolean {
    return this.lastRebuildAt === null || Date.now() - this.lastRebuildAt >= REBUILD_PAUSE_MS;
  }

  private reportMismatch(): void {
    if (this.lastReportAt !== null && Date.now() - this.lastReportAt < REBUILD_PAUSE_MS) {
      return;
    }
    this.lastReportAt = Date.now();
    this.reporter.report('device-copy-mismatch', 'global');
  }
}

function answered<T>(request: Observable<T>): Promise<T> {
  return firstValueFrom(request.pipe(timeout(SYNC_REQUEST_TIMEOUT_MS)));
}

function sameSummary(first: unknown, second: unknown): boolean {
  return canonicalRows([first]) === canonicalRows([second]);
}

async function hexDigest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
