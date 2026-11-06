import { Injectable } from '@angular/core';

import { DiagnosticEvent, MAX_EVENTS, sanitizedEvent } from './diagnostics-schema';

export type RecordedEvent = Omit<DiagnosticEvent, 'secondsAgo'>;

interface HeldEvent {
  readonly at: number;
  readonly event: RecordedEvent;
}

@Injectable({ providedIn: 'root' })
export class DiagnosticEvents {
  private held: HeldEvent[] = [];

  record(event: RecordedEvent): void {
    this.held.push({ at: Date.now(), event });
    if (this.held.length > MAX_EVENTS) {
      this.held = this.held.slice(-MAX_EVENTS);
    }
  }

  listed(): DiagnosticEvent[] {
    const now = Date.now();
    return this.held
      .map(({ at, event: { kind, place, name, detail } }) =>
        sanitizedEvent({ secondsAgo: Math.floor((now - at) / 1000), kind, place, name, detail }),
      )
      .filter((event): event is DiagnosticEvent => event !== null);
  }

  clear(): void {
    this.held = [];
  }
}
