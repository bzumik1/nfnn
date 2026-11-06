import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { userHandleOf } from '../../../core/auth/session-device';
import type { CopyContents, StoredChunk } from '../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import { canonicalRows, rowsSha256 } from '../../donations/sync/canonical-rows';
import {
  type AdministrationChunk,
  type AdministrationCopyPart,
  type AdministrationManifest,
  AdministrationSyncApi,
  MAX_CHUNKS_PER_REQUEST,
} from './administration-sync-api';

export type AdministrationDownloadOutcome =
  | 'stored'
  | 'unchanged'
  | 'failed'
  | 'mismatch'
  | 'revoked'
  | 'another-account'
  | 'unrecorded'
  | 'no-copy';

export interface DownloadProgress {
  readonly done: number;
  readonly total: number;
}

const PARTS: readonly AdministrationCopyPart[] = ['donations', 'donors'];
const ATTEMPTS = 2;

type Fetched = CopyContents | 'unchanged' | 'changed' | 'another-account' | 'revoked';

@Injectable({ providedIn: 'root' })
export class AdministrationCopyDownload {
  private readonly vault = inject(DeviceVault);
  private readonly api = inject(AdministrationSyncApi);
  private readonly reporter = inject(ErrorReporter);
  private readonly progress = signal<DownloadProgress | null>(null);
  private readonly checked = signal<string | null>(null);
  private running: {
    readonly copy: OpenedCopy;
    readonly outcome: Promise<AdministrationDownloadOutcome>;
  } | null = null;
  private queued: {
    readonly copy: OpenedCopy;
    readonly outcome: Promise<AdministrationDownloadOutcome>;
  } | null = null;

  readonly firstDownload = this.progress.asReadonly();
  readonly checkedAt = this.checked.asReadonly();

  constructor() {
    effect(() => {
      const opened = this.vault.administration();
      this.checked.set(null);
      if (opened !== null) {
        untracked(() => void this.synced(opened));
      }
    });
  }

  refresh(startingNow = false): Promise<AdministrationDownloadOutcome> {
    const opened = this.vault.administration();
    if (opened === null) {
      return Promise.resolve('no-copy');
    }
    const running = this.running?.copy === opened ? this.running.outcome : null;
    if (!startingNow || running === null) {
      return this.synced(opened);
    }
    if (this.queued?.copy !== opened) {
      const next = (): Promise<AdministrationDownloadOutcome> => {
        if (this.queued?.outcome === outcome) {
          this.queued = null;
        }
        return this.refresh();
      };
      const outcome = running.then(next, next);
      this.queued = { copy: opened, outcome };
    }
    return this.queued.outcome;
  }

  private synced(opened: OpenedCopy): Promise<AdministrationDownloadOutcome> {
    if (this.running?.copy === opened) {
      return this.running.outcome;
    }
    const outcome = this.download(opened).finally(() => {
      if (this.running?.outcome === outcome) {
        this.running = null;
      }
    });
    this.running = { copy: opened, outcome };
    return outcome;
  }

  private async download(opened: OpenedCopy): Promise<AdministrationDownloadOutcome> {
    const store = opened.store;
    const first = opened.reason === 'empty';
    try {
      return await this.vault.withCopyLock(store, async () => {
        if (first && this.vault.stores(store)) {
          try {
            await firstValueFrom(this.api.recordStoredCopy());
          } catch {
            return 'unrecorded';
          }
        }
        if (first) {
          this.progress.set({ done: 0, total: 0 });
        }
        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
          let contents: Fetched;
          try {
            contents = await this.fetched(opened.account.userHandle, first, store.contents());
          } catch {
            return 'failed';
          }
          if (contents === 'revoked') {
            await this.vault.administrationRevoked(opened.account);
            return 'revoked';
          }
          if (contents === 'another-account') {
            return 'another-account';
          }
          if (contents === 'unchanged') {
            this.checkedNow(opened);
            return 'unchanged';
          }
          if (contents !== 'changed') {
            const stored = await this.vault.replaceContents(store, contents);
            if (stored) {
              this.checkedNow(opened);
            }
            return stored ? 'stored' : 'no-copy';
          }
        }
        this.reporter.report('device-copy-mismatch', 'global');
        return 'mismatch';
      });
    } catch {
      return 'failed';
    } finally {
      if (first) {
        this.progress.set(null);
      }
    }
  }

  private checkedNow(opened: OpenedCopy): void {
    if (this.vault.administration() === opened) {
      this.checked.set(new Date().toISOString());
    }
  }

  private async fetched(
    userHandle: string,
    first: boolean,
    held: CopyContents | null,
  ): Promise<Fetched> {
    const kept = new Map((held?.chunks ?? []).map((chunk) => [chunk.id, chunk]));
    const manifests: AdministrationManifest[] = [];
    for (const part of PARTS) {
      const manifest = await firstValueFrom(this.api.manifest(part));
      if (userHandleOf(manifest.subject) !== userHandle) {
        return 'another-account';
      }
      if (!manifest.administrator) {
        return 'revoked';
      }
      manifests.push(manifest);
    }
    const wanted = manifests.map((manifest, index) =>
      manifest.chunks
        .filter((entry) => kept.get(`${PARTS[index]}/${entry.id}`)?.rowsSha256 !== entry.rowsSha256)
        .map((entry) => entry.id),
    );
    const listed = new Set(
      manifests.flatMap((manifest, index) =>
        manifest.chunks.map((entry) => `${PARTS[index]}/${entry.id}`),
      ),
    );
    if (
      held !== null &&
      wanted.every((ids) => ids.length === 0) &&
      [...kept.keys()].every((id) => listed.has(id)) &&
      sameSummary(manifests[0].summary, (held.summary as { donations?: unknown } | null)?.donations)
    ) {
      return 'unchanged';
    }
    const total = wanted.reduce((sum, ids) => sum + ids.length, 0);
    let done = 0;
    if (first) {
      this.progress.set({ done, total });
    }
    const chunks: StoredChunk[] = [];
    let summary: unknown = null;
    for (const [index, part] of PARTS.entries()) {
      const manifest = manifests[index];
      const ids = wanted[index];
      const served: AdministrationChunk[] = [];
      for (let start = 0; start < ids.length; start += MAX_CHUNKS_PER_REQUEST) {
        const answer = await firstValueFrom(
          this.api.chunks(part, ids.slice(start, start + MAX_CHUNKS_PER_REQUEST)),
        );
        if (userHandleOf(answer.subject) !== userHandle) {
          return 'another-account';
        }
        if (!answer.administrator) {
          return 'revoked';
        }
        if (
          answer.missing.length > 0 ||
          (part === 'donations' && !sameSummary(answer.summary, manifest.summary))
        ) {
          return 'changed';
        }
        served.push(...answer.chunks);
        done += answer.chunks.length;
        if (first) {
          this.progress.set({ done: Math.min(done, total), total });
        }
      }
      for (const entry of manifest.chunks) {
        const held = kept.get(`${part}/${entry.id}`);
        if (held !== undefined && held.rowsSha256 === entry.rowsSha256) {
          chunks.push(held);
          continue;
        }
        const chunk = served.find((candidate) => candidate.id === entry.id);
        if (
          chunk === undefined ||
          chunk.rowsSha256 !== entry.rowsSha256 ||
          (await rowsSha256(chunk.rows)) !== entry.rowsSha256
        ) {
          return 'changed';
        }
        chunks.push({ id: `${part}/${chunk.id}`, rowsSha256: chunk.rowsSha256, rows: chunk.rows });
      }
      if (part === 'donations') {
        summary = manifest.summary ?? null;
      }
    }
    return { chunks, summary: { donations: summary }, storedAt: new Date().toISOString() };
  }
}

function sameSummary(first: unknown, second: unknown): boolean {
  return canonicalRows([first ?? null]) === canonicalRows([second ?? null]);
}
