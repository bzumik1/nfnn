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
import { ActivatedRoute } from '@angular/router';
import { describeProblem } from '../../../../core/auth/api-problem';
import { CopyButton } from '../../../../shared/ui/copy-button/copy-button';
import { FocusFirstInvalid } from '../../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../../shared/ui/form-field/form-control';
import { FormField } from '../../../../shared/ui/form-field/form-field';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { AdminApi, LogMatchResponse, LogSearchResponse, LogWindowResponse } from '../../admin-api';
import { LogPageAccess } from '../log-page-access';

type RequestState = 'idle' | 'loading' | 'error';

export const WINDOW_BYTES = 20000;
export const SEARCH_LIMIT = 50;
export const BROWSER_ERRORS_PATTERN = 'Browser error';

@Component({
  selector: 'app-admin-log-reader',
  imports: [
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    CopyButton,
    NeedsConnection,
  ],
  templateUrl: './admin-log-reader.html',
  styleUrl: './admin-log-reader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLogReader {
  private readonly api = inject(AdminApi);
  private readonly access = inject(LogPageAccess);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly file = inject(ActivatedRoute).snapshot.queryParamMap.get('nazev') ?? '';
  protected readonly window = signal<LogWindowResponse | null>(null);
  protected readonly windowState = signal<RequestState>('idle');
  protected readonly windowError = signal('');
  protected readonly search = signal<LogSearchResponse | null>(null);
  protected readonly searchState = signal<RequestState>('idle');
  protected readonly searchError = signal('');

  protected pattern = '';

  protected readonly searchMessages = {
    required: $localize`:@@admin.logs.search.required:Napište, co hledat.`,
  };
  protected readonly windowRange = computed(() => {
    const window = this.window();
    if (window === null) {
      return '';
    }
    if (!window.hasOlder && !window.hasNewer) {
      return $localize`:@@admin.logs.window.whole:Celý log`;
    }
    if (!window.hasNewer) {
      return $localize`:@@admin.logs.window.end.label:Konec logu`;
    }
    if (!window.hasOlder) {
      return $localize`:@@admin.logs.window.start:Začátek logu`;
    }
    return $localize`:@@admin.logs.window.middle:Starší část logu`;
  });
  protected readonly matches = computed(() => this.search()?.matches ?? []);

  constructor() {
    this.show(null);
    afterNextRender(() => this.title().nativeElement.focus());
  }

  protected toEnd(): void {
    this.show(null);
  }

  protected older(): void {
    const window = this.window();
    if (window !== null && window.hasOlder) {
      this.show(Math.max(0, window.from - WINDOW_BYTES));
    }
  }

  protected newer(): void {
    const window = this.window();
    if (window !== null && window.hasNewer) {
      this.show(window.to);
    }
  }

  protected showMatch(match: LogMatchResponse): void {
    this.show(match.offset);
  }

  protected find(form: NgForm): void {
    if (form.invalid) {
      return;
    }
    this.searchFor(this.pattern.trim());
  }

  protected findBrowserErrors(): void {
    this.pattern = BROWSER_ERRORS_PATTERN;
    this.searchFor(BROWSER_ERRORS_PATTERN);
  }

  protected olderMatches(): void {
    const current = this.search();
    if (current === null || !current.moreOlder) {
      return;
    }
    this.searchState.set('loading');
    this.api
      .searchLog(this.file, this.pattern.trim(), current.scannedFrom, SEARCH_LIMIT)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.search.set({ ...result, matches: [...current.matches, ...result.matches] });
          this.searchState.set('idle');
        },
        error: (failure: unknown) => this.failSearch(failure),
      });
  }

  private searchFor(pattern: string): void {
    this.searchState.set('loading');
    this.searchError.set('');
    this.api
      .searchLog(this.file, pattern, null, SEARCH_LIMIT)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.search.set(result);
          this.searchState.set('idle');
        },
        error: (failure: unknown) => this.failSearch(failure),
      });
  }

  private show(from: number | null): void {
    this.windowState.set('loading');
    this.windowError.set('');
    this.api
      .logWindow(this.file, from, WINDOW_BYTES)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (window) => {
          this.window.set(window);
          this.windowState.set('idle');
        },
        error: (failure: unknown) => {
          if (this.access.leavesOn(failure)) {
            return;
          }
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
    if (this.access.leavesOn(failure)) {
      return;
    }
    this.searchState.set('error');
    this.searchError.set(
      describeProblem(
        failure,
        $localize`:@@admin.logs.search.failed:Hledání se nepodařilo. Zkuste to prosím znovu.`,
      ),
    );
  }
}
