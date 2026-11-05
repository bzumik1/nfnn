import { Injectable, signal } from '@angular/core';
import { filter, map, Observable, Subject } from 'rxjs';
import { LiveFeed } from '../live-updates';

@Injectable()
export class FakeLiveUpdates {
  readonly connected = signal(false);
  private readonly hints = new Subject<LiveFeed | null>();
  private listening = 0;

  changes(feeds: readonly LiveFeed[]): Observable<void> {
    return new Observable<void>((subscriber) => {
      this.listening++;
      const hints = this.hints
        .pipe(
          filter((feed) => feed === null || feeds.includes(feed)),
          map(() => undefined),
        )
        .subscribe(subscriber);
      return () => {
        hints.unsubscribe();
        this.listening--;
      };
    });
  }

  hint(feed: LiveFeed): void {
    this.hints.next(feed);
  }

  resync(): void {
    this.hints.next(null);
  }

  listeners(): number {
    return this.listening;
  }
}
