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
import { CopyButton } from '../../../../shared/ui/copy-button/copy-button';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { AdminApi } from '../../admin-api';
import { LogPageAccess } from '../log-page-access';
import { threadStates } from './thread-states';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-admin-thread-dump',
  imports: [CopyButton, NeedsConnection],
  templateUrl: './admin-thread-dump.html',
  styleUrl: './admin-thread-dump.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminThreadDump {
  private readonly api = inject(AdminApi);
  private readonly access = inject(LogPageAccess);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly state = signal<LoadState>('loading');
  protected readonly dump = signal('');
  protected readonly states = computed(() => threadStates(this.dump()));
  protected readonly total = computed(() =>
    this.states().reduce((sum, entry) => sum + entry.count, 0),
  );

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus());
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .threadDump()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (dump) => {
          this.dump.set(dump);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (!this.access.leavesOn(failure)) {
            this.state.set('error');
          }
        },
      });
  }
}
