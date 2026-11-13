import { filter, finalize, Observable } from 'rxjs';

export class ListChanges {
  private changes = 0;
  private writing = 0;
  private outdated = false;
  private freshAt = -1;
  private answeredAt = -1;
  private deliveredAt = -1;

  constructor(private readonly reload: () => void) {}

  track<T>(list: Observable<T>): Observable<T> {
    this.outdated = false;
    const startedAt = this.changes;
    const startedDuringChange = this.writing > 0;
    if (!startedDuringChange) {
      this.freshAt = startedAt;
    }
    let delivered = false;
    return list.pipe(
      filter(() => {
        if (this.changes === startedAt && !startedDuringChange) {
          delivered = true;
          this.deliveredAt = startedAt;
          this.outdated = false;
          return true;
        }
        if (this.answeredAt !== this.changes && this.deliveredAt !== this.changes) {
          this.outdated = true;
          if (this.freshAt !== this.changes) {
            this.reloadOnceSettled();
          }
        }
        return false;
      }),
      finalize(() => {
        if (!delivered && !startedDuringChange && this.freshAt === startedAt) {
          this.freshAt = -1;
          this.reloadOnceSettled();
        }
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

  answeredByChange(): void {
    this.changes += 1;
    this.answeredAt = this.changes;
    this.outdated = false;
  }

  private reloadOnceSettled(): void {
    if (this.writing === 0 && this.outdated) {
      this.outdated = false;
      this.reload();
    }
  }
}
