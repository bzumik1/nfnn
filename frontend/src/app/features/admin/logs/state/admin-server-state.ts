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
import { finalize } from 'rxjs';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { LoadFailure } from '../../../../shared/ui/load-failure/load-failure';
import { loadingView } from '../../../../shared/ui/skeleton/loading-view';
import { Skeleton } from '../../../../shared/ui/skeleton/skeleton';
import { formatBankTime } from '../../../donations/donation-date';
import { AdminApi, DiagnosticsResponse, DiskSpaceResponse, ReleaseResponse } from '../../admin-api';
import { formatSize } from '../../backups/backup-format';
import { HealthIcon } from '../health-icon/health-icon';
import { LogPageAccess } from '../log-page-access';
import { formatShare, serverHealth, ServerHealthKind } from '../server-health';
import { BusyLabel } from '../../../../shared/ui/busy-label/busy-label';
import { Disclosure } from '../../../../shared/ui/disclosure/disclosure';
import { ReleaseHistory } from './release-history/release-history';

type LoadState = 'loading' | 'ready' | 'error';

const LOAD = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });
const RELEASES = 'https://github.com/bzumik1/nfnn/releases/tag/';
const AFTER_DOT = /(?<=\.)(?=.)/;

@Component({
  selector: 'app-admin-server-state',
  imports: [
    BusyLabel,
    Skeleton,
    LoadFailure,
    NeedsConnection,
    HealthIcon,
    Disclosure,
    ReleaseHistory,
  ],
  templateUrl: './admin-server-state.html',
  styleUrl: './admin-server-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminServerState {
  private readonly api = inject(AdminApi);
  private readonly access = inject(LogPageAccess);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadView = loadingView(this.state, (state) => state === 'loading');
  protected readonly retrying = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly refreshFailed = signal(false);
  protected readonly diagnostics = signal<DiagnosticsResponse | null>(null);
  protected readonly health = computed(() => {
    const diagnostics = this.diagnostics();
    return diagnostics === null ? null : serverHealth(diagnostics);
  });
  protected readonly release = signal<ReleaseResponse | null>(null);
  protected readonly releaseMeta = computed(() => {
    const release = this.release();
    return release === null ? '' : `${latestPart(release)}${checkPart(release)}`;
  });
  protected readonly historyShown = signal(false);

  constructor() {
    this.load();
    this.loadRelease();
    afterNextRender(() => this.title().nativeElement.focus());
  }

  private load(): void {
    this.state.set('loading');
    this.fetch();
  }

  protected retry(): void {
    this.retrying.set(true);
    this.fetch();
  }

  private fetch(): void {
    this.api
      .diagnostics()
      .pipe(
        finalize(() => this.retrying.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (diagnostics) => {
          this.diagnostics.set(diagnostics);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (!this.access.leavesOn(failure)) {
            this.state.set('error');
          }
        },
      });
  }

  protected toggleHistory(): void {
    this.historyShown.update((shown) => !shown);
  }

  protected releaseParts(version: string): string[] {
    return version.split(AFTER_DOT);
  }

  protected releaseLink(version: string): string {
    return `${RELEASES}${version}`;
  }

  private loadRelease(): void {
    this.api
      .release()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (release) => this.release.set(release),
        error: () => this.release.set(null),
      });
  }

  protected refresh(): void {
    this.refreshing.set(true);
    this.refreshFailed.set(false);
    this.api
      .diagnostics()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (diagnostics) => {
          this.diagnostics.set(diagnostics);
          this.refreshing.set(false);
        },
        error: (failure: unknown) => {
          this.refreshing.set(false);
          if (!this.access.leavesOn(failure)) {
            this.refreshFailed.set(true);
          }
        },
      });
  }

  protected verdict(kind: ServerHealthKind): string {
    switch (kind) {
      case 'ok':
        return $localize`:@@admin.logs.health.ok:Bez poruchy`;
      case 'attention':
        return $localize`:@@admin.logs.health.attention:Něco potřebuje pozornost`;
      case 'failure':
        return $localize`:@@admin.logs.health.failure:Porucha`;
    }
  }

  protected time(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }

  protected size(bytes: number): string {
    return formatSize(bytes);
  }

  protected heapShare(diagnostics: DiagnosticsResponse): string {
    const { heapUsedBytes, heapMaxBytes } = diagnostics.jvm;
    return heapMaxBytes > 0 ? formatShare(heapUsedBytes / heapMaxBytes) : '–';
  }

  protected freeShare(disk: DiskSpaceResponse): string {
    return disk.totalBytes > 0 ? formatShare(disk.freeBytes / disk.totalBytes) : '–';
  }

  protected loadAverage(average: number): string {
    return average < 0 ? '–' : LOAD.format(average);
  }
}

function latestPart({ running, latest, updateAvailable }: ReleaseResponse): string {
  if (latest === null) {
    return $localize`:@@admin.logs.state.release.unknown:nejnovější vydání zatím neznáme`;
  }
  if (updateAvailable) {
    return $localize`:@@admin.logs.state.release.newer:novější ${latest.version}:version: z\u00a0${formatBankTime(latest.publishedAt)}:publishedAt:`;
  }
  return latest.version === running
    ? $localize`:@@admin.logs.state.release.latest:nejnovější`
    : $localize`:@@admin.logs.state.release.latestIs:nejnovější vydání ${latest.version}:version:`;
}

function checkPart({ checkedAt, failure }: ReleaseResponse): string {
  if (checkedAt === null) {
    return '';
  }
  return failure === null
    ? $localize`:@@admin.logs.state.release.checked:, ověřeno ${formatBankTime(checkedAt)}:checkedAt:`
    : $localize`:@@admin.logs.state.release.checkFailed:, ověřit se nepodařilo ${formatBankTime(checkedAt)}:checkedAt:`;
}
