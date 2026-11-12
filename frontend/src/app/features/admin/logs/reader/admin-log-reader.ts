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
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { describeProblem } from '../../../../core/auth/api-problem';
import { CopyButton } from '../../../../shared/ui/copy-button/copy-button';
import { Dialog } from '../../../../shared/ui/dialog/dialog';
import { LiveNotice, Notice } from '../../../../shared/ui/live-notice/live-notice';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { RadioGroup } from '../../../../shared/ui/radio-group/radio-group';
import { formatDonationDate, pragueDay, pragueTime } from '../../../donations/donation-date';
import { AdminApi, LogSearchResponse, LogWindowResponse } from '../../admin-api';
import { LogPageAccess } from '../log-page-access';
import { LevelIcon } from './level-icon/level-icon';
import { levelLabel } from './level-labels';
import {
  exceptionOf,
  frameOf,
  LoggedException,
  MessageSegment,
  segmentsOf,
  StackFrame,
} from './message-segments';
import {
  entriesOf,
  LevelFilter,
  levelPattern,
  LogEntry,
  LogLevelName,
  linesOf,
  logFormat,
} from './log-lines';
import { LogTimeline, mergeWindow, startTimeline } from './log-timeline';

type LoadState = 'loading' | 'ready' | 'error';

interface SearchResults {
  readonly entries: readonly LogEntry[];
  readonly moreOlder: boolean;
  readonly scannedFrom: number;
}

interface EntryDay {
  readonly day: string;
  readonly title: string;
  readonly entries: LogEntry[];
}

export const WINDOW_BYTES = 20000;
export const SEARCH_LIMIT = 50;
export const MAX_PATTERN_LENGTH = 200;
export const BROWSER_ERRORS_PATTERN = 'Browser error';
const FILTER_PARAMS: Readonly<Record<string, LevelFilter>> = {
  varovani: 'warnings',
  chyby: 'errors',
};

@Component({
  selector: 'app-admin-log-reader',
  imports: [FormsModule, CopyButton, Dialog, LiveNotice, NeedsConnection, LevelIcon, RadioGroup],
  templateUrl: './admin-log-reader.html',
  styleUrl: './admin-log-reader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLogReader {
  private readonly api = inject(AdminApi);
  private readonly access = inject(LogPageAccess);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly file = this.params.get('nazev') ?? '';
  protected readonly format = logFormat(this.file);
  protected readonly filters = levelPattern(this.format, 'errors') !== null;
  protected readonly browserErrors = this.format === 'spring';

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly timeline = signal<LogTimeline | null>(null);
  protected readonly loadingMore = signal<'older' | 'newer' | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly filter = signal<LevelFilter>('all');
  protected readonly appliedQuery = signal('');
  protected readonly results = signal<SearchResults | null>(null);
  protected readonly searching = signal(false);
  protected readonly searchError = signal('');
  protected readonly focused = signal<number | null>(null);
  protected readonly opened = signal<LogEntry | null>(null);

  private readonly segmentCache = new Map<string, readonly MessageSegment[]>();

  protected query = '';
  protected readonly maxPattern = MAX_PATTERN_LENGTH;

  protected readonly searchMode = computed(
    () => this.filter() !== 'all' || this.appliedQuery() !== '',
  );
  protected readonly entries = computed<readonly LogEntry[]>(() => {
    if (this.searchMode()) {
      return this.results()?.entries ?? [];
    }
    const timeline = this.timeline();
    return timeline === null ? [] : entriesOf(timeline.lines, this.format).reverse();
  });
  protected readonly days = computed(() => daysOf(this.entries()));
  protected readonly hasOlder = computed(() =>
    this.searchMode() ? (this.results()?.moreOlder ?? false) : (this.timeline()?.hasOlder ?? false),
  );
  protected readonly loadedText = computed(() =>
    [...this.entries()]
      .reverse()
      .map((entry) => entry.raw)
      .join('\n'),
  );

  constructor() {
    this.start();
    afterNextRender(() => this.title().nativeElement.focus());
  }

  protected loadTail(): void {
    this.state.set('loading');
    this.loadWindow(null, (window) => {
      this.timeline.set(startTimeline(window));
      this.state.set('ready');
    });
  }

  protected loadOlder(): void {
    if (this.searchMode()) {
      this.runSearch(this.results()?.scannedFrom ?? null);
      return;
    }
    const timeline = this.timeline();
    if (timeline === null) {
      return;
    }
    this.loadingMore.set('older');
    this.notice.set(null);
    this.loadWindow(Math.max(0, timeline.from - WINDOW_BYTES), (window) => {
      this.timeline.set(mergeWindow(timeline, window));
      this.loadingMore.set(null);
      this.focusEntryBefore(timeline.from);
    });
  }

  protected loadNewer(): void {
    const timeline = this.timeline();
    if (timeline === null) {
      return;
    }
    this.loadingMore.set('newer');
    this.notice.set(null);
    this.loadWindow(timeline.to, (window) => {
      const before = timeline.lines.length;
      const merged = mergeWindow(timeline, window);
      this.timeline.set(merged);
      this.loadingMore.set(null);
      if (merged.lines.length === before) {
        this.notice.set({
          kind: 'status',
          text: $localize`:@@admin.logs.reader.noNewer:Žádné nové řádky.`,
        });
      }
    });
  }

  protected choose(filter: LevelFilter): void {
    this.filter.set(filter);
    this.refreshResults();
  }

  protected find(): void {
    this.appliedQuery.set(this.query.trim());
    this.refreshResults();
  }

  protected queryChanged(value: string): void {
    if (value.trim() === '' && this.appliedQuery() !== '') {
      this.appliedQuery.set('');
      this.refreshResults();
    }
  }

  protected findBrowserErrors(): void {
    this.query = BROWSER_ERRORS_PATTERN;
    this.filter.set('all');
    this.find();
  }

  protected open(entry: LogEntry): void {
    this.opened.set(entry);
  }

  protected close(): void {
    this.opened.set(null);
  }

  protected showSurroundings(entry: LogEntry): void {
    this.opened.set(null);
    this.filter.set('all');
    this.query = '';
    this.appliedQuery.set('');
    this.results.set(null);
    this.searchError.set('');
    this.loadAround(entry.offset);
  }

  private start(): void {
    const around = Number(this.params.get('od') ?? Number.NaN);
    if (Number.isInteger(around) && around >= 0) {
      this.loadAround(around);
    } else {
      this.loadTail();
    }
    const filter = FILTER_PARAMS[this.params.get('uroven') ?? ''];
    if (filter !== undefined && this.filters) {
      this.choose(filter);
    }
  }

  private loadAround(offset: number): void {
    this.state.set('loading');
    this.loadWindow(Math.max(0, offset - WINDOW_BYTES / 2), (window) => {
      this.timeline.set(startTimeline(window));
      this.state.set('ready');
      this.focused.set(offset);
      this.focusEntryAt(offset);
    });
  }

  protected isFocused(entry: LogEntry): boolean {
    const target = this.focused();
    return target !== null && this.containing(target)?.offset === entry.offset;
  }

  protected time(entry: LogEntry): string {
    return entry.at === null ? '' : pragueTime(entry.at);
  }

  protected when(entry: LogEntry): string {
    return entry.at === null
      ? ''
      : `${formatDonationDate(pragueDay(entry.at))} ${pragueTime(entry.at)}`;
  }

  protected levelLabel(level: LogLevelName | null): string {
    return levelLabel(level);
  }

  protected sheetTitle(entry: LogEntry): string {
    const level = this.levelLabel(entry.level) || $localize`:@@admin.logs.reader.entry:Záznam`;
    const time = this.time(entry);
    return time === ''
      ? level
      : $localize`:@@admin.logs.reader.sheetTitle:${level}:level: v ${time}:time:`;
  }

  protected segments(message: string): readonly MessageSegment[] {
    const known = this.segmentCache.get(message);
    if (known !== undefined) {
      return known;
    }
    const segments = segmentsOf(message);
    this.segmentCache.set(message, segments);
    return segments;
  }

  protected exception(entry: LogEntry): LoggedException | null {
    return exceptionOf(entry.details);
  }

  protected summary(entry: LogEntry): { exception: string | null; lines: number } | null {
    const thrown = exceptionOf(entry.details);
    const lines =
      thrown?.frames.length ?? entry.details.filter((line) => line.trim() !== '').length;
    return thrown === null && lines === 0 ? null : { exception: thrown?.name ?? null, lines };
  }

  protected details(entry: LogEntry): string {
    return entry.details.filter((line) => line.trim() !== '').join('\n');
  }

  protected frame(line: string): StackFrame | null {
    return frameOf(line);
  }

  private refreshResults(): void {
    this.searchError.set('');
    this.notice.set(null);
    if (!this.searchMode()) {
      this.results.set(null);
      return;
    }
    this.results.set(null);
    this.runSearch(null);
  }

  private runSearch(before: number | null): void {
    const pattern = this.pattern();
    if (pattern.length > MAX_PATTERN_LENGTH) {
      this.searchError.set(
        $localize`:@@admin.logs.reader.patternTooLong:Výraz je i s filtrem úrovně delší než 200 znaků. Zkraťte ho.`,
      );
      return;
    }
    const earlier = before === null ? [] : (this.results()?.entries ?? []);
    this.searching.set(true);
    this.api
      .searchLog(this.file, pattern, before, SEARCH_LIMIT)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.searching.set(false);
          this.results.set(this.resultsOf(result, earlier));
          if (before !== null && result.matches.length > 0) {
            this.focusEntryAt(result.matches[0].offset);
          }
        },
        error: (failure: unknown) => {
          this.searching.set(false);
          if (this.access.leavesOn(failure)) {
            return;
          }
          this.results.set(null);
          this.searchError.set(
            describeProblem(
              failure,
              $localize`:@@admin.logs.search.failed:Hledání se nepodařilo. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  private pattern(): string {
    const filter = this.filter();
    const level = filter === 'all' ? null : levelPattern(this.format, filter);
    const query = this.appliedQuery();
    if (level !== null && query !== '') {
      return `${level}.*(?:${query})`;
    }
    return level ?? query;
  }

  private resultsOf(result: LogSearchResponse, earlier: readonly LogEntry[]): SearchResults {
    const found = result.matches.flatMap((match) =>
      entriesOf(linesOf({ from: match.offset, text: match.line }), this.format),
    );
    return {
      entries: [...earlier, ...found],
      moreOlder: result.moreOlder,
      scannedFrom: result.scannedFrom,
    };
  }

  private loadWindow(from: number | null, done: (window: LogWindowResponse) => void): void {
    this.api
      .logWindow(this.file, from, WINDOW_BYTES)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: done,
        error: (failure: unknown) => {
          this.loadingMore.set(null);
          if (this.access.leavesOn(failure)) {
            return;
          }
          const text = describeProblem(
            failure,
            $localize`:@@admin.logs.window.failed:Log se nepodařilo načíst. Zkuste to prosím znovu.`,
          );
          if (this.state() === 'loading') {
            this.loadError.set(text);
            this.state.set('error');
          } else {
            this.notice.set({ kind: 'alert', text });
          }
        },
      });
  }

  private containing(offset: number): LogEntry | undefined {
    return this.entries().find((entry) => entry.offset <= offset);
  }

  private focusEntryBefore(offset: number): void {
    const next = this.entries().find((entry) => entry.offset < offset);
    if (next !== undefined) {
      this.focusEntryAt(next.offset);
    }
  }

  private focusEntryAt(offset: number): void {
    afterNextRender(
      () => {
        const target = this.containing(offset);
        const element = this.host.nativeElement.querySelector<HTMLElement>(
          `[data-offset="${target?.offset ?? offset}"]`,
        );
        element?.focus();
        element?.scrollIntoView?.({ block: 'center' });
      },
      { injector: this.injector },
    );
  }
}

function daysOf(entries: readonly LogEntry[]): EntryDay[] {
  const days: EntryDay[] = [];
  for (const entry of entries) {
    const day = entry.at === null ? (days.at(-1)?.day ?? '') : pragueDay(entry.at);
    const current = days.at(-1);
    if (current !== undefined && current.day === day) {
      current.entries.push(entry);
    } else {
      days.push({ day, title: day === '' ? '' : formatDonationDate(day), entries: [entry] });
    }
  }
  return days;
}
