import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AccountStore,
  CopyContents,
  StoredChunk,
} from '../../../core/device/store/account-store';
import { DeviceVault } from '../../../core/device/store/device-vault';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import { canonicalRows, rowsSha256 } from '../sync/canonical-rows';
import { DonorSyncApi, MAX_CHUNKS_PER_REQUEST, type SyncChunk } from './donor-sync-api';

export type DownloadOutcome = 'stored' | 'skipped' | 'failed' | 'mismatch' | 'no-copy';

const ATTEMPTS = 2;

@Injectable({ providedIn: 'root' })
export class DonorCopyDownload {
  private readonly vault = inject(DeviceVault);
  private readonly api = inject(DonorSyncApi);
  private readonly reporter = inject(ErrorReporter);
  private readonly running = signal(0);

  readonly downloading = () => this.running() > 0;

  constructor() {
    effect(() => {
      const opened = this.vault.opened();
      if (opened !== null && opened.reason !== 'restored') {
        untracked(() => void this.download(opened.store, opened.reason === 'empty'));
      }
    });
  }

  reload(): Promise<DownloadOutcome> {
    const opened = this.vault.opened();
    return opened === null ? Promise.resolve('no-copy') : this.download(opened.store, false);
  }

  private async download(store: AccountStore, onlyIfEmpty: boolean): Promise<DownloadOutcome> {
    this.running.update((count) => count + 1);
    try {
      return await this.vault.withCopyLock(store, async () => {
        if (onlyIfEmpty && (await store.load()) === 'loaded') {
          return 'skipped';
        }
        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
          let contents: CopyContents | null;
          try {
            contents = await this.fetched();
          } catch {
            return 'failed';
          }
          if (contents !== null) {
            return (await this.vault.replaceContents(store, contents)) ? 'stored' : 'no-copy';
          }
        }
        this.reporter.report('device-copy-mismatch', 'global');
        return 'mismatch';
      });
    } catch {
      return 'failed';
    } finally {
      this.running.update((count) => count - 1);
    }
  }

  private async fetched(): Promise<CopyContents | null> {
    const manifest = await firstValueFrom(this.api.manifest());
    const ids = manifest.chunks.map((entry) => entry.id);
    const served: SyncChunk[] = [];
    let summary = manifest.summary;
    for (let start = 0; start < ids.length; start += MAX_CHUNKS_PER_REQUEST) {
      const answer = await firstValueFrom(
        this.api.chunks(ids.slice(start, start + MAX_CHUNKS_PER_REQUEST)),
      );
      if (answer.missing.length > 0 || !sameSummary(answer.summary, summary)) {
        return null;
      }
      summary = answer.summary;
      served.push(...answer.chunks);
    }
    const chunks: StoredChunk[] = [];
    for (const entry of manifest.chunks) {
      const chunk = served.find((candidate) => candidate.id === entry.id);
      if (
        chunk === undefined ||
        chunk.rowsSha256 !== entry.rowsSha256 ||
        (await rowsSha256(chunk.rows)) !== entry.rowsSha256
      ) {
        return null;
      }
      chunks.push({ id: chunk.id, rowsSha256: chunk.rowsSha256, rows: chunk.rows });
    }
    return { chunks, summary, storedAt: new Date().toISOString() };
  }
}

function sameSummary(first: unknown, second: unknown): boolean {
  return canonicalRows([first]) === canonicalRows([second]);
}
