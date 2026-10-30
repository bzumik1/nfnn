import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

const SCRIPT_URL = /https?:\/\/[^\s'"]+?\.m?js(?=$|[\s'"?#])/;
const PROBE: RequestInit = { method: 'HEAD', cache: 'no-store' };

@Injectable({ providedIn: 'root' })
export class ChunkProbe {
  private readonly document = inject(DOCUMENT);

  async reloadWouldLand(error: unknown): Promise<boolean> {
    const view = this.document.defaultView;
    if (!view) {
      return false;
    }
    const chunk = this.chunkOf(error, view.location.origin);
    try {
      const answer = await view.fetch(chunk ?? '/', PROBE);
      const page = answer.headers.get('Content-Type')?.includes('text/html') ?? false;
      return chunk === null ? answer.ok && page : answer.status === 404 || (answer.ok && page);
    } catch {
      return false;
    }
  }

  private chunkOf(error: unknown, origin: string): string | null {
    const named = error instanceof Error ? SCRIPT_URL.exec(error.message)?.[0] : undefined;
    return named !== undefined && new URL(named).origin === origin ? named : null;
  }
}
