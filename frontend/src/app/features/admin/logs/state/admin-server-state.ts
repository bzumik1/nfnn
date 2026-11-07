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
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { formatBankTime } from '../../../donations/donation-date';
import { AdminApi, DiagnosticsResponse, DiskSpaceResponse } from '../../admin-api';
import { formatSize } from '../../backups/backup-format';
import { HealthIcon } from '../health-icon/health-icon';
import { LogPageAccess } from '../log-page-access';
import { formatShare, serverHealth, ServerHealthKind } from '../server-health';

type LoadState = 'loading' | 'ready' | 'error';

const LOAD = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });

@Component({
  selector: 'app-admin-server-state',
  imports: [NeedsConnection, HealthIcon],
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
  protected readonly refreshing = signal(false);
  protected readonly refreshFailed = signal(false);
  protected readonly diagnostics = signal<DiagnosticsResponse | null>(null);
  protected readonly health = computed(() => {
    const diagnostics = this.diagnostics();
    return diagnostics === null ? null : serverHealth(diagnostics);
  });

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus());
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .diagnostics()
      .pipe(takeUntilDestroyed(this.destroyRef))
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
