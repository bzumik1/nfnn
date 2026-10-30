import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ChunkProbe {
  reloadWouldLand(_error: unknown): Promise<boolean> {
    return Promise.resolve(true);
  }
}
