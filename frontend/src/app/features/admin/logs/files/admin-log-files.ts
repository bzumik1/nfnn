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
import { RouterLink } from '@angular/router';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { formatBankTime } from '../../../donations/donation-date';
import { AdminApi, LogFileResponse } from '../../admin-api';
import { formatSize } from '../../backups/backup-format';
import { LOG_FILE_PATH, logFileQuery, logSeriesLabel, olderLogFileGroups } from '../log-files';
import { LogPageAccess } from '../log-page-access';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-admin-log-files',
  imports: [RouterLink, NeedsConnection],
  templateUrl: './admin-log-files.html',
  styleUrl: './admin-log-files.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLogFiles {
  private readonly api = inject(AdminApi);
  private readonly access = inject(LogPageAccess);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly filePath = LOG_FILE_PATH;
  protected readonly query = (file: LogFileResponse) => logFileQuery(file.name);
  protected readonly state = signal<LoadState>('loading');
  protected readonly available = signal(false);
  protected readonly files = signal<LogFileResponse[]>([]);
  protected readonly groups = computed(() => olderLogFileGroups(this.files()));

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus());
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .logFiles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ available, files }) => {
          this.available.set(available);
          this.files.set(files);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (!this.access.leavesOn(failure)) {
            this.state.set('error');
          }
        },
      });
  }

  protected groupTitle(series: string): string {
    return logSeriesLabel(series) ?? series;
  }

  protected fileMeta(file: LogFileResponse): string {
    return `${formatSize(file.sizeBytes)} · ${formatBankTime(file.changedAt)}`;
  }
}
