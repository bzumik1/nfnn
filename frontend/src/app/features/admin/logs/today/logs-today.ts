import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { RouterLink } from '@angular/router';
import { LoadFailure } from '../../../../shared/ui/load-failure/load-failure';
import { pragueTime } from '../../../donations/donation-date';
import { AdminApi, LogSearchResponse } from '../../admin-api';
import { HealthIcon } from '../health-icon/health-icon';
import { LOG_FILE_PATH } from '../log-files';
import { LogPageAccess } from '../log-page-access';
import { LevelIcon } from '../reader/level-icon/level-icon';
import { levelLabel } from '../reader/level-labels';
import { levelPattern, LogEntry } from '../reader/log-lines';
import { todayProblems } from './today-problems';

type LoadState = 'loading' | 'ready' | 'error';

export const TODAY_FILE = 'backend.log';
export const TODAY_LIMIT = 50;
export const TODAY_SHOWN = 5;

@Component({
  selector: 'app-logs-today',
  imports: [RouterLink, LoadFailure, HealthIcon, LevelIcon],
  templateUrl: './logs-today.html',
  styleUrl: './logs-today.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogsToday {
  private readonly api = inject(AdminApi);
  private readonly access = inject(LogPageAccess);
  private readonly destroyRef = inject(DestroyRef);

  readonly today = input.required<string>();

  protected readonly filePath = LOG_FILE_PATH;
  protected readonly allQuery = { nazev: TODAY_FILE, uroven: 'varovani' };
  protected readonly state = signal<LoadState>('loading');
  protected readonly retrying = signal(false);
  protected readonly result = signal<LogSearchResponse | null>(null);
  protected readonly problems = computed(() =>
    todayProblems(this.result()?.matches ?? [], this.today()),
  );
  protected readonly shown = computed(() => this.problems().slice(0, TODAY_SHOWN));
  protected readonly truncated = computed(() => {
    const result = this.result();
    const oldest = result?.matches.at(-1);
    return (
      result !== null &&
      result.moreOlder &&
      oldest !== undefined &&
      todayProblems([oldest], this.today()).length > 0
    );
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.state.set('loading');
    this.fetch();
  }

  protected retry(): void {
    this.retrying.set(true);
    this.fetch();
  }

  private fetch(): void {
    this.api
      .searchLog(TODAY_FILE, levelPattern('spring', 'warnings') ?? '', null, TODAY_LIMIT)
      .pipe(
        finalize(() => this.retrying.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (!this.access.leavesOn(failure)) {
            this.state.set('error');
          }
        },
      });
  }

  protected entryQuery(entry: LogEntry): { nazev: string; od: number } {
    return { nazev: TODAY_FILE, od: entry.offset };
  }

  protected label(entry: LogEntry): string {
    return levelLabel(entry.level);
  }

  protected time(entry: LogEntry): string {
    return entry.at === null ? '' : pragueTime(entry.at);
  }
}
