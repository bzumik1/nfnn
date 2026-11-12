import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { PasskeyConfirmation } from '../../../core/auth/donor';

export const MAX_CHUNKS_PER_REQUEST = 64;

export type AdministrationCopyPart = 'donations' | 'donors';

export interface AdministrationChunkEntry {
  readonly id: string;
  readonly rowsSha256: string;
  readonly count: number;
}

export interface AdministrationManifest {
  readonly subject: string;
  readonly administrator: boolean;
  readonly summary?: unknown;
  readonly chunks: readonly AdministrationChunkEntry[];
}

export interface AdministrationChunk extends AdministrationChunkEntry {
  readonly rows: readonly unknown[];
}

export interface AdministrationChunks {
  readonly subject: string;
  readonly administrator: boolean;
  readonly summary?: unknown;
  readonly chunks: readonly AdministrationChunk[];
  readonly missing: readonly string[];
}

const CURRENT_DEVICE = '/api/admin/donors/devices/current';

@Injectable({ providedIn: 'root' })
export class AdministrationSyncApi {
  private readonly http = inject(HttpClient);

  manifest(part: AdministrationCopyPart): Observable<AdministrationManifest> {
    return this.http.get<AdministrationManifest>(`/api/admin/${part}/sync`);
  }

  chunks(part: AdministrationCopyPart, ids: readonly string[]): Observable<AdministrationChunks> {
    return this.http.get<AdministrationChunks>(`/api/admin/${part}/sync/chunks`, {
      params: { ids: ids.join(',') },
    });
  }

  recordStoredCopy(): Observable<void> {
    return this.http.post<void>(`${CURRENT_DEVICE}/administration-copy`, {});
  }

  unlock(password: string, secondFactorCode: string): Observable<void> {
    return this.http.post<void>(`${CURRENT_DEVICE}/unlock`, { password, secondFactorCode });
  }

  unlockWithPasskey(passkey: PasskeyConfirmation): Observable<void> {
    return this.http.post<void>(`${CURRENT_DEVICE}/unlock`, { passkey });
  }
}
