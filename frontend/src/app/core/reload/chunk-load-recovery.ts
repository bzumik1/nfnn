import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';

import { ErrorReporter } from '../errors/error-reporter';
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
  private readonly reporter = inject(ErrorReporter);
  private readonly failed = signal<ChunkLoadFailure | null>(null);
  private navigationsStarted = 0;

  readonly failure = this.failed.asReadonly();

  constructor() {
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.navigationsStarted++;
      }
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
    this.reporter.report('chunk-load', 'navigation', error.error);
    this.failed.set({ url: error.url, initial: !this.router.navigated });
    if (this.connectivity.isOffline()) {
      return;
    }
    const navigation = this.navigationsStarted;
    const lands = await this.probe.reloadWouldLand(error.error);
    if (lands && navigation === this.navigationsStarted && this.guard.claim('chunk-load')) {
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
