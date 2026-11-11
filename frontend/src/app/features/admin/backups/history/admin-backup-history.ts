import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { AdminApi, AdminBackupsResponse, BackupFileResponse } from '../../admin-api';
import { LogPageAccess } from '../../logs/log-page-access';
import { backupDays } from '../backup-days';
import { BackupDownloads } from '../backup-downloads';
import { formatSize } from '../backup-format';
import { backupKindName } from '../backup-kinds';
import { ADMIN_BACKUPS_PATH, RESTORE_STATE_KEY } from '../backup-paths';
import { BackupSheet } from '../backup-sheet/backup-sheet';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-admin-backup-history',
  imports: [NeedsConnection, BackupSheet],
  templateUrl: './admin-backup-history.html',
  styleUrl: './admin-backup-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BackupDownloads],
})
export class AdminBackupHistory {
  private readonly api = inject(AdminApi);
  private readonly access = inject(LogPageAccess);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly downloads = inject(BackupDownloads);
  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<AdminBackupsResponse | null>(null);
  protected readonly opened = signal<BackupFileResponse | null>(null);
  protected readonly days = computed(() => backupDays(this.view()?.backups ?? []));
  protected readonly restoreBlocked = computed(() => {
    const view = this.view();
    return view === null || !view.available || view.restorePending;
  });

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus());
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .backups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          this.view.set(view);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (!this.access.leavesOn(failure)) {
            this.state.set('error');
          }
        },
      });
  }

  protected kindName(backup: BackupFileResponse): string {
    return backupKindName(backup.kind);
  }

  protected size(backup: BackupFileResponse): string {
    return formatSize(backup.sizeBytes);
  }

  protected open(backup: BackupFileResponse): void {
    this.downloads.forget();
    this.opened.set(backup);
  }

  protected close(): void {
    this.opened.set(null);
  }

  protected restore(): void {
    const backup = this.opened();
    if (backup === null || this.restoreBlocked()) {
      return;
    }
    this.opened.set(null);
    void this.router.navigateByUrl(ADMIN_BACKUPS_PATH, {
      state: { [RESTORE_STATE_KEY]: backup.fileName },
    });
  }
}
