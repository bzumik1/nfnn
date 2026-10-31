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
import { problemTypeEndsWith } from '../../../core/auth/api-problem';
import { pluralCategory } from '../../../core/i18n/plural-category';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { formatMinorUnits } from '../../donations/donation-amount';
import { formatBankTime, formatDonationDate, pragueDay } from '../../donations/donation-date';
import {
  AdminActivitySinceResponse,
  AdminApi,
  AdminBackupsResponse,
  AdminOverviewResponse,
  AdministratorResponse,
  BackupRunResponse,
  ImportFailureKind,
  ImportStateResponse,
  TallyResponse,
} from '../admin-api';
import { formatSize } from '../backups/backup-format';
import { BACKUP_PROBLEM_HELP } from '../backups/backup-texts';
import { needsTechnician, technicianMessage } from '../backups/backup-message';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { formatReportMonth } from '../report/report-month';
import {
  unpublishedKeyIds,
  unpublishedKeysSentence,
} from '../settings/receipt-signing-key/unpublished-keys';
import { signingKeyWarnings } from '../settings/receipt-signing-key/key-warnings';

type SignatoryState = 'loading' | 'ok' | 'missing' | 'unsigned' | 'error';
type LoadState = 'loading' | 'ready' | 'error';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';

type NextStepLink = 'settings' | 'logs' | null;

interface UnpairedSummary {
  readonly count: number;
  readonly totalMinor: number;
}

interface SinceSignIn {
  readonly previousSignInAt: string | null;
  readonly activity: AdminActivitySinceResponse | null;
}

interface SinceFigure {
  readonly label: string;
  readonly text: string;
  readonly link: string | null;
  readonly query: Record<string, string> | null;
}

interface NextStep {
  readonly text: string;
  readonly link: NextStepLink;
}

const NEXT_STEPS: Record<ImportFailureKind, NextStep> = {
  RATE_LIMITED: {
    text: $localize`:@@admin.home.import.next.rateLimited:Banka teď odmítá příliš časté dotazy. Web to zkusí znovu sám, nic dělat nemusíte.`,
    link: null,
  },
  HISTORY_LOCKED: {
    text: $localize`:@@admin.home.import.next.historyLocked:Odemkněte historii v internetovém bankovnictví Fio (Nastavení → API, ikona zámku) a do 10 minut restartujte backend (v ZimaOS restart aplikace).`,
    link: null,
  },
  UNAUTHORIZED: {
    text: $localize`:@@admin.home.import.next.unauthorized:V internetovém bankovnictví Fio (Nastavení → API) vytvořte nový token typu „Sledování účtu“ (platí 180 dní) a vložte ho v Nastavení jako Token Fio API.`,
    link: 'settings',
  },
  TRANSPORT: {
    text: $localize`:@@admin.home.import.next.transport:Banka teď neodpovídá. Web to zkouší znovu sám každou hodinu; pokud to trvá déle, zkontrolujte připojení serveru k internetu.`,
    link: null,
  },
  INVALID_RESPONSE: {
    text: $localize`:@@admin.home.import.next.invalidResponse:Podrobnosti jsou v logu backendu; může jít o změnu Fio API.`,
    link: 'logs',
  },
  UNEXPECTED: {
    text: $localize`:@@admin.home.import.next.unexpected:Podrobnosti jsou v logu backendu.`,
    link: 'logs',
  },
};

const FAILURE_LABELS: Record<ImportFailureKind, string> = {
  RATE_LIMITED: $localize`:@@admin.home.import.failure.rateLimited:Fio odmítlo příliš častý dotaz`,
  HISTORY_LOCKED: $localize`:@@admin.home.import.failure.historyLocked:Historie starší než 90 dní je ve Fio zamčená`,
  UNAUTHORIZED: $localize`:@@admin.home.import.failure.unauthorized:Fio odmítlo token (chybí, ještě neplatí nebo vypršel)`,
  TRANSPORT: $localize`:@@admin.home.import.failure.transport:Fio nebylo dostupné`,
  INVALID_RESPONSE: $localize`:@@admin.home.import.failure.invalidResponse:Fio poslalo odpověď, které web nerozumí`,
  UNEXPECTED: $localize`:@@admin.home.import.failure.unexpected:Neočekávaná chyba`,
};

@Component({
  selector: 'app-admin-home',
  imports: [RouterLink, CopyButton],
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
  protected readonly state = signal<LoadState>('loading');
  protected readonly importState = signal<ImportStateResponse | null>(null);
  protected readonly overviewState = signal<LoadState>('loading');
  protected readonly overview = signal<AdminOverviewResponse | null>(null);
  protected readonly unpairedState = signal<LoadState>('loading');
  protected readonly unpaired = signal<UnpairedSummary | null>(null);
  protected readonly administratorsState = signal<LoadState>('loading');
  protected readonly withoutSecondFactor = signal<readonly string[]>([]);
  protected readonly signatoryState = signal<SignatoryState>('loading');
  protected readonly sinceState = signal<LoadState>('loading');
  protected readonly since = signal<SinceSignIn | null>(null);
  protected readonly backupsState = signal<LoadState>('loading');
  protected readonly backups = signal<AdminBackupsResponse | null>(null);
  protected readonly signingKeysState = signal<LoadState>('loading');
  protected readonly unpublishedSigningKeys = signal<readonly string[]>([]);
  protected readonly signingKeyWarnings = signal<readonly string[]>([]);

  protected readonly backupProblems = computed(() =>
    (this.backups()?.problems ?? []).map((problem) => BACKUP_PROBLEM_HELP[problem]),
  );
  protected readonly backupTechnicianMessage = computed(() => {
    const view = this.backups();
    return view !== null && needsTechnician(view) ? technicianMessage(view) : null;
  });
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

  protected readonly sinceLead = computed(() => {
    const since = this.since();
    if (since === null) {
      return '';
    }
    if (since.previousSignInAt === null || since.activity === null) {
      return $localize`:@@admin.home.since.firstTime:Jste tu poprvé. Od příštího přihlášení tu uvidíte nové platby a nové dárce.`;
    }
    const at = formatBankTime(since.previousSignInAt);
    const { payments, newDonors } = since.activity;
    if (payments.count === 0 && newDonors === 0) {
      return $localize`:@@admin.home.since.nothing:Poslední přihlášení ${at}:time:. Od té doby nepřišla žádná platba a nikdo nový se nezaregistroval.`;
    }
    return payments.count === 0
      ? $localize`:@@admin.home.since.lead.noPayments:Poslední přihlášení ${at}:time:. Od té doby nepřišla žádná platba.`
      : leadWithPayments(at, payments);
  });
  protected readonly sinceFigures = computed((): readonly SinceFigure[] => {
    const since = this.since();
    const activity = since?.activity;
    if (!since?.previousSignInAt || !activity) {
      return [];
    }
    const day = pragueDay(since.previousSignInAt);
    const figures: SinceFigure[] = [];
    if (activity.payments.count > 0) {
      figures.push(
        paymentFigure($localize`:@@admin.home.since.paired:Přiřazené dárcům`, activity.paired, {
          stav: 'prirazene',
          od: day,
        }),
        paymentFigure(
          $localize`:@@admin.home.since.unpaired:Čekají na přiřazení`,
          activity.unpaired,
          { od: day },
        ),
      );
    }
    if (activity.payments.count > 0 || activity.newDonors > 0) {
      figures.push({
        label: $localize`:@@admin.home.since.newDonors:Noví dárci`,
        text: activity.newDonors > 0 ? registrationsText(activity.newDonors) : NONE,
        link: activity.newDonors > 0 ? '/sprava/darci' : null,
        query: null,
      });
    }
    return figures;
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
    return failure ? FAILURE_LABELS[failure.kind] : null;
  });
  protected readonly lastFailureMessage = computed(
    () => this.importState()?.lastFailure?.message ?? null,
  );
  protected readonly lastFailureAt = computed(() =>
    time(this.importState()?.lastFailure?.attemptedAt),
  );
  protected readonly outage = computed(() => {
    const state = this.importState();
    return state?.reportedOutage ? FAILURE_LABELS[state.reportedOutage] : null;
  });
  protected readonly nextStep = computed(() => {
    const state = this.importState();
    return state?.reportedOutage ? NEXT_STEPS[state.reportedOutage] : null;
  });
  protected readonly neverAttempted = computed(
    () => this.state() === 'ready' && this.importState()?.lastAttemptedAt == null,
  );

  protected readonly importNeedsAttention = computed(
    () => this.state() === 'error' || this.outage() !== null || this.neverAttempted(),
  );
  protected readonly unpairedNeedsAttention = computed(
    () => this.unpairedState() === 'error' || (this.unpaired()?.count ?? 0) > 0,
  );
  protected readonly backupsNeedAttention = computed(
    () => this.backupsState() === 'error' || this.backupProblems().length > 0,
  );
  protected readonly backupKeyUnconfirmed = computed(() => {
    const key = this.backups()?.key;
    return key !== undefined && key.available && !key.confirmed;
  });
  protected readonly administratorsNeedAttention = computed(
    () => this.administratorsState() === 'error' || this.withoutSecondFactor().length > 0,
  );
  protected readonly signatoryNeedsAttention = computed(() =>
    ['error', 'missing', 'unsigned'].includes(this.signatoryState()),
  );
  protected readonly signingKeysNeedAttention = computed(
    () =>
      this.signingKeysState() === 'error' ||
      this.unpublishedSigningKeys().length > 0 ||
      this.signingKeyWarnings().length > 0,
  );
  protected readonly signingKeyWarningsText = computed(() => this.signingKeyWarnings().join(' '));
  protected readonly unpublishedSigningKeysText = computed(() =>
    unpublishedKeysSentence(this.unpublishedSigningKeys()),
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
  protected readonly needsAttention = computed(
    () =>
      this.importNeedsAttention() ||
      this.unpairedNeedsAttention() ||
      this.backupsNeedAttention() ||
      this.backupKeyUnconfirmed() ||
      this.administratorsNeedAttention() ||
      this.signingKeysNeedAttention() ||
      this.signatoryNeedsAttention(),
  );
  protected readonly unpairedText = computed(() => {
    const summary = this.unpaired();
    return summary === null ? '' : unpairedText(summary);
  });
  protected readonly withoutSecondFactorText = computed(() => {
    const names = this.withoutSecondFactor();
    const list = names.join(', ');
    return names.length === 1
      ? $localize`:@@admin.home.attention.secondFactor.one:Správce ${list}:names: nemá druhý faktor (kód z ověřovací aplikace ani přístupový klíč), správa se mu neotevře.`
      : $localize`:@@admin.home.attention.secondFactor.many:Správci bez druhého faktoru (kódu z ověřovací aplikace i přístupového klíče), kterým se správa neotevře: ${list}:names:.`;
  });
  protected readonly lastBackupTime = computed(() => {
    const run = this.backups()?.lastBackup;
    return run && run.outcome === 'OK' ? formatBankTime(run.finishedAt) : null;
  });
  protected readonly consecutiveFailures = computed(
    () => this.importState()?.consecutiveFailures ?? 0,
  );

  constructor() {
    this.loadSince();
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

  protected loadSince(): void {
    this.sinceState.set('loading');
    this.api
      .previousSignIn()
      .pipe(
        switchMap(({ previousSignInAt }) =>
          previousSignInAt === null
            ? of({ previousSignInAt, activity: null })
            : this.api
                .overviewSince(previousSignInAt)
                .pipe(map((activity) => ({ previousSignInAt, activity }))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (since) => {
          this.since.set(since);
          this.sinceState.set('ready');
        },
        error: () => this.sinceState.set('error'),
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

  protected changeYear(event: Event): void {
    this.loadOverview(Number((event.target as HTMLSelectElement).value));
  }

  protected monthLabel(isoMonth: string): string {
    return formatReportMonth(isoMonth);
  }

  protected amount(tally: TallyResponse): string {
    return `${formatMinorUnits(tally.totalMinor)}\u00a0Kč`;
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

const NONE = $localize`:@@admin.home.since.none:žádná`;

function crowns(tally: TallyResponse): string {
  return `${formatMinorUnits(tally.totalMinor)}\u00a0Kč`;
}

function leadWithPayments(at: string, payments: TallyResponse): string {
  const { count } = payments;
  const total = crowns(payments);
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.home.since.lead.one:Poslední přihlášení ${at}:time:. Od té doby přišla 1 platba za ${total}:total:.`;
    case 'few':
      return $localize`:@@admin.home.since.lead.few:Poslední přihlášení ${at}:time:. Od té doby přišly ${count}:count: platby za ${total}:total:.`;
    case 'other':
      return $localize`:@@admin.home.since.lead.many:Poslední přihlášení ${at}:time:. Od té doby přišlo ${count}:count: plateb za ${total}:total:.`;
  }
}

function paymentFigure(
  label: string,
  tally: TallyResponse,
  query: Record<string, string>,
): SinceFigure {
  return tally.count === 0
    ? { label, text: NONE, link: null, query: null }
    : { label, text: paymentsText(tally), link: '/sprava/platby', query };
}

function paymentsText(tally: TallyResponse): string {
  const { count } = tally;
  const total = crowns(tally);
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.home.since.payments.one:1 platba za ${total}:total:`;
    case 'few':
      return $localize`:@@admin.home.since.payments.few:${count}:count: platby za ${total}:total:`;
    case 'other':
      return $localize`:@@admin.home.since.payments.many:${count}:count: plateb za ${total}:total:`;
  }
}

function registrationsText(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.home.since.registrations.one:1 nová registrace`;
    case 'few':
      return $localize`:@@admin.home.since.registrations.few:${count}:count: nové registrace`;
    case 'other':
      return $localize`:@@admin.home.since.registrations.many:${count}:count: nových registrací`;
  }
}

function failedRun(run: BackupRunResponse): string {
  return $localize`:@@admin.home.backups.failed:selhala ${formatBankTime(run.finishedAt)}:time:`;
}

function time(isoInstant: string | null | undefined): string | null {
  return isoInstant ? formatBankTime(isoInstant) : null;
}

function unpairedText({ count, totalMinor }: UnpairedSummary): string {
  const total = `${formatMinorUnits(totalMinor)}\u00a0Kč`;
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.home.attention.unpaired.one:1 platba čeká na přiřazení dárci (${total}:total:).`;
    case 'few':
      return $localize`:@@admin.home.attention.unpaired.few:${count}:count: platby čekají na přiřazení dárci (${total}:total:).`;
    case 'other':
      return $localize`:@@admin.home.attention.unpaired.many:${count}:count: plateb čeká na přiřazení dárci (${total}:total:).`;
  }
}
