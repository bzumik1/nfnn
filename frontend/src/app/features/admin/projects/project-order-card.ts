import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { describeProblem } from '../../../core/auth/api-problem';
import { DirtyForms } from '../../../core/updates/dirty-forms';
import { PROJECT_ORDERS, ProjectOrder, ProjectsApi } from '../../content/projects-api';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { projectOrderDescription, projectOrderLabel } from './project-order';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import { AdministrationPageReads } from '../device-copy/administration-page-reads';
import { reloadWhenOnlineAgain } from '../device-copy/online-again';

type LoadState = 'loading' | 'ready' | 'error' | 'offline';

@Component({
  selector: 'app-project-order-card',
  imports: [LiveNotice, NeedsConnection],
  templateUrl: './project-order-card.html',
  styleUrl: './project-order-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectOrderCard {
  private readonly api = inject(ProjectsApi);
  private readonly reads = inject(AdministrationPageReads);
  private readonly destroyRef = inject(DestroyRef);

  readonly changed = output<ProjectOrder>();

  protected readonly orders = PROJECT_ORDERS;
  protected readonly label = projectOrderLabel;
  protected readonly description = projectOrderDescription;
  protected readonly state = signal<LoadState>('loading');
  protected readonly chosen = signal<ProjectOrder | null>(null);
  private readonly saved = signal<ProjectOrder | null>(null);
  protected readonly saving = signal(false);
  protected readonly notice = signal<Notice | null>(null);
  private readonly onlineAgain = reloadWhenOnlineAgain(
    () => this.state() === 'offline',
    () => this.load(),
  );

  constructor() {
    this.load();
    const unregister = inject(DirtyForms).register(() => this.chosen() !== this.saved());
    this.destroyRef.onDestroy(unregister);
  }

  protected load(): void {
    this.state.set('loading');
    this.reads
      .projectOrder()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.chosen.set(response.order);
          this.saved.set(response.order);
          this.state.set('ready');
        },
        error: (failure: unknown) =>
          this.state.set(this.onlineAgain.unreachable(failure) ? 'offline' : 'error'),
      });
  }

  protected choose(order: ProjectOrder): void {
    this.chosen.set(order);
    this.notice.set(null);
  }

  protected save(event: Event): void {
    event.preventDefault();
    const order = this.chosen();
    if (this.saving() || order === null) {
      return;
    }
    this.saving.set(true);
    this.notice.set(null);
    this.api
      .changeOrder(order)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          this.chosen.set(response.order);
          this.saved.set(response.order);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.projects.order.saved:Řazení jsme uložili. Web už příběhy ukazuje v tomto pořadí.`,
          });
          this.changed.emit(response.order);
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.projects.order.failed:Řazení se nepodařilo uložit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }
}
