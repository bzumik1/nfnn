import { HttpHeaders } from '@angular/common/http';
import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';

import { revisionOf } from '../errors/app-revision';
import { API_GENERATION } from './api-generation';

export const SERVER_REVISION_HEADER = 'Nfnn-Revision';
export const SERVER_API_HEADER = 'Nfnn-Api';
export const APP_REVISION_HEADER = 'Nfnn-App';
export const APP_API_HEADER = 'Nfnn-App-Api';

export const APP_API_GENERATION = new InjectionToken<number>('APP_API_GENERATION', {
  providedIn: 'root',
  factory: () => API_GENERATION,
});

const GENERATION = /^[1-9][0-9]{0,8}$/;
const UNKNOWN_REVISION = 'dev';
const NOT_STORED = /(^|[\s,])no-store([\s,]|$)/i;

@Injectable({ providedIn: 'root' })
export class ServerVersion {
  private readonly appGeneration = inject(APP_API_GENERATION);
  private readonly revisionSeen = signal<string | null>(null);
  private readonly generationSeen = signal<number | null>(null);

  readonly revision = this.revisionSeen.asReadonly();
  readonly apiGeneration = this.generationSeen.asReadonly();
  readonly mustUpdate = computed(() => {
    const generation = this.generationSeen();
    return generation !== null && generation !== this.appGeneration;
  });

  readonly appApiGeneration = this.appGeneration;

  observe(headers: HttpHeaders): void {
    if (!NOT_STORED.test(headers.get('Cache-Control') ?? '')) {
      return;
    }
    const generation = headers.get(SERVER_API_HEADER);
    if (generation !== null && GENERATION.test(generation)) {
      this.generationSeen.set(Number(generation));
    }
    const revision = headers.get(SERVER_REVISION_HEADER);
    if (revision !== null && (revision === UNKNOWN_REVISION || revisionOf(revision) === revision)) {
      this.revisionSeen.set(revision);
    }
  }
}
