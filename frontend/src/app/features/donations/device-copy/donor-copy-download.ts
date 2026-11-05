import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { userHandleOf } from '../../../core/auth/session-device';
import type { CopyContents, StoredChunk } from '../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import { canonicalRows, rowsSha256 } from '../sync/canonical-rows';
import { DonorSyncApi, MAX_CHUNKS_PER_REQUEST, type SyncChunk } from './donor-sync-api';

export type DownloadOutcome = 'stored' | 'skipped' | 'failed' | 'mismatch' | 'no-copy';

const ATTEMPTS = 2;

type Fetched = CopyContents | 'changed' | 'another-donor';

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
        untracked(() => void this.download(opened, opened.reason === 'empty'));
      }
    });
  }

  reload(): Promise<DownloadOutcome> {
    const opened = this.vault.opened();
    return opened === null ? Promise.resolve('no-copy') : this.download(opened, false);
  }

  private async download(opened: OpenedCopy, onlyIfEmpty: boolean): Promise<DownloadOutcome> {
    const store = opened.store;
    this.running.update((count) => count + 1);
    try {
      return await this.vault.withCopyLock(store, async () => {
        if (onlyIfEmpty && (await store.load()) === 'loaded') {
          return 'skipped';
        }
        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
          let contents: Fetched;
          try {
            contents = await this.fetched(opened.account.userHandle);
          } catch {
            return 'failed';
          }
          if (contents === 'another-donor') {
            break;
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
      this.running.update((count) => count - 1);
    }
  }

  private async fetched(userHandle: string): Promise<Fetched> {
    const manifest = await firstValueFrom(this.api.manifest());
    if (userHandleOf(manifest.subject) !== userHandle) {
      return 'another-donor';
    }
    const ids = manifest.chunks.map((entry) => entry.id);
    const served: SyncChunk[] = [];
    let summary = manifest.summary;
    for (let start = 0; start < ids.length; start += MAX_CHUNKS_PER_REQUEST) {
      const answer = await firstValueFrom(
        this.api.chunks(ids.slice(start, start + MAX_CHUNKS_PER_REQUEST)),
      );
      if (userHandleOf(answer.subject) !== userHandle) {
        return 'another-donor';
      }
      if (answer.missing.length > 0 || !sameSummary(answer.summary, summary)) {
        return 'changed';
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
        return 'changed';
      }
      chunks.push({ id: chunk.id, rowsSha256: chunk.rowsSha256, rows: chunk.rows });
    }
    return { chunks, summary, storedAt: new Date().toISOString() };
  }
}

function sameSummary(first: unknown, second: unknown): boolean {
  return canonicalRows([first]) === canonicalRows([second]);
}
