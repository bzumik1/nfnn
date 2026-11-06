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
  'stored' | 'failed' | 'mismatch' | 'revoked' | 'another-account' | 'unrecorded' | 'no-copy';

export interface DownloadProgress {
  readonly done: number;
  readonly total: number;
}

const PARTS: readonly AdministrationCopyPart[] = ['donations', 'donors'];
const ATTEMPTS = 2;

type Fetched = CopyContents | 'changed' | 'another-account' | 'revoked';

@Injectable({ providedIn: 'root' })
export class AdministrationCopyDownload {
  private readonly vault = inject(DeviceVault);
  private readonly api = inject(AdministrationSyncApi);
  private readonly reporter = inject(ErrorReporter);
  private readonly progress = signal<DownloadProgress | null>(null);

  readonly firstDownload = this.progress.asReadonly();

  constructor() {
    effect(() => {
      const opened = this.vault.administration();
      if (opened !== null) {
        untracked(() => void this.download(opened));
      }
    });
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
            contents = await this.fetched(opened.account.userHandle, first);
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
          if (contents !== 'changed') {
            return (await this.vault.replaceContents(store, contents)) ? 'stored' : 'no-copy';
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

  private async fetched(userHandle: string, first: boolean): Promise<Fetched> {
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
    const total = manifests.reduce((sum, manifest) => sum + manifest.chunks.length, 0);
    let done = 0;
    if (first) {
      this.progress.set({ done, total });
    }
    const chunks: StoredChunk[] = [];
    let summary: unknown = null;
    for (const [index, part] of PARTS.entries()) {
      const manifest = manifests[index];
      const ids = manifest.chunks.map((entry) => entry.id);
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
