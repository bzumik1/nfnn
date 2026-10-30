import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';

import { Connectivity } from '../navigation/connectivity';
import { ExternalNavigation } from '../navigation/external-navigation';
import { ChunkProbe } from './chunk-probe';
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
  private readonly router = inject(Router);
  private readonly guard = inject(ReloadGuard);
  private readonly navigation = inject(ExternalNavigation);
  private readonly connectivity = inject(Connectivity);
  private readonly probe = inject(ChunkProbe);
  private readonly failed = signal<ChunkLoadFailure | null>(null);

  readonly failure = this.failed.asReadonly();

  constructor() {
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.failed.set(null);
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  async handleNavigationError(error: NavigationError): Promise<void> {
    if (!isChunkLoadError(error.error)) {
      return;
    }
    const failure = { url: error.url, initial: !this.router.navigated };
    const reload =
      !this.connectivity.isOffline() &&
      (await this.probe.reloadWouldLand(error.error)) &&
      this.guard.claim('chunk-load');
    this.failed.set(failure);
    if (reload) {
      this.navigation.loadFromServer(error.url);
    }
  }

  reload(): void {
    const failure = this.failed();
    if (failure !== null) {
      this.navigation.loadFromServer(failure.url);
    }
  }
}
