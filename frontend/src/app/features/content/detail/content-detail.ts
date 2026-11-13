import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { map, Observable, Subscription } from 'rxjs';
import { problemTypeEndsWith } from '../../../core/auth/api-problem';
import { whenLeft, whenShownAgain } from '../../../core/navigation/kept-tab-pages';
import { NewsApi } from '../news-api';
import { NOT_FOUND_TITLE, NotFound } from '../not-found/not-found';
import { ProjectsApi } from '../projects-api';
import { ContentArticle } from './content-article';
import { ContentKind, ContentPage, newsPage, projectPage } from './content-page';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

const SITE_NAME = $localize`:@@content.detail.siteName:Nová naděje – nadační fond`;

@Component({
  selector: 'app-content-detail',
  imports: [NeedsConnection, NotFound, ContentArticle],
  templateUrl: './content-detail.html',
  styleUrl: './content-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly newsApi = inject(NewsApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly titleService = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly article = viewChild(ContentArticle);

  protected readonly kind: ContentKind = this.route.snapshot.data['kind'] as ContentKind;
  protected readonly state = signal<LoadState>('loading');
  protected readonly page = signal<ContentPage | null>(null);
  private articleLoad = Subscription.EMPTY;

  constructor() {
    this.load();
    whenLeft(() => this.articleLoad.unsubscribe());
    whenShownAgain(() => {
      queueMicrotask(() => this.nameTabAfterPage());
      if (this.articleLoad.closed) {
        this.load(true);
      }
    });
    effect(() => {
      if (this.state() === 'ready') {
        afterNextRender(() => this.article()?.focusHeading(), { injector: this.injector });
      }
    });
  }

  protected retry(): void {
    this.load();
  }

  private nameTabAfterPage(): void {
    const page = this.page();
    if (this.state() === 'missing') {
      this.titleService.setTitle(NOT_FOUND_TITLE);
    } else if (page !== null) {
      this.titleService.setTitle(`${page.title} | ${SITE_NAME}`);
    }
  }

  private load(quietly = false): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.articleLoad.unsubscribe();
    if (!quietly) {
      this.state.set('loading');
    }
    this.articleLoad = this.fetch(slug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.page.set(page);
          queueMicrotask(() => this.nameTabAfterPage());
          this.state.set('ready');
          if (page.slug !== slug) {
            void this.router.navigate([page.backPath, page.slug], { replaceUrl: true });
          }
        },
        error: (failure: unknown) => {
          if (quietly && this.state() === 'ready') {
            return;
          }
          const missing =
            problemTypeEndsWith(failure, 'content/news-not-found') ||
            problemTypeEndsWith(failure, 'content/project-not-found');
          if (missing) {
            this.titleService.setTitle(NOT_FOUND_TITLE);
          }
          this.state.set(missing ? 'missing' : 'error');
        },
      });
  }

  private fetch(slug: string): Observable<ContentPage> {
    return this.kind === 'news'
      ? this.newsApi.publishedBySlug(slug).pipe(map(newsPage))
      : this.projectsApi.publishedBySlug(slug).pipe(map(projectPage));
  }
}
