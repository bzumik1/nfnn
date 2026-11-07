import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { describeProblem } from '../../../../core/auth/api-problem';
import { FocusFirstInvalid } from '../../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../../shared/ui/form-field/form-control';
import { FormField } from '../../../../shared/ui/form-field/form-field';
import { LiveNotice, Notice } from '../../../../shared/ui/live-notice/live-notice';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { formatBankTime } from '../../../donations/donation-date';
import { AdminApi, LogLevel, LoggerResponse } from '../../admin-api';
import { LogPageAccess } from '../log-page-access';

type LoadState = 'loading' | 'ready' | 'error';
type RequestState = 'idle' | 'loading';

export const LOG_LEVELS: readonly LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF'];
export const DEFAULT_OVERRIDE_MINUTES = 30;
export const MAX_OVERRIDE_MINUTES = 1440;
const LOGGER_NAME = /^(ROOT|[A-Za-z0-9_$][A-Za-z0-9_$.]*)$/;

@Component({
  selector: 'app-admin-log-levels',
  imports: [
    LiveNotice,
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    NeedsConnection,
  ],
  templateUrl: './admin-log-levels.html',
  styleUrl: './admin-log-levels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLogLevels {
  private readonly api = inject(AdminApi);
  private readonly access = inject(LogPageAccess);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly state = signal<LoadState>('loading');
  protected readonly loggers = signal<LoggerResponse[]>([]);
  protected readonly levelState = signal<RequestState>('idle');
  protected readonly levelNotice = signal<Notice | null>(null);
  protected readonly resetting = signal<string | null>(null);

  protected logger = '';
  protected level: LogLevel = 'DEBUG';
  protected minutes = DEFAULT_OVERRIDE_MINUTES;

  protected readonly levels = LOG_LEVELS;
  protected readonly maxMinutes = MAX_OVERRIDE_MINUTES;
  protected readonly loggerPattern = LOGGER_NAME.source;
  protected readonly loggerMessages = {
    required: $localize`:@@admin.logs.level.logger.required:Napište název loggeru, třeba cz.novanadeje.app.`,
    pattern: $localize`:@@admin.logs.level.logger.invalid:Název loggeru je ROOT nebo tečkami oddělený název balíčku či třídy.`,
    maxlength: $localize`:@@admin.logs.level.logger.tooLong:Název loggeru je příliš dlouhý.`,
  };
  protected readonly minutesMessages = {
    required: $localize`:@@admin.logs.level.minutes.required:Napište, na kolik minut.`,
    min: $localize`:@@admin.logs.level.minutes.range:Zadejte 1 až 1440 minut (nejdéle jeden den).`,
    max: $localize`:@@admin.logs.level.minutes.range:Zadejte 1 až 1440 minut (nejdéle jeden den).`,
  };

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus());
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .logLevels()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ loggers }) => {
          this.loggers.set(loggers);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (!this.access.leavesOn(failure)) {
            this.state.set('error');
          }
        },
      });
  }

  protected setLevel(form: NgForm): void {
    if (form.invalid || this.levelState() === 'loading') {
      return;
    }
    this.levelState.set('loading');
    this.levelNotice.set(null);
    this.api
      .setLogLevel(this.logger.trim(), this.level, this.minutes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (override) => {
          this.levelState.set('idle');
          this.levelNotice.set({
            kind: 'status',
            text: $localize`:@@admin.logs.level.set:Logger ${override.logger}:logger: má úroveň ${override.level}:level: do ${formatBankTime(override.until)}:until:.`,
          });
          this.reload();
        },
        error: (failure: unknown) => {
          this.levelState.set('idle');
          this.levelNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.logs.level.failed:Úroveň se nepodařilo změnit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected reset(entry: LoggerResponse): void {
    if (this.resetting() !== null) {
      return;
    }
    this.resetting.set(entry.logger);
    this.levelNotice.set(null);
    this.api
      .resetLogLevel(entry.logger)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resetting.set(null);
          this.levelNotice.set({
            kind: 'status',
            text: $localize`:@@admin.logs.level.reset:Logger ${entry.logger}:logger: má zase původní úroveň.`,
          });
          this.reload();
        },
        error: (failure: unknown) => {
          this.resetting.set(null);
          this.levelNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.logs.level.resetFailed:Úroveň se nepodařilo vrátit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected resetLabel(entry: LoggerResponse): string {
    return $localize`:@@admin.logs.level.reset.label:Vrátit úroveň loggeru ${entry.logger}:logger:`;
  }

  protected describeOverride(entry: LoggerResponse): string {
    const override = entry.override;
    return override === null
      ? ''
      : $localize`:@@admin.logs.level.until:do ${formatBankTime(override.until)}:until:`;
  }

  private reload(): void {
    this.api
      .logLevels()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ loggers }) => this.loggers.set(loggers));
  }
}
