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
import { finalize, map, Observable, of, Subscription } from 'rxjs';
import { problemTypeEndsWith } from '../../../core/auth/api-problem';
import { whenLeft, whenShownAgain } from '../../../core/navigation/kept-tab-pages';
import { NewsApi, NewsArticleResponse } from '../news-api';
import { NewsCard } from '../news-card/news-card';
import { NOT_FOUND_TITLE, NotFound } from '../not-found/not-found';
import { PublishedStoriesStore } from '../projects-page/published-stories';
import { StoryTile } from '../projects-page/story-tile';
import { ProjectResponse, ProjectsApi } from '../projects-api';
import { ContentArticle } from './content-article';
import { ContentKind, ContentPage, newsPage, projectPage } from './content-page';
import { BusyButton } from '../../../shared/ui/busy-button/busy-button';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

type Onward =
  | { readonly kind: 'news'; readonly items: readonly NewsArticleResponse[] }
  | { readonly kind: 'project'; readonly year: number; readonly items: readonly ProjectResponse[] };

const ONWARD_COUNT = 3;

const SITE_NAME = $localize`:@@content.detail.siteName:Nová naděje – nadační fond`;

@Component({
  selector: 'app-content-detail',
  imports: [NeedsConnection, BusyButton, NotFound, ContentArticle, NewsCard, StoryTile],
  templateUrl: './content-detail.html',
  styleUrl: './content-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly newsApi = inject(NewsApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly publishedStories = inject(PublishedStoriesStore);
  private readonly titleService = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly article = viewChild(ContentArticle);

  protected readonly kind: ContentKind = this.route.snapshot.data['kind'] as ContentKind;
  protected readonly state = signal<LoadState>('loading');
  protected readonly retrying = signal(false);
  protected readonly page = signal<ContentPage | null>(null);
  protected readonly onward = signal<Onward | null>(null);
  private articleLoad = Subscription.EMPTY;
  private onwardLoad = Subscription.EMPTY;

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
    this.retrying.set(true);
    this.load(true);
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
      .pipe(
        finalize(() => this.retrying.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.page.set(page);
          queueMicrotask(() => this.nameTabAfterPage());
          this.state.set('ready');
          this.loadOnward(page);
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

  private loadOnward(page: ContentPage): void {
    this.onwardLoad.unsubscribe();
    this.onwardLoad = this.fetchOnward(page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (onward) => this.onward.set(onward.items.length > 0 ? onward : null),
        error: () => this.onward.set(null),
      });
  }

  private fetchOnward(page: ContentPage): Observable<Onward> {
    if (this.kind === 'news') {
      return this.newsApi.published(0, ONWARD_COUNT + 1).pipe(
        map((list) => ({
          kind: 'news' as const,
          items: list.items.filter((item) => item.slug !== page.slug).slice(0, ONWARD_COUNT),
        })),
      );
    }
    const year = page.year ?? 0;
    const kept = this.publishedStories.stories();
    return (kept ? of(kept) : this.publishedStories.load()).pipe(
      map((stories) => ({
        kind: 'project' as const,
        year,
        items: stories.projects
          .filter((item) => item.year === year && item.slug !== page.slug)
          .slice(0, ONWARD_COUNT),
      })),
    );
  }

  private fetch(slug: string): Observable<ContentPage> {
    return this.kind === 'news'
      ? this.newsApi.publishedBySlug(slug).pipe(map(newsPage))
      : this.projectsApi.publishedBySlug(slug).pipe(map(projectPage));
  }
}
