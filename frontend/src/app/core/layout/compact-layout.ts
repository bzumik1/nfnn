import { Injectable, Signal, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CompactLayout {
  readonly isCompact: Signal<boolean> = signal(false);
}
