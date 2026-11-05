import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export const MAX_CHUNKS_PER_REQUEST = 64;

export interface SyncChunkEntry {
  readonly id: string;
  readonly rowsSha256: string;
  readonly count: number;
}

export interface SyncManifest {
  readonly subject: string;
  readonly summary: unknown;
  readonly chunks: readonly SyncChunkEntry[];
}

export interface SyncChunk extends SyncChunkEntry {
  readonly rows: readonly unknown[];
}

export interface SyncChunks {
  readonly subject: string;
  readonly summary: unknown;
  readonly chunks: readonly SyncChunk[];
  readonly missing: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class DonorSyncApi {
  private readonly http = inject(HttpClient);

  manifest(): Observable<SyncManifest> {
    return this.http.get<SyncManifest>('/api/donations/me/sync');
  }

  chunks(ids: readonly string[]): Observable<SyncChunks> {
    return this.http.get<SyncChunks>('/api/donations/me/sync/chunks', {
      params: { ids: ids.join(',') },
    });
  }
}
