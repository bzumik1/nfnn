import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DialogAnnouncer {
  private readonly announced = signal('');
  private latest = 0;
  readonly message = this.announced.asReadonly();

  announce(text: string): () => void {
    const announcement = ++this.latest;
    this.announced.set(text);
    return () => {
      if (this.latest === announcement) {
        this.announced.set('');
      }
    };
  }
}
