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
import { projectCategoryLabel } from '../../content/project-category';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { ProjectOrderCard } from './project-order-card';

type LoadState = 'loading' | 'ready' | 'error';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';

@Component({
  selector: 'app-admin-projects',
  imports: [RouterLink, LiveNotice, ProjectOrderCard],
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

  protected readonly categoryLabel = projectCategoryLabel;
  protected readonly state = signal<LoadState>('loading');
  protected readonly items = signal<ProjectResponse[]>([]);
  protected readonly notice = signal<Notice | null>(null);

  constructor() {
    const deleted: unknown = this.router.currentNavigation()?.extras.state?.['deleted'];
    if (typeof deleted === 'string') {
      this.notice.set({
        kind: 'status',
        text: $localize`:@@admin.projects.deleted:Projekt „${deleted}:title:“ jsme smazali.`,
      });
    }
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.fetch();
  }

  private fetch(): void {
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

  protected refresh(): void {
    this.fetch();
  }

  protected publishedOn(item: ProjectResponse): string | null {
    return item.publishedOn ? formatDonationDate(item.publishedOn) : null;
  }

  protected updatedAt(item: ProjectResponse): string {
    return formatBankTime(item.updatedAt);
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}
