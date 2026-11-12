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
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import { formatBankTime, pragueDay } from '../../donations/donation-date';
import { AdminApi, DiagnosticsResponse, LogFileResponse } from '../admin-api';
import { formatSize } from '../backups/backup-format';
import { HealthIcon } from './health-icon/health-icon';
import {
  currentLogFiles,
  LOG_FILE_PATH,
  LOG_FILES_PATH,
  logFileQuery,
  logSeries,
  logSeriesLabel,
  olderLogFileGroups,
} from './log-files';
import { LogPageAccess } from './log-page-access';
import { serverHealth, ServerHealthKind } from './server-health';
import { LogsToday, TODAY_FILE } from './today/logs-today';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-admin-logs',
  imports: [RouterLink, NeedsConnection, HealthIcon, LogsToday],
  templateUrl: './admin-logs.html',
  styleUrl: './admin-logs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLogs {
  private readonly api = inject(AdminApi);
  private readonly access = inject(LogPageAccess);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly filesPath = LOG_FILES_PATH;
  protected readonly filePath = LOG_FILE_PATH;
  protected readonly query = (file: LogFileResponse) => logFileQuery(file.name);
  protected readonly filesState = signal<LoadState>('loading');
  protected readonly available = signal(false);
  protected readonly files = signal<LogFileResponse[]>([]);
  protected readonly healthState = signal<LoadState>('loading');
  protected readonly diagnostics = signal<DiagnosticsResponse | null>(null);

  protected readonly current = computed(() => currentLogFiles(this.files()));
  protected readonly showsToday = computed(
    () =>
      this.filesState() === 'ready' &&
      this.available() &&
      this.files().some((file) => file.name === TODAY_FILE),
  );
  protected readonly today = computed(() =>
    pragueDay(this.diagnostics()?.now ?? new Date().toISOString()),
  );
  protected readonly olderCount = computed(() =>
    olderLogFileGroups(this.files()).reduce((count, group) => count + group.files.length, 0),
  );
  protected readonly health = computed(() => {
    const diagnostics = this.diagnostics();
    return diagnostics === null ? null : serverHealth(diagnostics);
  });
  protected readonly healthSummary = computed(
    () =>
      this.health()?.findings[0] ??
      $localize`:@@admin.logs.health.allFine:Databáze odpovídá a složky jsou připojené.`,
  );
  protected readonly overrides = computed(() => this.diagnostics()?.logLevelOverrides.length ?? 0);

  constructor() {
    this.loadFiles();
    this.loadHealth();
    afterNextRender(() => this.title().nativeElement.focus());
  }

  protected loadFiles(): void {
    this.filesState.set('loading');
    this.api
      .logFiles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ available, files }) => {
          this.available.set(available);
          this.files.set(files);
          this.filesState.set('ready');
        },
        error: (failure: unknown) => {
          if (!this.access.leavesOn(failure)) {
            this.filesState.set('error');
          }
        },
      });
  }

  protected loadHealth(): void {
    this.healthState.set('loading');
    this.api
      .diagnostics()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (diagnostics) => {
          this.diagnostics.set(diagnostics);
          this.healthState.set('ready');
        },
        error: (failure: unknown) => {
          if (!this.access.leavesOn(failure)) {
            this.healthState.set('error');
          }
        },
      });
  }

  protected healthTitle(kind: ServerHealthKind): string {
    switch (kind) {
      case 'ok':
        return $localize`:@@admin.logs.health.ok:Bez poruchy`;
      case 'attention':
        return $localize`:@@admin.logs.health.attention:Něco potřebuje pozornost`;
      case 'failure':
        return $localize`:@@admin.logs.health.failure:Porucha`;
    }
  }

  protected fileMeta(file: LogFileResponse): string {
    const label = logSeriesLabel(logSeries(file.name));
    const facts = `${formatSize(file.sizeBytes)} · ${formatBankTime(file.changedAt)}`;
    return label === null ? facts : `${label} · ${facts}`;
  }
}
