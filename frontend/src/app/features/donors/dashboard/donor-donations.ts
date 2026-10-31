import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  computed,
  DestroyRef,
  inject,
  Injectable,
  Injector,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, last, map, Observable, of, Subscription, tap } from 'rxjs';
import {
  describeProblemWithoutFields,
  problemOf,
  problemTypeEndsWith,
} from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { BankAccountItem, BankAccountsApi } from '../../donations/bank-accounts-api';
import {
  BankCheckResponse,
  DonationItem,
  DonationsApi,
  DonationSummaryResponse,
  DownloadedFile,
} from '../../donations/donations-api';
import { ReceiptSubject } from '../../donations/receipt-pdf/frozen-receipt';
import { PdfDelivery } from '../../donations/receipt-pdf/pdf-delivery';
import {
  ReceiptPdf,
  ReceiptPdfEvent,
  ReceiptPdfFailure,
  ReceiptPdfFailureReason,
  ReceiptPdfPhase,
} from '../../donations/receipt-pdf/receipt-pdf';
import { RECEIPT_RESTART_PARAM, ReceiptRestart } from '../../donations/receipt-pdf/receipt-restart';
import { DownloadProgressState } from '../../../shared/ui/download-progress/download-progress';

export type DonationsState = 'loading' | 'ready' | 'error';

export type ReceiptScope = 'yearly' | 'single';

export type BankCheckOutcome =
  | { readonly kind: 'found'; readonly count: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'unfinished' }
  | { readonly kind: 'failed' };

interface ReceiptTask {
  readonly key: string;
  readonly progress: DownloadProgressState;
  readonly file: DownloadedFile | null;
}

export interface ReceiptError {
  readonly scope: ReceiptScope;
  readonly message: string;
}

const RECEIPT_FAILED = $localize`:@@donor.dashboard.receipt.error:Potvrzení se nepodařilo stáhnout. Zkuste to prosím znovu.`;
const RECEIPT_DRAWING_FAILED = $localize`:@@donor.dashboard.receipt.drawingFailed:PDF se v prohlížeči nepodařilo vytvořit. Zkuste to prosím znovu; když to nepomůže, zkuste jiný prohlížeč nebo nám napište na info@nfnn.cz.`;
const RECEIPT_IMAGE_FAILED = $localize`:@@donor.dashboard.receipt.imageFailed:Podpis na potvrzení se nepodařilo ověřit, a tak jsme PDF nevytvořili. Zkuste to prosím znovu; když to nepomůže, napište nám na info@nfnn.cz.`;
const RECEIPT_TOOLS_MISSING = $localize`:@@donor.dashboard.receipt.toolsMissing:Web se mezitím aktualizoval. Obnovte prosím stránku a stáhněte potvrzení znovu.`;
const RECEIPT_UNPRINTABLE = $localize`:@@donor.dashboard.receipt.unprintable:Údaje potvrzení obsahují znak, který v PDF neumíme vytisknout, a tak jsme PDF nevytvořili. Napište nám prosím na info@nfnn.cz.`;
const RECEIPT_STYLE_FAILED = $localize`:@@donor.dashboard.receipt.styleFailed:PDF teď kvůli chybě na webu nejde vytvořit. Napište nám prosím na info@nfnn.cz, opravíme ji.`;
const RECEIPT_CANCELLED = $localize`:@@donor.dashboard.receipt.cancelled:Přípravu potvrzení jste zrušili.`;
const DRAWING_FAILURE_TEXTS: Readonly<Record<ReceiptPdfFailureReason, string>> = {
  'tools-missing': RECEIPT_TOOLS_MISSING,
  fonts: RECEIPT_DRAWING_FAILED,
  image: RECEIPT_IMAGE_FAILED,
  drawing: RECEIPT_DRAWING_FAILED,
  unprintable: RECEIPT_UNPRINTABLE,
  style: RECEIPT_STYLE_FAILED,
};
const STEPS_BEFORE_DRAWING = 2;
const STEPS_AFTER_DRAWING = 1;
const PHASE_STEPS: Readonly<Record<ReceiptPdfPhase, number>> = { data: 1, tools: 2, drawing: 2 };
const YEARLY_DOWNLOAD = /^rok-(\d{4})$/;
const SINGLE_DOWNLOAD = /^dar-([0-9a-zA-Z-]{1,64})$/;

const UNAUTHENTICATED = 'auth/unauthenticated';
const RECEIPT_BEFORE_FIRST_YEAR = 'donations/receipt-before-first-year';
const RECEIPT_UNPRINTABLE_PROBLEM = 'donations/receipt-unprintable';
const YEARLY_PROBLEMS_SHOWN_AS_TITLE = [
  'donations/year-not-yet-completed',
  'donations/yearly-receipt-not-available',
  RECEIPT_BEFORE_FIRST_YEAR,
];
const NOT_FOUND = 404;
const BANK_CHECK_COOLDOWN_MS = 30_000;

@Injectable()
export class DonorDonations {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly donations = inject(DonationsApi);
  private readonly bankAccountsApi = inject(BankAccountsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly receiptPdf = inject(ReceiptPdf);
  private readonly delivery = inject(PdfDelivery);
  private readonly restart = inject(ReceiptRestart);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly pendingDownload =
    inject(ActivatedRoute).snapshot.queryParamMap.get(RECEIPT_RESTART_PARAM);

  readonly state = signal<DonationsState>('loading');
  readonly summary = signal<DonationSummaryResponse | null>(null);
  readonly items = signal<readonly DonationItem[]>([]);

  readonly years = computed(() => (this.summary()?.byYear ?? []).map((entry) => entry.year));
  readonly receiptsFrom = computed(() => this.summary()?.receiptsAvailableFrom ?? null);

  readonly bankDataAsOf = signal<string | null>(null);
  readonly checkingBank = signal(false);
  readonly bankCheckOutcome = signal<BankCheckOutcome | null>(null);
  readonly bankDataArrived = signal(0);

  readonly bankAccounts = signal<readonly BankAccountItem[]>([]);
  readonly accountsWithQuestion = computed(() =>
    this.bankAccounts().filter((account) => account.symbolOffer !== null),
  );

  readonly receiptError = signal<ReceiptError | null>(null);
  private readonly downloads = signal<ReadonlySet<string>>(new Set());
  private readonly receiptTasks = signal<ReadonlyMap<string, ReceiptTask>>(new Map());
  private readonly running = new Map<string, Subscription>();
  private pendingStarted = false;
  private latestDonationsRequest = 0;
  private bankCheckEndedAt: number | null = null;

  constructor() {
    this.load();
    this.checkBank(false);
    this.bankAccountsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items }) => this.bankAccounts.set(items),
        error: () => this.bankAccounts.set([]),
      });
  }

  showBankAccounts(items: readonly BankAccountItem[]): void {
    this.bankAccounts.set(items);
  }

  load(): void {
    this.state.set('loading');
    this.fetchDonations();
  }

  refreshFromBank(): void {
    this.checkBank(true);
  }

  checkBankIfStale(): void {
    const endedAt = this.bankCheckEndedAt;
    if (endedAt !== null && Date.now() - endedAt > BANK_CHECK_COOLDOWN_MS) {
      this.checkBank(false);
    }
  }

  clearBankCheckOutcome(): void {
    this.bankCheckOutcome.set(null);
  }

  bankCheckedWhileAdding(check: BankCheckResponse): void {
    const asOfBefore = this.bankDataAsOf();
    this.bankDataAsOf.set(check.bankDataAsOf);
    if (check.bankDataAsOf !== asOfBefore) {
      this.fetchDonations();
    }
  }

  fetchDonations(): void {
    this.reloadDonations().subscribe();
  }

  private reloadDonations(): Observable<readonly DonationItem[] | null> {
    const request = ++this.latestDonationsRequest;
    return forkJoin({ summary: this.donations.summary(), list: this.donations.list() }).pipe(
      map(({ summary, list }) => {
        if (request === this.latestDonationsRequest) {
          this.summary.set(summary);
          this.items.set(list.items);
          this.state.set('ready');
          this.startPendingDownload();
        }
        return list.items;
      }),
      catchError((failure: unknown) => {
        if (this.sessionEnded(failure)) {
          this.sendToSignIn();
        } else if (request === this.latestDonationsRequest) {
          this.state.set('error');
        }
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef),
    );
  }

  sendToSignIn(): void {
    this.loginDialog.open('login', { returnTo: this.router.url });
    void this.router.navigateByUrl('/');
  }

  clearReceiptError(scope: ReceiptScope): void {
    if (this.receiptError()?.scope === scope) {
      this.receiptError.set(null);
    }
  }

  yearlyDownloading(year: number): boolean {
    return this.downloads().has(yearlyKey(year));
  }

  singleDownloading(item: DonationItem): boolean {
    return this.downloads().has(singleKey(item.id));
  }

  yearlyReady(year: number): boolean {
    return this.readyFile(yearlyKey(year)) !== null;
  }

  singleReady(item: DonationItem): boolean {
    return this.readyFile(singleKey(item.id)) !== null;
  }

  yearlyTarget(year: number): string {
    return downloadName(yearlyKey(year));
  }

  singleTarget(item: DonationItem): string {
    return downloadName(singleKey(item.id));
  }

  yearlyProgress(year: number): DownloadProgressState | null {
    return this.progressOf(yearlyKey(year));
  }

  singleProgress(item: DonationItem): DownloadProgressState | null {
    return this.progressOf(singleKey(item.id));
  }

  cancelYearlyReceipt(year: number): void {
    this.cancel(yearlyKey(year));
  }

  cancelSingleReceipt(item: DonationItem): void {
    this.cancel(singleKey(item.id));
  }

  private progressOf(key: string): DownloadProgressState | null {
    return this.receiptTasks().get(key)?.progress ?? null;
  }

  private readyFile(key: string): DownloadedFile | null {
    return this.receiptTasks().get(key)?.file ?? null;
  }

  private setTask(key: string, task: Omit<ReceiptTask, 'key'> | null): void {
    this.receiptTasks.update((tasks) => {
      const next = new Map(tasks);
      if (task === null) {
        next.delete(key);
      } else {
        next.set(key, { key, ...task });
      }
      return next;
    });
  }

  private dropFinishedTasks(): void {
    this.receiptTasks.update(
      (tasks) => new Map([...tasks].filter(([, task]) => task.progress.kind !== 'done')),
    );
  }

  private focusDownloadButton(key: string): void {
    afterNextRender(
      () => {
        const target = this.document.querySelector<HTMLButtonElement>(
          `[data-receipt-download="${downloadName(key)}"]`,
        );
        target?.focus();
      },
      { injector: this.injector },
    );
  }

  downloadYearlyReceipt(year: number): void {
    this.download(yearlyKey(year), 'yearly', { year });
  }

  downloadSingleReceipt(item: DonationItem): void {
    if (!item.receiptAvailable) {
      return;
    }
    this.download(singleKey(item.id), 'single', { donationId: item.id });
  }

  private startPendingDownload(): void {
    const pending = this.pendingDownload;
    if (pending === null || this.pendingStarted) {
      return;
    }
    this.pendingStarted = true;
    void this.router.navigate([], {
      queryParams: { [RECEIPT_RESTART_PARAM]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (!this.restart.resumes(pending)) {
      this.restart.finished();
      return;
    }
    const year = YEARLY_DOWNLOAD.exec(pending);
    if (year !== null && Number(year[1]) <= (this.summary()?.yearlyReceiptsAvailableThrough ?? 0)) {
      this.downloadYearlyReceipt(Number(year[1]));
      return;
    }
    const single = SINGLE_DOWNLOAD.exec(pending);
    const item = this.items().find((each) => each.id === single?.[1]);
    if (item !== undefined) {
      this.downloadSingleReceipt(item);
      return;
    }
    this.restart.finished();
  }

  private checkBank(byDonor: boolean): void {
    if (this.checkingBank()) {
      return;
    }
    this.checkingBank.set(true);
    this.bankCheckOutcome.set(null);
    const known = new Set(this.items().map((item) => item.id));
    let asOfBefore: string | null | undefined;
    this.donations
      .checkBankUntilDone()
      .pipe(
        tap((check) => {
          asOfBefore ??= check.bankDataAsOf;
          this.bankDataAsOf.set(check.bankDataAsOf);
        }),
        last(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (check: BankCheckResponse) => {
          if (byDonor || check.bankDataAsOf !== asOfBefore) {
            this.bankDataArrived.update((count) => count + 1);
          }
          this.reloadDonations().subscribe((items) => {
            this.bankCheckEnded();
            if (byDonor && items !== null) {
              this.bankCheckOutcome.set(outcomeOf(check, items, known));
            }
          });
        },
        error: (failure: unknown) => {
          this.bankCheckEnded();
          if (!byDonor) {
            return;
          }
          if (this.sessionEnded(failure)) {
            this.sendToSignIn();
            return;
          }
          this.bankCheckOutcome.set({ kind: 'failed' });
        },
      });
  }

  private bankCheckEnded(): void {
    this.checkingBank.set(false);
    this.bankCheckEndedAt = Date.now();
  }

  private sessionEnded(failure: unknown): boolean {
    return problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous';
  }

  private download(key: string, scope: ReceiptScope, subject: ReceiptSubject): void {
    if (this.downloads().has(key)) {
      return;
    }
    if (this.readyFile(key) !== null) {
      this.open(key);
      return;
    }
    this.receiptError.set(null);
    this.dropFinishedTasks();
    this.downloads.update((running) => new Set(running).add(key));
    const subscription = this.receiptPdf
      .draw(subject)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => this.receiptProgressed(key, event),
        error: (failure: unknown) => {
          this.finishDownload(key);
          this.setTask(key, null);
          this.receiptFailed(scope, failure, key);
        },
      });
    this.running.set(key, subscription);
  }

  private receiptProgressed(key: string, event: ReceiptPdfEvent): void {
    if (event.kind === 'phase') {
      const pages = Math.max(event.pages, 1);
      this.setTask(key, {
        file: null,
        progress: {
          kind: 'running',
          step: PHASE_STEPS[event.phase] + Math.min(event.page, pages),
          steps: STEPS_BEFORE_DRAWING + pages + STEPS_AFTER_DRAWING,
          text: phaseText(event.phase, event.page),
        },
      });
      return;
    }
    this.finishDownload(key);
    this.restart.finished();
    const file = event.file;
    if (this.delivery.needsSecondTap(file)) {
      this.setTask(key, { file, progress: finished('ready', readyText(file.fileName)) });
      this.focusDownloadButton(key);
      return;
    }
    this.delivery.save(file);
    this.setTask(key, { file: null, progress: finished('done', savedText(file.fileName)) });
  }

  private open(key: string): void {
    const task = this.receiptTasks().get(key);
    const file = task?.file ?? null;
    if (task === undefined || file === null) {
      return;
    }
    void this.delivery.share(file).then((outcome) => {
      if (this.receiptTasks().get(key) !== task) {
        return;
      }
      if (outcome === 'shared') {
        this.setTask(key, { file: null, progress: finished('done', sharedText(file.fileName)) });
      } else if (outcome === 'saved') {
        this.setTask(key, { file: null, progress: finished('done', savedText(file.fileName)) });
      } else if (outcome === 'failed') {
        this.delivery.save(file);
        this.setTask(key, { file: null, progress: finished('done', savedText(file.fileName)) });
      }
    });
  }

  private cancel(key: string): void {
    const subscription = this.running.get(key);
    if (subscription === undefined) {
      return;
    }
    subscription.unsubscribe();
    this.finishDownload(key);
    this.setTask(key, { file: null, progress: finished('done', RECEIPT_CANCELLED) });
    this.focusDownloadButton(key);
  }

  private finishDownload(key: string): void {
    this.running.delete(key);
    this.downloads.update((running) => {
      const remaining = new Set(running);
      remaining.delete(key);
      return remaining;
    });
  }

  private drawingFailed(scope: ReceiptScope, failure: ReceiptPdfFailure, key: string): void {
    if (failure.reason === 'tools-missing') {
      if (!this.restart.tryRestart(downloadName(key))) {
        this.receiptError.set({ scope, message: RECEIPT_TOOLS_MISSING });
      }
      return;
    }
    this.receiptError.set({ scope, message: DRAWING_FAILURE_TEXTS[failure.reason] });
  }

  private receiptFailed(scope: ReceiptScope, failure: unknown, key: string): void {
    if (failure instanceof ReceiptPdfFailure) {
      this.drawingFailed(scope, failure, key);
      return;
    }
    if (this.sessionEnded(failure)) {
      this.sendToSignIn();
      return;
    }
    const problem = problemOf(failure);
    if (problemTypeEndsWith(failure, RECEIPT_UNPRINTABLE_PROBLEM)) {
      this.receiptError.set({
        scope,
        message: describeProblemWithoutFields(failure, RECEIPT_UNPRINTABLE),
      });
      return;
    }
    if (
      scope === 'yearly' &&
      YEARLY_PROBLEMS_SHOWN_AS_TITLE.some((type) => problemTypeEndsWith(failure, type))
    ) {
      this.receiptError.set({ scope, message: problem?.title || RECEIPT_FAILED });
      return;
    }
    const rowOutdated =
      problem?.status === NOT_FOUND || problemTypeEndsWith(failure, RECEIPT_BEFORE_FIRST_YEAR);
    if (scope === 'single' && rowOutdated) {
      this.receiptError.set({ scope, message: problem?.title || RECEIPT_FAILED });
      this.fetchDonations();
      return;
    }
    this.receiptError.set({ scope, message: RECEIPT_FAILED });
  }
}

function phaseText(phase: ReceiptPdfPhase, page: number): string {
  switch (phase) {
    case 'data':
      return $localize`:@@donor.dashboard.receipt.phase.data:Připravujeme údaje potvrzení…`;
    case 'tools':
      return $localize`:@@donor.dashboard.receipt.phase.tools:Načítáme nástroje pro PDF…`;
    case 'drawing':
      return $localize`:@@donor.dashboard.receipt.phase.drawing:Vytváříme PDF, strana ${page}:page:…`;
  }
}

function finished(kind: 'ready' | 'done', text: string): DownloadProgressState {
  return { kind, step: 1, steps: 1, text };
}

function savedText(fileName: string): string {
  return $localize`:@@donor.dashboard.receipt.saved:Potvrzení ${fileName}:fileName: je stažené. Najdete ho ve stažených souborech.`;
}

function readyText(fileName: string): string {
  return $localize`:@@donor.dashboard.receipt.ready:Potvrzení ${fileName}:fileName: je připravené. Otevřete ho tlačítkem Otevřít potvrzení.`;
}

function sharedText(fileName: string): string {
  return $localize`:@@donor.dashboard.receipt.shared:Potvrzení ${fileName}:fileName: jste předali z nabídky sdílení.`;
}

function downloadName(key: string): string {
  return key.replace(/^yearly:/, 'rok-').replace(/^single:/, 'dar-');
}

function outcomeOf(
  check: BankCheckResponse,
  items: readonly DonationItem[],
  known: ReadonlySet<string>,
): BankCheckOutcome {
  if (check.checking) {
    return { kind: 'unfinished' };
  }
  const count = items.filter((item) => item.status === 'RECEIVED' && !known.has(item.id)).length;
  return count > 0 ? { kind: 'found', count } : { kind: 'none' };
}

function yearlyKey(year: number): string {
  return `yearly:${year}`;
}

function singleKey(donationId: string): string {
  return `single:${donationId}`;
}
