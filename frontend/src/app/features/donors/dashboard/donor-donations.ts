import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  EMPTY,
  filter,
  last,
  map,
  Observable,
  of,
  Subscription,
  switchMap,
  tap,
} from 'rxjs';
import {
  describeProblemWithoutFields,
  problemOf,
  problemTypeEndsWith,
} from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { LiveUpdates } from '../../../core/live/live-updates';
import { UPDATE_REQUIRED } from '../../../core/version/version-interceptor';
import { BankAccountItem, BankAccountsApi } from '../../donations/bank-accounts-api';
import { copyBackedReceiptSource } from '../../donations/device-copy/copy-receipt-source';
import {
  type DonorDonationsRead,
  DonorDonationsRepository,
} from '../../donations/device-copy/donor-donations-repository';
import {
  BankCheckResponse,
  DonationItem,
  DonationsApi,
  DonationSummaryResponse,
  DownloadedFile,
} from '../../donations/donations-api';
import { GiftFeed } from '../../donations/gift-arrival/gift-feed';
import { ReceiptSubject } from '../../donations/receipt-pdf/frozen-receipt';
import { giftsOnActiveYearlyReceipts } from './yearly-receipt';
import { PdfDelivery } from '../../donations/receipt-pdf/pdf-delivery';
import {
  ReceiptPdf,
  ReceiptPdfEvent,
  ReceiptPdfFailure,
  ReceiptPdfFailureReason,
} from '../../donations/receipt-pdf/receipt-pdf';
import {
  finishedReceiptProgress as finished,
  readySingleReceiptText,
  receiptPhaseProgress,
  savedReceiptText as savedText,
  sharedReceiptText as sharedText,
} from '../../donations/receipt-pdf/receipt-progress';
import { RECEIPT_RESTART_PARAM, ReceiptRestart } from '../../donations/receipt-pdf/receipt-restart';
import { ReceiptsApi } from '../../donations/receipt-pdf/receipts-api';
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
  readonly key: string;
  readonly message: string;
  readonly offersDiagnostics?: true;
}

const RECEIPT_FAILED = $localize`:@@donor.dashboard.receipt.error:Potvrzení se nepodařilo stáhnout. Zkuste to prosím znovu.`;
const RECEIPT_DRAWING_FAILED = $localize`:@@donor.dashboard.receipt.drawingFailed:PDF se v prohlížeči nepodařilo vytvořit. Zkuste to prosím znovu; když to nepomůže, zkuste jiný prohlížeč nebo nám napište na info@nfnn.cz.`;
const RECEIPT_IMAGE_FAILED = $localize`:@@donor.dashboard.receipt.imageFailed:Podpis na potvrzení se nepodařilo ověřit, a tak jsme PDF nevytvořili. Zkuste to prosím znovu; když to nepomůže, napište nám na info@nfnn.cz.`;
const RECEIPT_TOOLS_MISSING = $localize`:@@donor.dashboard.receipt.toolsMissing:Web se mezitím aktualizoval. Obnovte prosím stránku a stáhněte potvrzení znovu.`;
const RECEIPT_TOOLS_STILL_MISSING = $localize`:@@donor.dashboard.receipt.toolsStillMissing:Nástroje pro PDF se nepodařilo načíst ani po obnovení stránky. Zkontrolujte prosím připojení nebo blokování skriptů, zkuste jiný prohlížeč, nebo nám napište na info@nfnn.cz.`;
const RECEIPT_UNPRINTABLE = $localize`:@@donor.dashboard.receipt.unprintable:Údaje potvrzení obsahují znak, který v PDF neumíme vytisknout, a tak jsme PDF nevytvořili. Napište nám prosím na info@nfnn.cz.`;
const RECEIPT_STYLE_FAILED = $localize`:@@donor.dashboard.receipt.styleFailed:PDF teď kvůli chybě na webu nejde vytvořit. Napište nám prosím na info@nfnn.cz, opravíme ji.`;
const RECEIPT_CANCELLED = $localize`:@@donor.dashboard.receipt.cancelled:Přípravu potvrzení jste zrušili.`;
const RECEIPT_ON_YEARLY = $localize`:@@donor.dashboard.receipt.onYearly:Tento dar uvádí roční potvrzení za jeho rok, a tak k němu samostatné potvrzení nevystavujeme. Stáhněte si roční potvrzení.`;
const DRAWING_FAILURE_TEXTS: Readonly<Record<ReceiptPdfFailureReason, string>> = {
  'tools-missing': RECEIPT_TOOLS_MISSING,
  fonts: RECEIPT_DRAWING_FAILED,
  image: RECEIPT_IMAGE_FAILED,
  drawing: RECEIPT_DRAWING_FAILED,
  unprintable: RECEIPT_UNPRINTABLE,
  style: RECEIPT_STYLE_FAILED,
};
const YEARLY_DOWNLOAD = /^rok-(\d{4})$/;
const SINGLE_DOWNLOAD = /^dar-([0-9a-zA-Z-]{1,64})$/;

const UNAUTHENTICATED = 'auth/unauthenticated';
const RECEIPT_BEFORE_FIRST_YEAR = 'donations/receipt-before-first-year';
const RECEIPT_UNPRINTABLE_PROBLEM = 'donations/receipt-unprintable';
const RECEIPT_SIGNING_PAUSED_PROBLEM = 'donations/receipt-signing-paused';
const RECEIPT_SIGNING_KEY_UNPUBLISHED_PROBLEM = 'donations/receipt-signing-key-unpublished';
const DONATION_ON_YEARLY_RECEIPT = 'donations/donation-on-yearly-receipt';
const PROBLEMS_SHOWN_WITH_DETAIL: Readonly<Record<string, string>> = {
  [RECEIPT_UNPRINTABLE_PROBLEM]: RECEIPT_UNPRINTABLE,
  [RECEIPT_SIGNING_PAUSED_PROBLEM]: RECEIPT_FAILED,
  [RECEIPT_SIGNING_KEY_UNPUBLISHED_PROBLEM]: RECEIPT_FAILED,
  'donations/receipt-signatory-missing': RECEIPT_FAILED,
  'donations/receipt-issue-limit': RECEIPT_FAILED,
  'donations/receipt-too-long': RECEIPT_FAILED,
  [UPDATE_REQUIRED]: RECEIPT_FAILED,
};
const YEARLY_PROBLEMS_SHOWN_AS_TITLE = [
  'donations/year-not-yet-completed',
  'donations/yearly-receipt-not-available',
  RECEIPT_BEFORE_FIRST_YEAR,
];
const NOT_FOUND = 404;
const BANK_CHECK_COOLDOWN_MS = 30_000;

interface IncomingDonations {
  readonly read: DonorDonationsRead;
  readonly added: number;
}

@Injectable()
export class DonorDonations implements GiftFeed {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly donations = inject(DonationsApi);
  private readonly bankAccountsApi = inject(BankAccountsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly receiptPdf = inject(ReceiptPdf);
  private readonly receiptsApi = inject(ReceiptsApi);
  private readonly delivery = inject(PdfDelivery);
  private readonly restart = inject(ReceiptRestart);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly live = inject(LiveUpdates);
  private readonly repository = inject(DonorDonationsRepository);
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

  private readonly incoming = signal<IncomingDonations | null>(null);
  readonly incomingCount = computed(() =>
    this.checkingBank() ? 0 : (this.incoming()?.added ?? 0),
  );

  readonly gifts = computed(() =>
    this.state() === 'ready' ? (this.incoming()?.read.items ?? this.items()) : null,
  );
  readonly asking = this.checkingBank.asReadonly();
  readonly listedHere = true;

  readonly bankAccounts = signal<readonly BankAccountItem[]>([]);
  readonly accountsWithQuestion = computed(() =>
    this.bankAccounts().filter((account) => account.symbolOffer !== null),
  );

  readonly receiptError = signal<ReceiptError | null>(null);
  readonly offersDiagnostics = computed(() => this.receiptError()?.offersDiagnostics === true);
  private readonly refusedAsOnYearlyReceipt = signal<ReadonlySet<string>>(new Set());
  private readonly onYearlyReceipts = computed(() => {
    const onReceipt = new Set(
      giftsOnActiveYearlyReceipts(this.items(), this.repository.view()?.receipts ?? []),
    );
    for (const id of this.refusedAsOnYearlyReceipt()) {
      onReceipt.add(id);
    }
    return onReceipt;
  });
  private readonly downloads = signal<ReadonlySet<string>>(new Set());
  private readonly receiptTasks = signal<ReadonlyMap<string, ReceiptTask>>(new Map());
  private readonly running = new Map<string, Subscription>();
  private readonly focusedAtStart = new Map<string, Element | null>();
  private pendingStarted = false;
  private latestDonationsRequest = 0;
  private shown: DonorDonationsRead | null = null;
  private shownOwner: string | null = null;
  private bankCheckEndedAt: number | null = null;
  private readonly printedDonor = computed(() => {
    const donor = this.auth.donor();
    return donor === null
      ? null
      : JSON.stringify([
          donor.name,
          donor.address.street,
          donor.address.postalCode,
          donor.address.city,
        ]);
  });

  constructor() {
    let printedBefore: string | null | undefined;
    effect(() => {
      const printed = this.printedDonor();
      if (printedBefore !== undefined && printed !== printedBefore) {
        this.dropReadyFiles();
      }
      printedBefore = printed;
    });
    effect(() => {
      const held = this.repository.held();
      if (held === null) {
        return;
      }
      untracked(() => {
        const switched = this.shownOwner !== null && held.owner !== this.shownOwner;
        if (!switched && this.shown?.source === 'server' && held.at < this.shown.at) {
          return;
        }
        if (this.state() === 'ready' && !switched) {
          this.offerDonations(held);
        } else {
          this.latestDonationsRequest++;
          this.showRead(held);
        }
      });
    });
    this.load();
    this.checkBank(false);
    this.bankAccountsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items }) => this.bankAccounts.set(items),
        error: () => this.bankAccounts.set([]),
      });
    this.followLiveChanges();
  }

  requestGifts(): Observable<readonly DonationItem[]> {
    return this.repository.fresh('sync').pipe(map((read) => read.items));
  }

  follow(): Observable<unknown> {
    return EMPTY;
  }

  askBank(): void {
    this.checkBank(false);
  }

  showIncoming(): void {
    const incoming = this.incoming();
    if (incoming !== null) {
      this.showDonations(incoming.read);
    }
  }

  private followLiveChanges(): void {
    this.live
      .changes(['donations'])
      .pipe(
        switchMap(() => this.donationsInBackground()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
    this.live
      .changes(['bank-accounts'])
      .pipe(
        switchMap(() => this.bankAccountsApi.list().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ items }) => this.bankAccounts.set(items));
    this.live
      .changes(['bank-import'])
      .pipe(
        filter(() => !this.checkingBank()),
        switchMap(() => this.donations.bankCheck().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((check) => {
        if (!this.checkingBank()) {
          this.bankDataAsOf.set(check.bankDataAsOf);
        }
      });
  }

  private donationsInBackground(): Observable<unknown> {
    if (this.state() !== 'ready') {
      return this.reloadDonations();
    }
    const startedAfter = this.latestDonationsRequest;
    return this.repository.fresh('sync').pipe(
      tap((read) => {
        if (startedAfter === this.latestDonationsRequest) {
          this.offerDonations(read);
        }
      }),
      catchError(() => EMPTY),
    );
  }

  private offerDonations(read: DonorDonationsRead): void {
    const shown = new Set(this.items().map((item) => item.id));
    const added = read.items.filter((item) => !shown.has(item.id)).length;
    if (added === 0) {
      this.showDonations(read);
    } else {
      this.incoming.set({ read, added });
    }
  }

  private showDonations(read: DonorDonationsRead): void {
    this.incoming.set(null);
    this.shown = read;
    if (read.owner !== null) {
      this.shownOwner = read.owner;
    }
    this.summary.set(read.summary);
    this.items.set(read.items);
    if (read.bankDataAsOf !== null && this.bankDataAsOf() === null) {
      this.bankDataAsOf.set(read.bankDataAsOf);
    }
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

  private reloadDonations(offered = false): Observable<readonly DonationItem[] | null> {
    const request = ++this.latestDonationsRequest;
    const held = this.repository.held();
    const atOnce = held !== null && this.state() !== 'ready';
    if (atOnce) {
      this.showRead(held);
    }
    return this.repository.fresh(atOnce ? 'catch-up' : 'sync').pipe(
      map((read) => {
        if (request === this.latestDonationsRequest) {
          if (atOnce || offered) {
            this.offerDonations(read);
          } else {
            this.showRead(read);
          }
        }
        return read.items;
      }),
      catchError((failure: unknown) => {
        if (this.sessionEnded(failure)) {
          this.sendToSignIn();
        } else if (request === this.latestDonationsRequest && this.shown?.source !== 'copy') {
          this.state.set('error');
        }
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef),
    );
  }

  private showRead(read: DonorDonationsRead): void {
    this.showDonations(read);
    this.state.set('ready');
    this.startPendingDownload();
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

  yearlyError(year: number): string | null {
    return this.errorAt(yearlyKey(year));
  }

  singleError(item: DonationItem): string | null {
    return this.errorAt(singleKey(item.id));
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

  private errorAt(key: string): string | null {
    const error = this.receiptError();
    return error?.key === key ? error.message : null;
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
      (tasks) =>
        new Map(
          [...tasks].filter(
            ([, task]) => task.progress.kind !== 'done' && task.progress.kind !== 'cancelled',
          ),
        ),
    );
  }

  private dropReadyFiles(): void {
    this.receiptTasks.update(
      (tasks) =>
        new Map(
          [...tasks].filter(([, task]) => task.progress.kind === 'running' && task.file === null),
        ),
    );
  }

  private focusDownloadButtonIfLost(key: string): void {
    afterNextRender(
      () => {
        const focused = this.document.activeElement;
        const unmoved = focused === this.focusedAtStart.get(key);
        this.focusedAtStart.delete(key);
        if (focused !== null && focused !== this.document.body && !unmoved) {
          return;
        }
        this.document
          .querySelector<HTMLButtonElement>(`[data-receipt-download="${downloadName(key)}"]`)
          ?.focus();
      },
      { injector: this.injector },
    );
  }

  downloadYearlyReceipt(year: number): void {
    this.download(yearlyKey(year), 'yearly', { year });
  }

  onYearlyReceipt(item: DonationItem): boolean {
    return item.receiptAvailable && this.onYearlyReceipts().has(item.id);
  }

  downloadSingleReceipt(item: DonationItem): void {
    if (!item.receiptAvailable || this.onYearlyReceipt(item)) {
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
    if (byDonor) {
      this.bankCheckOutcome.set(null);
    }
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
          this.reloadDonations(!byDonor && this.shown?.source === 'copy').subscribe((items) => {
            this.bankCheckEnded();
            if (!byDonor) {
              if (items !== null) {
                this.dropOutdatedOutcome(outcomeOf(check, items, known));
              }
              return;
            }
            if (items !== null) {
              this.bankCheckOutcome.set(outcomeOf(check, items, known));
            } else if (this.state() === 'ready' && this.auth.status() !== 'anonymous') {
              this.bankCheckOutcome.set({ kind: 'failed' });
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

  private dropOutdatedOutcome(latest: BankCheckOutcome): void {
    const standing = this.bankCheckOutcome();
    if (standing !== null && (latest.kind === 'found' || standing.kind !== 'none')) {
      this.bankCheckOutcome.set(null);
    }
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
    this.focusedAtStart.set(key, this.document.activeElement);
    const subscription = this.receiptPdf
      .draw(
        copyBackedReceiptSource(
          this.receiptsApi.donorSource(subject),
          () => this.repository.view(),
          subject,
        ),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => this.receiptProgressed(key, scope, event),
        error: (failure: unknown) => {
          this.finishDownload(key);
          this.setTask(key, null);
          this.receiptFailed(scope, failure, key);
          this.focusDownloadButtonIfLost(key);
        },
      });
    this.running.set(key, subscription);
  }

  private receiptProgressed(key: string, scope: ReceiptScope, event: ReceiptPdfEvent): void {
    if (event.kind === 'phase') {
      this.setTask(key, { file: null, progress: receiptPhaseProgress(event) });
      return;
    }
    this.finishDownload(key);
    this.restart.finished();
    const file = event.file;
    if (this.delivery.needsSecondTap(file)) {
      this.setTask(key, { file, progress: finished('ready', readyText(scope, file.fileName)) });
      this.focusDownloadButtonIfLost(key);
      return;
    }
    this.delivery.save(file);
    this.setTask(key, { file: null, progress: finished('done', savedText(file.fileName)) });
    this.focusDownloadButtonIfLost(key);
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
    this.restart.abandoned(downloadName(key));
    this.setTask(key, { file: null, progress: finished('cancelled', RECEIPT_CANCELLED) });
    this.focusDownloadButtonIfLost(key);
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
      const restart = this.restart.tryRestart(downloadName(key));
      if (restart !== 'reloading') {
        this.receiptError.set({
          scope,
          key,
          message:
            restart === 'reloaded-already' ? RECEIPT_TOOLS_STILL_MISSING : RECEIPT_TOOLS_MISSING,
          ...(restart === 'reloaded-already' ? { offersDiagnostics: true } : {}),
        });
      }
      return;
    }
    this.restart.abandoned(downloadName(key));
    this.receiptError.set({
      scope,
      key,
      message: DRAWING_FAILURE_TEXTS[failure.reason],
      ...(failure.reason === 'unprintable' ? {} : { offersDiagnostics: true }),
    });
  }

  private receiptFailed(scope: ReceiptScope, failure: unknown, key: string): void {
    if (failure instanceof ReceiptPdfFailure) {
      this.drawingFailed(scope, failure, key);
      return;
    }
    this.restart.abandoned(downloadName(key));
    if (this.sessionEnded(failure)) {
      this.sendToSignIn();
      return;
    }
    const problem = problemOf(failure);
    const shownWithDetail = Object.keys(PROBLEMS_SHOWN_WITH_DETAIL).find((type) =>
      problemTypeEndsWith(failure, type),
    );
    if (shownWithDetail !== undefined) {
      this.receiptError.set({
        scope,
        key,
        message: describeProblemWithoutFields(failure, PROBLEMS_SHOWN_WITH_DETAIL[shownWithDetail]),
      });
      return;
    }
    if (scope === 'single' && problemTypeEndsWith(failure, DONATION_ON_YEARLY_RECEIPT)) {
      this.receiptError.set({
        scope,
        key,
        message: describeProblemWithoutFields(failure, RECEIPT_ON_YEARLY),
      });
      this.refusedAsOnYearlyReceipt.update((ids) => new Set(ids).add(donationIdOf(key)));
      this.fetchDonations();
      return;
    }
    if (
      scope === 'yearly' &&
      YEARLY_PROBLEMS_SHOWN_AS_TITLE.some((type) => problemTypeEndsWith(failure, type))
    ) {
      this.receiptError.set({ scope, key, message: problem?.title || RECEIPT_FAILED });
      return;
    }
    const rowOutdated =
      problem?.status === NOT_FOUND || problemTypeEndsWith(failure, RECEIPT_BEFORE_FIRST_YEAR);
    if (scope === 'single' && rowOutdated) {
      this.receiptError.set({ scope, key, message: problem?.title || RECEIPT_FAILED });
      this.fetchDonations();
      return;
    }
    this.receiptError.set({ scope, key, message: RECEIPT_FAILED });
  }
}

function readyText(scope: ReceiptScope, fileName: string): string {
  if (scope === 'single') {
    return readySingleReceiptText(fileName);
  }
  return $localize`:@@donor.dashboard.receipt.ready:Potvrzení ${fileName}:fileName: je připravené. Otevřete ho tlačítkem Otevřít potvrzení.`;
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

function donationIdOf(key: string): string {
  return key.replace(/^single:/, '');
}
