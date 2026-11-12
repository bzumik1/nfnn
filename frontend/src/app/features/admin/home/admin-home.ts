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
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { formatMinorUnits } from '../../donations/donation-amount';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import {
  AdminApi,
  AdminBackupsResponse,
  AdminOverviewResponse,
  AdministratorResponse,
  BackupRunResponse,
  ImportStateResponse,
  TallyResponse,
} from '../admin-api';
import { formatSize } from '../backups/backup-format';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { formatReportMonth } from '../report/report-month';
import { IMPORT_FAILURE_LABELS } from '../import-failure-labels';
import { unpublishedKeyIds } from '../settings/receipt-signing-key/unpublished-keys';
import { signingKeyWarnings } from '../settings/receipt-signing-key/key-warnings';
import { HistoryImport } from './history-import/history-import';
import { SinceLastVisit } from './since-last-visit/since-last-visit';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { ADMIN_DAILY, ADMIN_MORE_PATH, ADMIN_PAYMENTS_PATH } from '../shell/admin-sections';
import {
  AdminSectionRows,
  SectionIcon,
  SectionRowGroup,
} from '../shell/section-rows/admin-section-rows';
import {
  AttentionRetry,
  attentionRows,
  LoadState,
  SignatoryState,
  UnpairedSummary,
  unpairedCount,
} from './attention-rows';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';

@Component({
  selector: 'app-admin-home',
  imports: [
    NeedsConnection,
    RouterLink,
    CopyButton,
    HistoryImport,
    AdminSectionRows,
    NgTemplateOutlet,
    SinceLastVisit,
  ],
  templateUrl: './admin-home.html',
  styleUrl: './admin-home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHome {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly donor = this.auth.donor;
  protected readonly compact = inject(CompactLayout).isCompact;
  protected readonly sectionsLabel = $localize`:@@admin.home.sections.nav:Sekce správy`;
  protected readonly sections = computed(() => sectionRows(this.unpaired()?.count ?? 0));
  protected readonly state = signal<LoadState>('loading');
  protected readonly importState = signal<ImportStateResponse | null>(null);
  protected readonly overviewState = signal<LoadState>('loading');
  protected readonly overview = signal<AdminOverviewResponse | null>(null);
  protected readonly unpairedState = signal<LoadState>('loading');
  protected readonly unpaired = signal<UnpairedSummary | null>(null);
  protected readonly administratorsState = signal<LoadState>('loading');
  protected readonly withoutSecondFactor = signal<readonly string[]>([]);
  protected readonly signatoryState = signal<SignatoryState>('loading');
  protected readonly backupsState = signal<LoadState>('loading');
  protected readonly backups = signal<AdminBackupsResponse | null>(null);
  protected readonly signingKeysState = signal<LoadState>('loading');
  protected readonly unpublishedSigningKeys = signal<readonly string[]>([]);
  protected readonly signingKeyWarnings = signal<readonly string[]>([]);

  protected readonly backupsHealthy = computed(() => this.backups()?.problems.length === 0);
  protected readonly lastBackup = computed(() => {
    const run = this.backups()?.lastBackup;
    if (!run) {
      return $localize`:@@admin.home.backups.lastBackup.none:zatím žádná`;
    }
    return run.outcome === 'FAILED'
      ? failedRun(run)
      : `${formatBankTime(run.finishedAt)} (${formatSize(run.sizeBytes ?? 0)})`;
  });
  protected readonly lastTestRestore = computed(() => {
    const run = this.backups()?.lastTestRestore;
    if (!run) {
      return $localize`:@@admin.home.backups.lastTestRestore.none:zatím žádná`;
    }
    return run.outcome === 'FAILED'
      ? failedRun(run)
      : $localize`:@@admin.home.backups.lastTestRestore.ok:${formatBankTime(run.finishedAt)}:time:, ${run.tables ?? 0}:tables: tabulek`;
  });

  protected readonly coveredPeriod = computed(() => {
    const state = this.importState();
    return state?.coveredFrom && state.coveredTo
      ? `${formatDonationDate(state.coveredFrom)} – ${formatDonationDate(state.coveredTo)}`
      : null;
  });
  protected readonly lastSuccess = computed(() => time(this.importState()?.lastSucceededAt));
  protected readonly lastAttempt = computed(() => time(this.importState()?.lastAttemptedAt));
  protected readonly lastFailure = computed(() => {
    const failure = this.importState()?.lastFailure;
    return failure ? IMPORT_FAILURE_LABELS[failure.kind] : null;
  });
  protected readonly lastFailureMessage = computed(
    () => this.importState()?.lastFailure?.message ?? null,
  );
  protected readonly lastFailureAt = computed(() =>
    time(this.importState()?.lastFailure?.attemptedAt),
  );
  protected readonly neverAttempted = computed(
    () => this.state() === 'ready' && this.importState()?.lastAttemptedAt == null,
  );
  protected readonly attentionRows = computed(() =>
    attentionRows({
      importLoad: this.state(),
      importState: this.importState(),
      unpairedLoad: this.unpairedState(),
      unpaired: this.unpaired(),
      backupsLoad: this.backupsState(),
      backups: this.backups(),
      administratorsLoad: this.administratorsState(),
      withoutSecondFactor: this.withoutSecondFactor(),
      signingKeysLoad: this.signingKeysState(),
      unpublishedSigningKeys: this.unpublishedSigningKeys(),
      signingKeyWarnings: this.signingKeyWarnings(),
      signatory: this.signatoryState(),
    }),
  );
  protected readonly attentionLoading = computed(() =>
    [
      this.state(),
      this.unpairedState(),
      this.backupsState(),
      this.administratorsState(),
      this.signingKeysState(),
    ].includes('loading'),
  );
  protected readonly lastBackupTime = computed(() => {
    const run = this.backups()?.lastBackup;
    return run && run.outcome === 'OK' ? formatBankTime(run.finishedAt) : null;
  });
  protected readonly toneLabels: Readonly<Record<string, string>> = {
    danger: $localize`:@@admin.home.attention.tone.danger:Naléhavé:`,
    warning: $localize`:@@admin.home.attention.tone.warning:Upozornění:`,
  };

  constructor() {
    this.load();
    this.loadOverview();
    this.loadBackups();
    this.loadUnpaired();
    this.loadAdministrators();
    this.loadSigningKeys();
    this.loadSignatory();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected loadOverview(year: number | null = null): void {
    this.overviewState.set('loading');
    this.api
      .overview(year)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.overview.set(data);
          this.overviewState.set('ready');
        },
        error: () => this.overviewState.set('error'),
      });
  }

  protected loadBackups(): void {
    this.backupsState.set('loading');
    this.api
      .backups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          this.backups.set(view);
          this.backupsState.set('ready');
        },
        error: () => this.backupsState.set('error'),
      });
  }

  protected loadUnpaired(): void {
    this.unpairedState.set('loading');
    this.api
      .payments('unpaired')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.unpaired.set({
            count: list.total,
            totalMinor: list.items.reduce((sum, item) => sum + item.amountMinor, 0),
          });
          this.unpairedState.set('ready');
        },
        error: () => this.unpairedState.set('error'),
      });
  }

  protected loadAdministrators(): void {
    this.administratorsState.set('loading');
    this.api
      .administrators()
      .pipe(
        switchMap(({ items }) => this.withoutAnyFactor(items)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (names) => {
          this.withoutSecondFactor.set(names);
          this.administratorsState.set('ready');
        },
        error: () => this.administratorsState.set('error'),
      });
  }

  protected loadSigningKeys(): void {
    this.signingKeysState.set('loading');
    this.api
      .receiptSigningKeys()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (keys) => {
          this.unpublishedSigningKeys.set(unpublishedKeyIds(keys));
          this.signingKeyWarnings.set(signingKeyWarnings(keys));
          this.signingKeysState.set('ready');
        },
        error: () => this.signingKeysState.set('error'),
      });
  }

  protected loadSignatory(): void {
    this.signatoryState.set('loading');
    this.api
      .receiptSignatory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) =>
          this.signatoryState.set(
            view.signatory === null ? 'missing' : view.signatory.signature ? 'ok' : 'unsigned',
          ),
        error: () => this.signatoryState.set('error'),
      });
  }

  private withoutAnyFactor(items: AdministratorResponse[]): Observable<string[]> {
    const withoutCode = items.filter((item) => !item.secondFactorEnabled);
    if (withoutCode.length === 0) {
      return of([]);
    }
    return forkJoin(withoutCode.map((item) => this.api.donor(item.donorId))).pipe(
      map((accounts) =>
        accounts.filter((account) => account.passkeys === 0).map((account) => account.name),
      ),
    );
  }

  protected retry(target: AttentionRetry): void {
    switch (target) {
      case 'unpaired':
        this.loadUnpaired();
        return;
      case 'signingKeys':
        this.loadSigningKeys();
        return;
      case 'administrators':
        this.loadAdministrators();
        return;
      case 'signatory':
        this.loadSignatory();
        return;
    }
  }

  protected changeYear(event: Event): void {
    this.loadOverview(Number((event.target as HTMLSelectElement).value));
  }

  protected monthLabel(isoMonth: string): string {
    return formatReportMonth(isoMonth);
  }

  protected amount(tally: TallyResponse): string {
    return `${formatMinorUnits(tally.totalMinor)}\u00a0Kč`;
  }

  protected historyFinished(state: ImportStateResponse): void {
    this.importState.set(state);
    const run = state.historyImport;
    if (run?.status === 'COMPLETED' && (run.added ?? 0) > 0) {
      this.loadUnpaired();
    }
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .importState()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (state) => {
          this.importState.set(state);
          this.state.set('ready');
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

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function failedRun(run: BackupRunResponse): string {
  return $localize`:@@admin.home.backups.failed:selhala ${formatBankTime(run.finishedAt)}:time:`;
}

function time(isoInstant: string | null | undefined): string | null {
  return isoInstant ? formatBankTime(isoInstant) : null;
}

const DAILY_ICONS: Readonly<Record<string, SectionIcon>> = {
  [ADMIN_PAYMENTS_PATH]: 'payments',
  '/sprava/darci': 'donors',
  '/sprava/aktuality': 'news',
  '/sprava/projekty': 'projects',
};

function sectionRows(unpaired: number): readonly SectionRowGroup[] {
  return [
    {
      id: 'admin-home-daily',
      label: ADMIN_DAILY.label ?? '',
      rows: ADMIN_DAILY.items.map((item) => ({
        ...item,
        icon: DAILY_ICONS[item.path],
        ...(item.path === ADMIN_PAYMENTS_PATH
          ? { badge: { count: unpaired, description: unpairedCount(unpaired) } }
          : {}),
      })),
    },
    {
      id: 'admin-home-more',
      label: $localize`:@@admin.home.sections.more.group:Občas a pro technika`,
      rows: [
        {
          path: ADMIN_MORE_PATH,
          label: $localize`:@@admin.home.sections.more.row:Lidé fondu, správci, zálohy, nastavení…`,
          icon: 'foundation',
        },
      ],
    },
  ];
}
