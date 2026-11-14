import { computed, Injectable, signal } from '@angular/core';
import { defer, finalize, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RunningWork {
  private readonly running = signal(0);

  readonly any = computed(() => this.running() > 0);

  start(): () => void {
    this.running.update((count) => count + 1);
    let ended = false;
    return () => {
      if (!ended) {
        ended = true;
        this.running.update((count) => count - 1);
      }
    };
  }

  async until<T>(work: Promise<T>): Promise<T> {
    const end = this.start();
    try {
      return await work;
    } finally {
      end();
    }
  }

  during<T>(work: Observable<T>): Observable<T> {
    return defer(() => {
      const end = this.start();
      return work.pipe(finalize(end));
    });
  }
}
