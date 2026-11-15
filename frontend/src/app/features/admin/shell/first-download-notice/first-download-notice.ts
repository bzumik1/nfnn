import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { ADMINISTRATION_LOCK } from '../administration-lock';

export const FIRST_DOWNLOAD_ENDING_AFTER_MS = 1000;
export const FIRST_DOWNLOAD_STORED_MS = 4000;

@Component({
  selector: 'app-first-download-notice',
  imports: [NeedsConnection],
  templateUrl: './first-download-notice.html',
  styleUrl: './first-download-notice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirstDownloadNotice {
  protected readonly lock = inject(ADMINISTRATION_LOCK);
  protected readonly stored = signal(false);
  private startedAt: number | null = null;

  constructor() {
    effect((onCleanup) => {
      const running = this.lock.firstDownload() !== null;
      const end = this.lock.firstDownloadEnd();
      if (running) {
        this.startedAt ??= performance.now();
        this.stored.set(false);
        return;
      }
      const startedAt = this.startedAt;
      this.startedAt = null;
      const seen =
        startedAt !== null && performance.now() - startedAt >= FIRST_DOWNLOAD_ENDING_AFTER_MS;
      if (end !== 'stored' || !seen) {
        this.stored.set(false);
        return;
      }
      this.stored.set(true);
      const timer = setTimeout(() => this.stored.set(false), FIRST_DOWNLOAD_STORED_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected retry(): void {
    this.lock.retryFirstDownload();
  }
}
