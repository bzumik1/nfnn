import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, Subscription, switchMap, take, takeWhile, timer } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { pluralCategory } from '../../../../core/i18n/plural-category';
import { FocusFirstInvalid } from '../../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../../shared/ui/form-field/form-control';
import { FieldMessages, FormField } from '../../../../shared/ui/form-field/form-field';
import { LiveNotice, Notice } from '../../../../shared/ui/live-notice/live-notice';
import {
  formatBankClock,
  formatBankTime,
  formatDonationDate,
  pragueDay,
} from '../../../donations/donation-date';
import { AdminApi, HistoryImportResponse, ImportStateResponse } from '../../admin-api';
import {
  HISTORY_NEXT_STEPS,
  IMPORT_FAILURE_LABELS,
  ImportNextStep,
  ImportNextStepLink,
} from '../import-failure-labels';

const HISTORY_POLL_MS = 3000;
const HISTORY_MAX_POLLS = 40;
const EARLIEST_DAY = '2000-01-01';
const TOO_EARLY = 'donations/history-start-too-early';
const IN_FUTURE = 'donations/history-start-in-future';

const FROM_MESSAGES: FieldMessages = {
  required: $localize`:@@admin.home.history.from.required:Zadejte prosím den, od kterého se mají platby stáhnout.`,
  max: $localize`:@@admin.home.history.from.max:Zvolte prosím den nejpozději dnes.`,
  min: $localize`:@@admin.home.history.from.min:Zvolte prosím den nejdříve 01. 01. 2000.`,
};

@Component({
  selector: 'app-history-import',
  imports: [
    FormsModule,
    RouterLink,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    LiveNotice,
  ],
  templateUrl: './history-import.html',
  styleUrl: './history-import.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryImport {
  private readonly api = inject(AdminApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly fromInput = viewChild<ElementRef<HTMLInputElement>>('fromInput');
  private readonly submitButton = viewChild<ElementRef<HTMLButtonElement>>('submitButton');
  private polling: Subscription | null = null;

  readonly state = input.required<ImportStateResponse>();
  readonly finished = output<ImportStateResponse>();

  protected readonly fromMessages = FROM_MESSAGES;
  protected readonly today = pragueDay(new Date().toISOString());
  protected readonly earliest = EARLIEST_DAY;
  protected readonly from = linkedSignal({
    source: () => this.state().defaultHistoryFrom,
    computation: (day) => day,
  });
  protected readonly run = linkedSignal(() => this.state().historyImport);
  protected readonly requesting = signal(false);
  protected readonly stillRunning = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly busy = computed(() => this.requesting() || isActive(this.run()));
  protected readonly running = computed(
    () => !this.requesting() && this.run()?.status === 'RUNNING',
  );
  protected readonly nextLink = computed<ImportNextStepLink>(() => {
    const run = this.run();
    return run?.status === 'FAILED' && this.refusal() === null ? nextStepOf(run).link : null;
  });

  protected readonly notice = computed<Notice | null>(() => {
    const refusal = this.refusal();
    if (refusal !== null) {
      return { kind: 'alert', text: refusal };
    }
    if (this.stillRunning()) {
      return {
        kind: 'status',
        text: $localize`:@@admin.home.history.stillRunning:Stahování ještě běží. Výsledek zjistíte tlačítkem níže nebo po obnovení stránky.`,
      };
    }
    const run = this.run();
    return run ? describeRun(run) : null;
  });

  constructor() {
    afterNextRender(() => {
      if (isActive(this.run())) {
        this.watch();
      }
    });
  }

  protected submit(form: NgForm): void {
    if (this.busy()) {
      return;
    }
    this.refusal.set(null);
    if (form.valid && this.from() > this.today) {
      this.refuseFrom(form, 'max');
    } else if (form.valid && this.from() < EARLIEST_DAY) {
      this.refuseFrom(form, 'min');
    }
    if (form.invalid) {
      return;
    }
    this.requesting.set(true);
    this.stillRunning.set(false);
    this.api
      .requestHistoryImport(this.from())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (run) => {
          this.requesting.set(false);
          this.run.set(run);
          if (isActive(run)) {
            this.watch();
          }
        },
        error: (failure: unknown) => {
          this.requesting.set(false);
          if (problemTypeEndsWith(failure, TOO_EARLY)) {
            this.refuseFrom(form, 'min');
            return;
          }
          if (problemTypeEndsWith(failure, IN_FUTURE)) {
            this.refuseFrom(form, 'max');
            return;
          }
          this.refusal.set(
            describeProblem(
              failure,
              $localize`:@@admin.home.history.requestFailed:Požadavek se nepodařilo předat bance. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  protected checkAgain(): void {
    this.watch();
    afterNextRender(() => this.submitButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  private refuseFrom(form: NgForm, error: 'min' | 'max'): void {
    const control = form.controls['from'];
    control?.setErrors({ [error]: true });
    control?.markAsTouched();
    afterNextRender(() => this.fromInput()?.nativeElement.focus(), { injector: this.injector });
  }

  private watch(): void {
    this.polling?.unsubscribe();
    this.stillRunning.set(false);
    this.polling = timer(HISTORY_POLL_MS, HISTORY_POLL_MS)
      .pipe(
        take(HISTORY_MAX_POLLS),
        switchMap(() => this.api.importState().pipe(catchError(() => EMPTY))),
        takeWhile((state) => isActive(state.historyImport), true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (state) => {
          this.run.set(state.historyImport);
          if (!isActive(state.historyImport)) {
            this.finished.emit(state);
          }
        },
        complete: () => this.stillRunning.set(isActive(this.run())),
      });
  }
}

function isActive(run: HistoryImportResponse | null | undefined): boolean {
  return run?.status === 'QUEUED' || run?.status === 'RUNNING';
}

function describeRun(run: HistoryImportResponse): Notice {
  switch (run.status) {
    case 'QUEUED':
      return {
        kind: 'status',
        text:
          Date.parse(run.startsAt) > Date.now()
            ? $localize`:@@admin.home.history.queued:Fio přijímá jeden dotaz za 30 sekund. Stahování začne samo nejpozději v ${formatBankClock(run.startsAt)}:time:. Stránku můžete zavřít, výsledek tu uvidíte i později.`
            : $localize`:@@admin.home.history.waiting:Stahování začne za chvíli…`,
      };
    case 'RUNNING':
      return {
        kind: 'status',
        text: $localize`:@@admin.home.history.running:Stahujeme platby od ${formatDonationDate(run.from)}:from:…`,
      };
    case 'COMPLETED': {
      const from = formatDonationDate(run.from);
      const to = formatDonationDate(run.to);
      const added = addedPayments(run.added ?? 0);
      const at = finishedAt(run);
      return {
        kind: 'status',
        text: $localize`:@@admin.home.history.completed:Hotovo (${at}:time:): staženo období ${from}:from: – ${to}:to:, ${added}:added:.`,
      };
    }
    case 'HISTORY_LOCKED': {
      const at = finishedAt(run);
      return {
        kind: 'alert',
        text: $localize`:@@admin.home.history.locked:Načtení z ${at}:time: se nepovedlo, historie ve Fio byla zamčená. Odemkněte ji podle kroků výše a zkuste to znovu.`,
      };
    }
    case 'FAILED': {
      const at = finishedAt(run);
      const reason = IMPORT_FAILURE_LABELS[run.failure ?? 'UNEXPECTED'];
      const step = nextStepOf(run).text;
      return {
        kind: 'alert',
        text: $localize`:@@admin.home.history.failed:Platby se nepodařilo stáhnout (${at}:time:). Důvod: ${reason}:reason:. Co udělat: ${step}:step:`,
      };
    }
  }
}

function nextStepOf(run: HistoryImportResponse): ImportNextStep {
  return HISTORY_NEXT_STEPS[run.failure ?? 'UNEXPECTED'];
}

function finishedAt(run: HistoryImportResponse): string {
  return formatBankTime(run.finishedAt ?? run.requestedAt);
}

function addedPayments(count: number): string {
  if (count === 0) {
    return $localize`:@@admin.home.history.added.none:žádná nová platba`;
  }
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.home.history.added.one:${count}:count: nová platba`;
    case 'few':
      return $localize`:@@admin.home.history.added.few:${count}:count: nové platby`;
    case 'other':
      return $localize`:@@admin.home.history.added.many:${count}:count: nových plateb`;
  }
}
