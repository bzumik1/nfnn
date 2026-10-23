import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { formatBankTime } from '../../donations/donation-date';
import {
  AdminApi,
  DiagnosticsResponse,
  DiskSpaceResponse,
  LogFileResponse,
  LogLevel,
  LoggerResponse,
  LogMatchResponse,
  LogSearchResponse,
  LogWindowResponse,
} from '../admin-api';
import { formatSize } from '../backups/backup-format';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';

type LoadState = 'loading' | 'ready' | 'error';
type RequestState = 'idle' | 'loading' | 'error';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
export const WINDOW_BYTES = 20000;
export const SEARCH_LIMIT = 50;
export const LOG_LEVELS: readonly LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF'];
export const DEFAULT_OVERRIDE_MINUTES = 30;
export const MAX_OVERRIDE_MINUTES = 1440;
const LOGGER_NAME = /^(ROOT|[A-Za-z0-9_$][A-Za-z0-9_$.]*)$/;

@Component({
  selector: 'app-admin-logs',
  imports: [LiveNotice, FormsModule, FormField, FormControlDirective, FocusFirstInvalid],
  templateUrl: './admin-logs.html',
  styleUrl: './admin-logs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLogs {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly state = signal<LoadState>('loading');
  protected readonly available = signal(false);
  protected readonly files = signal<LogFileResponse[]>([]);
  protected readonly loggers = signal<LoggerResponse[]>([]);
  protected readonly diagnostics = signal<DiagnosticsResponse | null>(null);

  protected readonly selectedFile = signal<string | null>(null);
  protected readonly window = signal<LogWindowResponse | null>(null);
  protected readonly windowState = signal<RequestState>('idle');
  protected readonly windowError = signal('');

  protected readonly search = signal<LogSearchResponse | null>(null);
  protected readonly searchState = signal<RequestState>('idle');
  protected readonly searchError = signal('');

  protected readonly levelState = signal<RequestState>('idle');
  protected readonly levelNotice = signal<Notice | null>(null);
  protected readonly resetting = signal<string | null>(null);

  protected readonly diagnosticsState = signal<RequestState>('idle');
  protected readonly threads = signal<string | null>(null);
  protected readonly threadsState = signal<RequestState>('idle');

  protected pattern = '';
  protected logger = '';
  protected level: LogLevel = 'DEBUG';
  protected minutes = DEFAULT_OVERRIDE_MINUTES;

  protected readonly levels = LOG_LEVELS;
  protected readonly maxMinutes = MAX_OVERRIDE_MINUTES;
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
  protected readonly searchMessages = {
    required: $localize`:@@admin.logs.search.required:Napište, co hledat.`,
  };
  protected readonly loggerPattern = LOGGER_NAME.source;

  protected readonly overrides = computed(() =>
    this.loggers().filter((entry) => entry.override !== null),
  );
  protected readonly windowRange = computed(() => {
    const window = this.window();
    if (window === null) {
      return '';
    }
    return $localize`:@@admin.logs.window.range:Bajty ${window.from}:from:–${window.to}:to: z ${window.sizeBytes}:size:`;
  });
  protected readonly matches = computed(() => this.search()?.matches ?? []);
  protected readonly jvmRows = computed(() => {
    const jvm = this.diagnostics()?.jvm;
    if (!jvm) {
      return [];
    }
    return [
      { label: $localize`:@@admin.logs.diagnostics.java:Java`, value: jvm.javaVersion },
      {
        label: $localize`:@@admin.logs.diagnostics.startedAt:Běží od`,
        value: formatBankTime(jvm.startedAt),
      },
      {
        label: $localize`:@@admin.logs.diagnostics.heap:Paměť (heap)`,
        value: $localize`:@@admin.logs.diagnostics.heap.value:${formatSize(jvm.heapUsedBytes)}:used: z ${formatSize(jvm.heapMaxBytes)}:max:, mimo heap ${formatSize(jvm.nonHeapUsedBytes)}:nonHeap:`,
      },
      {
        label: $localize`:@@admin.logs.diagnostics.threads:Vlákna`,
        value: $localize`:@@admin.logs.diagnostics.threads.value:${jvm.liveThreads}:live: (nejvíc ${jvm.peakThreads}:peak:, z toho ${jvm.daemonThreads}:daemon: na pozadí)`,
      },
      {
        label: $localize`:@@admin.logs.diagnostics.gc:Úklid paměti`,
        value: $localize`:@@admin.logs.diagnostics.gc.value:${jvm.gcCount}:count:× za ${jvm.gcTimeMillis}:millis: ms celkem`,
      },
      {
        label: $localize`:@@admin.logs.diagnostics.load:Zatížení`,
        value: $localize`:@@admin.logs.diagnostics.load.value:${this.formatLoad(jvm.systemLoadAverage)}:load: na ${jvm.availableProcessors}:cpus: jádrech`,
      },
    ];
  });
  protected readonly databaseText = computed(() => {
    const database = this.diagnostics()?.database;
    if (!database) {
      return '';
    }
    if (!database.reachable) {
      return $localize`:@@admin.logs.diagnostics.database.down:Databáze neodpovídá (pokus trval ${database.pingMillis}:millis: ms).`;
    }
    return $localize`:@@admin.logs.diagnostics.database.up:Databáze odpovídá za ${database.pingMillis}:millis: ms; spojení ${database.activeConnections}:active: v práci, ${database.idleConnections}:idle: volných z ${database.maxConnections}:max:, ${database.waitingThreads}:waiting: čeká.`;
  });

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    forkJoin({
      files: this.api.logFiles(),
      levels: this.api.logLevels(),
      diagnostics: this.api.diagnostics(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ files, levels, diagnostics }) => {
          this.available.set(files.available);
          this.files.set(files.files);
          this.loggers.set(levels.loggers);
          this.diagnostics.set(diagnostics);
          this.state.set('ready');
          const first = files.files.find((file) => file.name === 'backend.log') ?? files.files[0];
          if (first !== undefined) {
            this.open(first.name);
          }
        },
        error: (failure: unknown) => {
          if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
            this.sendToSignIn();
            return;
          }
          if (problemTypeEndsWith(failure, FORBIDDEN)) {
            this.router.navigateByUrl('/darce/prehled');
            return;
          }
          this.state.set('error');
        },
      });
  }

  protected open(name: string): void {
    this.selectedFile.set(name);
    this.search.set(null);
    this.searchState.set('idle');
    this.show(name, null);
  }

  protected toEnd(): void {
    const name = this.selectedFile();
    if (name !== null) {
      this.show(name, null);
    }
  }

  protected older(): void {
    const window = this.window();
    if (window === null || !window.hasOlder) {
      return;
    }
    this.show(window.name, Math.max(0, window.from - WINDOW_BYTES));
  }

  protected newer(): void {
    const window = this.window();
    if (window === null || !window.hasNewer) {
      return;
    }
    this.show(window.name, window.to);
  }

  protected showMatch(match: LogMatchResponse): void {
    const name = this.selectedFile();
    if (name !== null) {
      this.show(name, match.offset);
    }
  }

  protected find(form: NgForm): void {
    const name = this.selectedFile();
    if (form.invalid || name === null) {
      return;
    }
    this.searchState.set('loading');
    this.searchError.set('');
    this.api
      .searchLog(name, this.pattern.trim(), null, SEARCH_LIMIT)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.search.set(result);
          this.searchState.set('idle');
        },
        error: (failure: unknown) => this.failSearch(failure),
      });
  }

  protected olderMatches(): void {
    const name = this.selectedFile();
    const current = this.search();
    if (name === null || current === null || !current.moreOlder) {
      return;
    }
    this.searchState.set('loading');
    this.api
      .searchLog(name, this.pattern.trim(), current.scannedFrom, SEARCH_LIMIT)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.search.set({ ...result, matches: [...current.matches, ...result.matches] });
          this.searchState.set('idle');
        },
        error: (failure: unknown) => this.failSearch(failure),
      });
  }

  protected setLevel(form: NgForm): void {
    if (form.invalid || this.levelState() === 'loading') {
      return;
    }
    this.levelState.set('loading');
    this.levelNotice.set(null);
    const logger = this.logger.trim();
    this.api
      .setLogLevel(logger, this.level, this.minutes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (override) => {
          this.levelState.set('idle');
          this.levelNotice.set({
            kind: 'status',
            text: $localize`:@@admin.logs.level.set:Logger ${override.logger}:logger: má úroveň ${override.level}:level: do ${formatBankTime(override.until)}:until:.`,
          });
          this.reloadLevels();
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
          this.reloadLevels();
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

  protected refreshDiagnostics(): void {
    this.diagnosticsState.set('loading');
    this.api
      .diagnostics()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (diagnostics) => {
          this.diagnostics.set(diagnostics);
          this.diagnosticsState.set('idle');
        },
        error: () => this.diagnosticsState.set('error'),
      });
  }

  protected toggleThreads(): void {
    if (this.threads() !== null) {
      this.threads.set(null);
      return;
    }
    this.threadsState.set('loading');
    this.api
      .threadDump()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (dump) => {
          this.threads.set(dump);
          this.threadsState.set('idle');
        },
        error: () => this.threadsState.set('error'),
      });
  }

  protected resetLabel(entry: LoggerResponse): string {
    return $localize`:@@admin.logs.level.reset.label:Vrátit úroveň loggeru ${entry.logger}:logger:`;
  }

  protected openLabel(file: LogFileResponse): string {
    return $localize`:@@admin.logs.files.open.label:Zobrazit ${file.name}:file:`;
  }

  protected describeOverride(entry: LoggerResponse): string {
    const override = entry.override;
    if (override === null) {
      return '';
    }
    return $localize`:@@admin.logs.level.until:do ${formatBankTime(override.until)}:until:`;
  }

  protected time(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }

  protected size(bytes: number): string {
    return formatSize(bytes);
  }

  protected diskText(disk: DiskSpaceResponse): string {
    if (!disk.mounted) {
      return $localize`:@@admin.logs.diagnostics.disk.missing:${disk.path}:path:: složka není připojená.`;
    }
    return $localize`:@@admin.logs.diagnostics.disk.space:${disk.path}:path:: volných ${formatSize(disk.freeBytes)}:free: z ${formatSize(disk.totalBytes)}:total:.`;
  }

  private show(name: string, from: number | null): void {
    this.windowState.set('loading');
    this.windowError.set('');
    this.api
      .logWindow(name, from, WINDOW_BYTES)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (window) => {
          this.window.set(window);
          this.windowState.set('idle');
        },
        error: (failure: unknown) => {
          this.windowState.set('error');
          this.windowError.set(
            describeProblem(
              failure,
              $localize`:@@admin.logs.window.failed:Log se nepodařilo načíst. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  private failSearch(failure: unknown): void {
    this.searchState.set('error');
    this.searchError.set(
      describeProblem(
        failure,
        $localize`:@@admin.logs.search.failed:Hledání se nepodařilo. Zkuste to prosím znovu.`,
      ),
    );
  }

  private reloadLevels(): void {
    forkJoin({ levels: this.api.logLevels(), diagnostics: this.api.diagnostics() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ levels, diagnostics }) => {
        this.loggers.set(levels.loggers);
        this.diagnostics.set(diagnostics);
      });
  }

  private formatLoad(average: number): string {
    return average < 0
      ? '–'
      : new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(average);
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}
