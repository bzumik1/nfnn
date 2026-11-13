import { filter, Observable } from 'rxjs';

export class ListChanges {
  private changes = 0;
  private writing = 0;
  private outdated = false;

  constructor(private readonly reload: () => void) {}

  track<T>(list: Observable<T>): Observable<T> {
    this.outdated = false;
    const startedAt = this.changes;
    const startedDuringChange = this.writing > 0;
    return list.pipe(
      filter(() => {
        if (this.changes === startedAt && !startedDuringChange) {
          return true;
        }
        this.outdated = true;
        this.reloadOnceSettled();
        return false;
      }),
    );
  }

  changing(): void {
    this.changes += 1;
    this.writing += 1;
  }

  changed(reloadIfOutdated = true): void {
    this.writing = Math.max(0, this.writing - 1);
    if (reloadIfOutdated) {
      this.reloadOnceSettled();
    } else if (this.writing === 0) {
      this.outdated = false;
    }
  }

  private reloadOnceSettled(): void {
    if (this.writing === 0 && this.outdated) {
      this.outdated = false;
      this.reload();
    }
  }
}
