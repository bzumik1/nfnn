import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { ProjectsApi, ProjectResponse } from '../../content/projects-api';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { DashboardTopBar } from '../../donors/dashboard/top-bar/top-bar';

type LoadState = 'loading' | 'ready' | 'error';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';

@Component({
  selector: 'app-admin-projects',
  imports: [DashboardTopBar, RouterLink],
  templateUrl: './admin-projects.html',
  styleUrl: './admin-projects.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProjects {
  private readonly api = inject(ProjectsApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly state = signal<LoadState>('loading');
  protected readonly items = signal<ProjectResponse[]>([]);

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.items.set(list.items);
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

  protected publishedOn(item: ProjectResponse): string | null {
    return item.publishedOn ? formatDonationDate(item.publishedOn) : null;
  }

  protected updatedAt(item: ProjectResponse): string {
    return formatBankTime(item.updatedAt);
  }

  private sendToSignIn(): void {
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open();
    });
  }
}
