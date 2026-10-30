import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

const SCRIPT_URL = /https?:\/\/[^\s'"]+?\.m?js(?=$|[\s'"?#])/;
const PROBE_TIMEOUT_MS = 4_000;

@Injectable({ providedIn: 'root' })
export class ChunkProbe {
  private readonly document = inject(DOCUMENT);

  async reloadWouldLand(error: unknown): Promise<boolean> {
    const view = this.document.defaultView;
    if (!view) {
      return false;
    }
    const chunk = this.chunkOf(error, view.location.origin);
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), PROBE_TIMEOUT_MS);
    try {
      const answer = await view.fetch(chunk ?? '/', {
        method: 'HEAD',
        cache: 'no-store',
        signal: timeout.signal,
      });
      return this.lands(answer, chunk);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private lands(answer: Response, chunk: string | null): boolean {
    if (answer.redirected) {
      return false;
    }
    const page = answer.ok && (answer.headers.get('Content-Type')?.includes('text/html') ?? false);
    return chunk === null ? page : answer.status === 404 || (page && answer.url === chunk);
  }

  private chunkOf(error: unknown, origin: string): string | null {
    const named = error instanceof Error ? SCRIPT_URL.exec(error.message)?.[0] : undefined;
    return named !== undefined && new URL(named).origin === origin ? named : null;
  }
}
