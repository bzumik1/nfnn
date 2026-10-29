import { Injectable, signal } from '@angular/core';
import { NavigationError } from '@angular/router';

export function isChunkLoadError(error: unknown): boolean {
  void error;
  return false;
}

@Injectable({ providedIn: 'root' })
export class ChunkLoadRecovery {
  private readonly failed = signal<string | null>(null);
  readonly failedUrl = this.failed.asReadonly();

  handleNavigationError(error: NavigationError): void {
    void error;
  }

  reload(): void {
    return;
  }
}
