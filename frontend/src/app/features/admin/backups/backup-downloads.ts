import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { describeProblem } from '../../../core/auth/api-problem';
import { saveBlob } from '../../../core/files/file-download';
import { RunningWork } from '../../../core/updates/running-work';
import { AdminApi, BackupFileResponse } from '../admin-api';

@Injectable()
export class BackupDownloads {
  private readonly api = inject(AdminApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly runningWork = inject(RunningWork);

  readonly downloading = signal<string | null>(null);
  readonly failure = signal<string | null>(null);

  download(backup: BackupFileResponse): void {
    if (this.downloading() !== null) {
      return;
    }
    this.failure.set(null);
    this.downloading.set(backup.fileName);
    this.runningWork
      .during(this.api.downloadBackup(backup.fileName))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (file) => {
          this.downloading.set(null);
          saveBlob(file);
        },
        error: (failure: unknown) => {
          this.downloading.set(null);
          this.failure.set(
            describeProblem(
              failure,
              $localize`:@@admin.backups.download.failed:Zálohu se nepodařilo stáhnout. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  forget(): void {
    this.failure.set(null);
  }
}
