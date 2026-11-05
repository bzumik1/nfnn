import { HttpHeaders } from '@angular/common/http';
import { computed, Injectable, InjectionToken, signal } from '@angular/core';

import { API_GENERATION } from './api-generation';

export const SERVER_REVISION_HEADER = 'Nfnn-Revision';
export const SERVER_API_HEADER = 'Nfnn-Api';
export const APP_REVISION_HEADER = 'Nfnn-App';

export const APP_API_GENERATION = new InjectionToken<number>('APP_API_GENERATION', {
  providedIn: 'root',
  factory: () => API_GENERATION,
});

@Injectable({ providedIn: 'root' })
export class ServerVersion {
  private readonly revisionSeen = signal<string | null>(null);
  private readonly generationSeen = signal<number | null>(null);

  readonly revision = this.revisionSeen.asReadonly();
  readonly apiGeneration = this.generationSeen.asReadonly();
  readonly mustUpdate = computed(() => false);

  observe(headers: HttpHeaders): void {
    void headers;
  }
}
