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
import { Router } from '@angular/router';
import { concatMap, from, Subscription } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import {
  DownloadProgress,
  DownloadProgressState,
} from '../../../shared/ui/download-progress/download-progress';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { formatMinorUnits } from '../../donations/donation-amount';
import { DownloadedFile } from '../../donations/donations-api';
import { PdfDelivery } from '../../donations/receipt-pdf/pdf-delivery';
import {
  ReceiptBundleEvent,
  ReceiptPdf,
  ReceiptPdfFailure,
} from '../../donations/receipt-pdf/receipt-pdf';
import { ReceiptsApi } from '../../donations/receipt-pdf/receipts-api';
import {
  AdminApi,
  YearlyIssuedReceipt,
  YearlyReceiptCandidate,
  YearlyReceiptCandidatesResponse,
  YearlyReceiptResult,
} from '../admin-api';
import { ScreenWakeLock } from './screen-wake-lock';
import {
  bundleFileName,
  bundleTitle,
  drawingFailureText,
  ISSUING_FAILED,
  READ_FAILED,
  skipReason,
} from './yearly-receipt-texts';

type LoadState = 'loading' | 'ready' | 'error' | 'no-year';
type RunState = 'idle' | 'issuing' | 'drawing' | 'done' | 'failed';

export const YEARLY_RECEIPT_BATCH = 50;

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const NO_COMPLETED_YEAR = [
  'donations/year-not-yet-completed',
  'donations/receipt-before-first-year',
];
const NAMES = new Intl.Collator('cs');

interface ReplacedLine {
  readonly name: string;
  readonly number: string;
  readonly replaced: string;
}

interface SkippedLine {
  readonly name: string;
  readonly reason: string;
}

@Component({
  selector: 'app-admin-yearly-receipts',
  imports: [
    DownloadProgress,
    FocusFirstInvalid,
    FormControlDirective,
    FormField,
    FormsModule,
    LiveNotice,
  ],
  templateUrl: './admin-yearly-receipts.html',
  styleUrl: './admin-yearly-receipts.scss',
  providers: [ScreenWakeLock],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminYearlyReceipts {
  private readonly api = inject(AdminApi);
  private readonly receiptsApi = inject(ReceiptsApi);
  private readonly receiptPdf = inject(ReceiptPdf);
  private readonly delivery = inject(PdfDelivery);
  private readonly wakeLock = inject(ScreenWakeLock);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly noticeRegion = viewChild('noticeRegion', { read: ElementRef });
  private readonly failureRegion = viewChild<ElementRef<HTMLElement>>('failureRegion');

  protected readonly state = signal<LoadState>('loading');
  protected readonly candidates = signal<YearlyReceiptCandidatesResponse | null>(null);
  protected readonly duplex = signal(false);
  protected readonly run = signal<RunState>('idle');
  protected readonly progress = signal<DownloadProgressState | null>(null);
  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly file = signal<DownloadedFile | null>(null);
  protected readonly downloaded = signal(false);
  private readonly results = signal<ReadonlyMap<string, YearlyReceiptResult>>(new Map());
  private order: readonly string[] = [];
  private year = 0;
  private running: Subscription | null = null;
  private loading: Subscription | null = null;

  protected readonly years = computed(() => {
    const candidates = this.candidates();
    if (candidates === null) {
      return [];
    }
    const years: number[] = [];
    for (
      let year = candidates.yearlyReceiptsAvailableThrough;
      year >= candidates.receiptsAvailableFrom;
      year--
    ) {
      years.push(year);
    }
    return years;
  });

  protected readonly chosenYear = computed(() => this.candidates()?.year ?? null);

  protected readonly donors = computed(() =>
    [...(this.candidates()?.donors ?? [])].sort((a, b) => NAMES.compare(a.name, b.name)),
  );

  protected readonly summary = computed(() => {
    const donors = this.donors();
    const issued = donors.filter((donor) => donor.receipt !== null).length;
    return {
      donors: donors.length,
      issued,
      fresh: donors.length - issued,
      erased: this.candidates()?.erasedDonors ?? 0,
    };
  });

  protected readonly busy = computed(() => this.run() === 'issuing' || this.run() === 'drawing');

  protected readonly outcomes = computed(() => {
    const counts = { ISSUED: 0, UNCHANGED: 0, REPLACED: 0, SKIPPED: 0 };
    for (const result of this.results().values()) {
      counts[result.outcome]++;
    }
    return counts;
  });

  protected readonly finished = computed(
    () => this.run() === 'done' || (this.run() === 'failed' && this.results().size > 0),
  );

  protected readonly replaced = computed<ReplacedLine[]>(() =>
    this.orderedResults()
      .filter((result) => result.outcome === 'REPLACED' && result.receipt !== null)
      .map((result) => ({
        name: this.nameOf(result.donorId),
        number: result.receipt?.number ?? '',
        replaced: result.replacedNumber ?? '',
      })),
  );

  protected readonly skipped = computed<SkippedLine[]>(() =>
    this.orderedResults()
      .filter((result) => result.outcome === 'SKIPPED')
      .map((result) => ({ name: this.nameOf(result.donorId), reason: skipReason(result.problem) })),
  );

  constructor() {
    this.load(null);
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected amount(donor: YearlyReceiptCandidate): string {
    return formatMinorUnits(donor.totalAmountMinor);
  }

  protected chooseYear(year: number): void {
    if (this.busy() || year === this.chosenYear()) {
      return;
    }
    this.load(year);
  }

  protected load(year: number | null): void {
    this.loading?.unsubscribe();
    this.state.set('loading');
    this.resetRun();
    this.loading = this.api
      .yearlyReceiptCandidates(year)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (candidates) => {
          this.candidates.set(candidates);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (this.leftForSession(failure)) {
            return;
          }
          this.state.set(
            NO_COMPLETED_YEAR.some((type) => problemTypeEndsWith(failure, type))
              ? 'no-year'
              : 'error',
          );
        },
      });
  }

  protected reload(): void {
    this.load(this.chosenYear());
  }

  protected start(): void {
    if (this.busy() || this.donors().length === 0) {
      return;
    }
    this.resetRun();
    this.year = this.chosenYear() ?? 0;
    this.order = this.donors().map((donor) => donor.donorId);
    this.proceed();
  }

  protected retry(): void {
    if (this.busy()) {
      return;
    }
    this.proceed();
  }

  protected cancel(): void {
    if (!this.busy()) {
      return;
    }
    this.running?.unsubscribe();
    this.running = null;
    this.wakeLock.release();
    this.run.set('failed');
    this.progress.set(null);
    this.failure.set(
      $localize`:@@admin.yearlyReceipts.cancelled:Přípravu jste zrušili. Potvrzení, která už jsme vystavili, platí; tlačítkem Zkusit znovu budeme pokračovat.`,
    );
  }

  protected save(): void {
    const file = this.file();
    if (file === null) {
      return;
    }
    this.delivery.save(file);
    this.downloaded.set(true);
  }

  protected open(): void {
    const file = this.file();
    if (file === null) {
      return;
    }
    void this.delivery.share(file).then((outcome) => {
      if (outcome === 'failed') {
        this.delivery.save(file);
      }
    });
  }

  private proceed(): void {
    this.failure.set(null);
    this.notice.set(null);
    const results = this.results();
    const pending = this.order.filter((donorId) => !results.has(donorId));
    this.wakeLock.hold();
    if (pending.length > 0) {
      this.issue(pending);
    } else {
      this.draw();
    }
  }

  private issue(pending: readonly string[]): void {
    const batches: string[][] = [];
    for (let start = 0; start < pending.length; start += YEARLY_RECEIPT_BATCH) {
      batches.push(pending.slice(start, start + YEARLY_RECEIPT_BATCH));
    }
    this.run.set('issuing');
    this.issuingProgress();
    this.running = from(batches)
      .pipe(
        concatMap((donorIds) => this.api.issueYearlyReceipts(this.year, donorIds)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (answer) => {
          this.results.update((results) => {
            const updated = new Map(results);
            for (const result of answer.results) {
              updated.set(result.donorId, result);
            }
            return updated;
          });
          this.issuingProgress();
        },
        error: (failure: unknown) => {
          if (this.leftForSession(failure)) {
            return;
          }
          this.fail(describeProblem(failure, ISSUING_FAILED));
        },
        complete: () => {
          this.showIssuedNumbers();
          this.draw();
        },
      });
  }

  private draw(): void {
    const receipts = this.orderedResults()
      .map((result) => result.receipt)
      .filter((receipt): receipt is YearlyIssuedReceipt => receipt !== null);
    if (receipts.length === 0) {
      this.finish(null);
      return;
    }
    this.run.set('drawing');
    this.running = this.receiptPdf
      .drawBundle({
        receipts,
        duplex: this.duplex(),
        title: bundleTitle(this.year),
        fileName: bundleFileName(this.year),
        image: (sha256) => this.receiptsApi.administrationImage(sha256),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => this.drawn(event, receipts.length),
        error: (failure: unknown) => {
          if (this.leftForSession(failure)) {
            return;
          }
          this.fail(
            failure instanceof ReceiptPdfFailure
              ? drawingFailureText(failure.reason)
              : describeProblem(failure, READ_FAILED),
          );
        },
      });
  }

  private drawn(event: ReceiptBundleEvent, receipts: number): void {
    const steps = receipts + 2;
    switch (event.kind) {
      case 'images':
        this.progress.set({
          kind: 'running',
          step: 0,
          steps,
          text: $localize`:@@admin.yearlyReceipts.progress.images:Načítáme podpisy a portréty…`,
        });
        break;
      case 'tools':
        this.progress.set({
          kind: 'running',
          step: 1,
          steps,
          text: $localize`:@@admin.yearlyReceipts.progress.tools:Načítáme nástroje pro PDF…`,
        });
        break;
      case 'drawing':
        this.progress.set({
          kind: 'running',
          step: 1 + event.receipt,
          steps,
          text: $localize`:@@admin.yearlyReceipts.progress.drawing:Kreslíme potvrzení ${event.receipt}:receipt: z ${event.receipts}:receipts:…`,
        });
        break;
      case 'done':
        this.finish(event.file, receipts);
        break;
    }
  }

  private finish(file: DownloadedFile | null, receipts = 0): void {
    this.running = null;
    this.wakeLock.release();
    this.progress.set(null);
    this.file.set(file);
    this.run.set('done');
    this.notice.set({
      kind: 'status',
      text:
        file === null
          ? $localize`:@@admin.yearlyReceipts.done.nothing:Žádné potvrzení k tisku: všichni dárci byli přeskočeni.`
          : $localize`:@@admin.yearlyReceipts.done:PDF k tisku je připravené: obsahuje ${receipts}:receipts: potvrzení.`,
    });
    afterNextRender(
      () => (this.noticeRegion()?.nativeElement as HTMLElement | undefined)?.focus(),
      {
        injector: this.injector,
      },
    );
  }

  private fail(text: string): void {
    this.running = null;
    this.wakeLock.release();
    this.progress.set(null);
    this.run.set('failed');
    this.failure.set(text);
    afterNextRender(() => this.failureRegion()?.nativeElement.focus(), { injector: this.injector });
  }

  private issuingProgress(): void {
    const done = this.order.filter((donorId) => this.results().has(donorId)).length;
    this.progress.set({
      kind: 'running',
      step: done,
      steps: this.order.length,
      text: $localize`:@@admin.yearlyReceipts.progress.issuing:Vystavujeme potvrzení ${done}:done: z ${this.order.length}:total:…`,
    });
  }

  private showIssuedNumbers(): void {
    const results = this.results();
    this.candidates.update((candidates) =>
      candidates === null
        ? null
        : {
            ...candidates,
            donors: candidates.donors.map((donor) => {
              const receipt = results.get(donor.donorId)?.receipt ?? null;
              return receipt === null
                ? donor
                : {
                    ...donor,
                    receipt: { id: receipt.id, number: receipt.number, issuedAt: receipt.issuedAt },
                  };
            }),
          },
    );
  }

  private orderedResults(): YearlyReceiptResult[] {
    const results = this.results();
    return this.order
      .map((donorId) => results.get(donorId))
      .filter((result): result is YearlyReceiptResult => result !== undefined);
  }

  private nameOf(donorId: string): string {
    return this.candidates()?.donors.find((donor) => donor.donorId === donorId)?.name ?? donorId;
  }

  private resetRun(): void {
    this.running?.unsubscribe();
    this.running = null;
    this.wakeLock.release();
    this.run.set('idle');
    this.progress.set(null);
    this.failure.set(null);
    this.notice.set(null);
    this.file.set(null);
    this.downloaded.set(false);
    this.results.set(new Map());
    this.order = [];
  }

  private leftForSession(failure: unknown): boolean {
    if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
      this.wakeLock.release();
      this.sendToSignIn();
      return true;
    }
    if (problemTypeEndsWith(failure, FORBIDDEN)) {
      this.wakeLock.release();
      void this.router.navigateByUrl('/darce/prehled');
      return true;
    }
    return false;
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      void this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}
