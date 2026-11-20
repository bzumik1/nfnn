import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NeedsConnection } from '../../../../../shared/ui/needs-connection/needs-connection';
import { formatBankTime } from '../../../../donations/donation-date';
import { AdminApi, ReleaseRunResponse } from '../../../admin-api';
import { LogPageAccess } from '../../log-page-access';

type LoadState = 'loading' | 'ready' | 'error';

const RELEASES = 'https://github.com/bzumik1/nfnn/releases/tag/';

@Component({
  selector: 'app-release-history',
  imports: [NeedsConnection],
  templateUrl: './release-history.html',
  styleUrl: './release-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseHistory {
  private readonly api = inject(AdminApi);
  private readonly access = inject(LogPageAccess);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<LoadState>('loading');
  protected readonly entries = signal<readonly ReleaseRunResponse[]>([]);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .releaseHistory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (history) => {
          this.entries.set(history.entries);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (!this.access.leavesOn(failure)) {
            this.state.set('error');
          }
        },
      });
  }

  protected time(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }

  protected restarted(entry: ReleaseRunResponse): boolean {
    return entry.lastStartedAt !== entry.startedAt;
  }

  protected notesLink(release: string): string {
    return `${RELEASES}${release}`;
  }
}
