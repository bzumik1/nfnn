import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';

import { ExternalNavigation } from '../navigation/external-navigation';
import { ReloadGuard } from './reload-guard';

const CHUNK_LOAD_MESSAGES = [
  /dynamically imported module/i,
  /importing a module script failed/i,
  /failed to load module script/i,
  /is not a valid JavaScript MIME type/i,
];

export function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error && CHUNK_LOAD_MESSAGES.some((message) => message.test(error.message))
  );
}

export interface ChunkLoadFailure {
  readonly url: string;
  readonly initial: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChunkLoadRecovery {
  private readonly guard = inject(ReloadGuard);
  private readonly navigation = inject(ExternalNavigation);
  private readonly failed = signal<ChunkLoadFailure | null>(null);

  readonly failure = this.failed.asReadonly();

  constructor() {
    const subscription = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.failed.set(null);
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  handleNavigationError(error: NavigationError): void {
    if (!isChunkLoadError(error.error)) {
      return;
    }
    if (this.guard.claim('chunk-load')) {
      this.navigation.loadFromServer(error.url);
      return;
    }
    this.failed.set({ url: error.url, initial: false });
  }

  reload(): void {
    const failure = this.failed();
    if (failure !== null) {
      this.navigation.loadFromServer(failure.url);
    }
  }
}
