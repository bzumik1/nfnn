import { Injectable, signal } from '@angular/core';

export type DirtyCheck = () => boolean;

@Injectable({ providedIn: 'root' })
export class DirtyForms {
  private readonly checks = signal<readonly DirtyCheck[]>([]);

  register(check: DirtyCheck): () => void {
    this.checks.update((checks) => [...checks, check]);
    return () =>
      this.checks.update((checks) => checks.filter((registered) => registered !== check));
  }

  any(): boolean {
    return this.checks().some((check) => {
      try {
        return check();
      } catch {
        return true;
      }
    });
  }
}
