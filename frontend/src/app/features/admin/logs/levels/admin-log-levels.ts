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
import { FormsModule, NgForm } from '@angular/forms';
import { describeProblem } from '../../../../core/auth/api-problem';
import { Dialog } from '../../../../shared/ui/dialog/dialog';
import { FocusFirstInvalid } from '../../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../../shared/ui/form-field/form-control';
import { FormField } from '../../../../shared/ui/form-field/form-field';
import { LiveNotice, Notice } from '../../../../shared/ui/live-notice/live-notice';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { RadioGroup } from '../../../../shared/ui/radio-group/radio-group';
import { formatBankTime } from '../../../donations/donation-date';
import { AdminApi, LogLevel, LoggerResponse } from '../../admin-api';
import { LogPageAccess } from '../log-page-access';
import { canTrace, loggerDescription, remainingText } from './level-texts';

type LoadState = 'loading' | 'ready' | 'error';

interface Duration {
  readonly minutes: number;
  readonly label: string;
}

export const LOG_LEVELS: readonly LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF'];
export const DURATIONS: readonly Duration[] = [
  { minutes: 15, label: $localize`:@@admin.logs.level.duration.quarter:15 min` },
  { minutes: 30, label: $localize`:@@admin.logs.level.duration.half:30 min` },
  { minutes: 60, label: $localize`:@@admin.logs.level.duration.hour:1 h` },
  { minutes: 240, label: $localize`:@@admin.logs.level.duration.fourHours:4 h` },
];
export const DEFAULT_DURATION = DURATIONS[1];
export const COUNTDOWN_TICK_MS = 30_000;
const LOGGER_NAME = /^(ROOT|[A-Za-z0-9_$][A-Za-z0-9_$.]*)$/;

@Component({
  selector: 'app-admin-log-levels',
  imports: [
    Dialog,
    FocusFirstInvalid,
    FormControlDirective,
    FormField,
    FormsModule,
    LiveNotice,
    NeedsConnection,
    RadioGroup,
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
  protected readonly notice = signal<Notice | null>(null);
  protected readonly resetting = signal<string | null>(null);
  protected readonly now = signal(Date.now());

  protected readonly editing = signal<{ readonly logger: string | null } | null>(null);
  protected readonly level = signal<LogLevel>('DEBUG');
  protected readonly duration = signal<Duration>(DEFAULT_DURATION);
  protected readonly saving = signal(false);
  protected readonly sheetError = signal('');
  protected otherLogger = '';

  protected readonly levels = LOG_LEVELS;
  protected readonly durations = DURATIONS;
  protected readonly loggerPattern = LOGGER_NAME.source;
  protected readonly loggerMessages = {
    required: $localize`:@@admin.logs.level.logger.required:Napište název loggeru, třeba cz.novanadeje.app.`,
    pattern: $localize`:@@admin.logs.level.logger.invalid:Název loggeru je ROOT nebo tečkami oddělený název balíčku či třídy.`,
    maxlength: $localize`:@@admin.logs.level.logger.tooLong:Název loggeru je příliš dlouhý.`,
  };

  protected readonly overrides = computed(() =>
    this.loggers().filter((entry) => entry.override !== null),
  );

  constructor() {
    this.load();
    const tick = setInterval(() => this.now.set(Date.now()), COUNTDOWN_TICK_MS);
    this.destroyRef.onDestroy(() => clearInterval(tick));
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

  protected edit(entry: LoggerResponse | null): void {
    this.otherLogger = '';
    this.level.set(entry?.override?.level ?? 'DEBUG');
    this.duration.set(DEFAULT_DURATION);
    this.sheetError.set('');
    this.editing.set({ logger: entry?.logger ?? null });
  }

  protected closeSheet(): void {
    this.editing.set(null);
  }

  protected traceAllowed(): boolean {
    const editing = this.editing();
    return canTrace(editing?.logger ?? this.otherLogger.trim());
  }

  protected chooseLevel(level: LogLevel): void {
    this.level.set(level);
  }

  protected chooseDuration(duration: Duration): void {
    this.duration.set(duration);
  }

  protected save(form: NgForm): void {
    const editing = this.editing();
    if (editing === null || form.invalid || this.saving()) {
      return;
    }
    const logger = editing.logger ?? this.otherLogger.trim();
    const level = this.level() === 'TRACE' && !canTrace(logger) ? 'DEBUG' : this.level();
    this.saving.set(true);
    this.sheetError.set('');
    this.api
      .setLogLevel(logger, level, this.duration().minutes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (override) => {
          this.saving.set(false);
          this.editing.set(null);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.logs.level.set:Logger ${override.logger}:logger: má úroveň ${override.level}:level: do ${formatBankTime(override.until)}:until:.`,
          });
          this.reload();
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          if (this.access.leavesOn(failure)) {
            return;
          }
          this.sheetError.set(
            describeProblem(
              failure,
              $localize`:@@admin.logs.level.failed:Úroveň se nepodařilo změnit. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  protected reset(entry: LoggerResponse): void {
    if (this.resetting() !== null) {
      return;
    }
    this.resetting.set(entry.logger);
    this.notice.set(null);
    this.api
      .resetLogLevel(entry.logger)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resetting.set(null);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.logs.level.reset:Logger ${entry.logger}:logger: má zase původní úroveň.`,
          });
          this.reload();
        },
        error: (failure: unknown) => {
          this.resetting.set(null);
          if (this.access.leavesOn(failure)) {
            return;
          }
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.logs.level.resetFailed:Úroveň se nepodařilo vrátit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected description(entry: LoggerResponse): string | null {
    return loggerDescription(entry.logger);
  }

  protected overrideText(entry: LoggerResponse): string {
    const override = entry.override;
    if (override === null) {
      return '';
    }
    const before = override.configuredBefore ?? $localize`:@@admin.logs.level.inherited:zděděno`;
    return `${before} → ${override.level} · ${remainingText(override.until, this.now())}`;
  }

  protected resetLabel(entry: LoggerResponse): string {
    return $localize`:@@admin.logs.level.reset.label:Vrátit úroveň loggeru ${entry.logger}:logger:`;
  }

  protected submitLabel(): string {
    return $localize`:@@admin.logs.level.submitFor:Nastavit na ${this.duration().label}:duration:`;
  }

  private reload(): void {
    this.api
      .logLevels()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ loggers }) => this.loggers.set(loggers));
  }
}
