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
import { Observable } from 'rxjs';
import { problemTypeEndsWith } from '../../../core/auth/api-problem';
import { NewsApi } from '../news-api';
import { NOT_FOUND_TITLE, NotFound } from '../not-found/not-found';
import { ProjectsApi } from '../projects-api';
import { ContentArticle } from './content-article';
import { ContentKind, ContentPage, newsPage, projectPage } from './content-page';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

const SITE_NAME = $localize`:@@content.detail.siteName:Nová naděje – nadační fond`;

@Component({
  selector: 'app-content-detail',
  imports: [NotFound, ContentArticle],
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

  constructor() {
    this.load();
    effect(() => {
      if (this.state() === 'ready') {
        afterNextRender(() => this.article()?.focusHeading(), { injector: this.injector });
      }
    });
  }

  protected retry(): void {
    this.load();
  }

  private load(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.state.set('loading');
    this.fetch(slug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.page.set(page);
          this.titleService.setTitle(`${page.title} | ${SITE_NAME}`);
          this.state.set('ready');
          if (page.slug !== slug) {
            void this.router.navigate([page.backPath, page.slug], { replaceUrl: true });
          }
        },
        error: (failure: unknown) => {
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
    if (this.kind === 'news') {
      return new Observable((subscriber) =>
        this.newsApi.publishedBySlug(slug).subscribe({
          next: (article) => {
            subscriber.next(newsPage(article));
            subscriber.complete();
          },
          error: (failure: unknown) => subscriber.error(failure),
        }),
      );
    }
    return new Observable((subscriber) =>
      this.projectsApi.publishedBySlug(slug).subscribe({
        next: (project) => {
          subscriber.next(projectPage(project));
          subscriber.complete();
        },
        error: (failure: unknown) => subscriber.error(failure),
      }),
    );
  }
}
