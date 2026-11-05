import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, expand, map, Observable, reduce, Subscription, timeout } from 'rxjs';
import { Connectivity } from '../../../core/navigation/connectivity';
import { DonateBand } from '../donate-band/donate-band';
import { DonateBandPhotoResponse } from '../donate-band-api';
import { FeaturedNews } from '../featured-news/featured-news';
import { HomeApi } from '../home-api';
import { NewsApi, NewsArticleResponse } from '../news-api';
import { NewsCard } from '../news-card/news-card';
import { ProjectResponse, ProjectsApi } from '../projects-api';
import { StoriesOfYear, storiesOfNewestYear, YearStories } from '../year-stories/year-stories';

export const PAGE_SIZE = 10;
export const PROJECTS_PAGE_SIZE = 50;
export const MAX_PROJECT_PAGES = 20;
export const STORIES_WAIT_MS = 4000;

type LoadState = 'loading' | 'ready' | 'error';

interface NewsList {
  items: NewsArticleResponse[];
  total: number;
}

type StoriesState = { kind: 'loading' } | { kind: 'settled'; stories: StoriesOfYear | null };

@Component({
  selector: 'app-news-page',
  imports: [RouterLink, NewsCard, FeaturedNews, YearStories, DonateBand],
  templateUrl: './news-page.html',
  styleUrl: './news-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly newsApi = inject(NewsApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly connectivity = inject(Connectivity);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');
  private readonly retryButton = viewChild<ElementRef<HTMLButtonElement>>('retryButton');
  private newsLoad = Subscription.EMPTY;
  private projectsLoad = Subscription.EMPTY;
  private storiesKept = false;
  private focusAfterRetry = false;

  private readonly newsState = signal<LoadState>('loading');
  private readonly storiesState = signal<StoriesState>({ kind: 'loading' });
  protected readonly offline = signal(false);
  protected readonly pageNumber = signal(1);
  protected readonly list = signal<NewsList>({ items: [], total: 0 });
  protected readonly bandPhoto = signal<DonateBandPhotoResponse | null>(null);

  protected readonly state = computed<LoadState>(() => {
    const news = this.newsState();
    if (news !== 'ready') {
      return news;
    }
    return this.pageNumber() === 1 && this.storiesState().kind === 'loading' ? 'loading' : 'ready';
  });
  protected readonly stories = computed(() => {
    const stories = this.storiesState();
    return this.pageNumber() === 1 && stories.kind === 'settled' ? stories.stories : null;
  });
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.list().total / PAGE_SIZE)),
  );
  protected readonly empty = computed(() => this.list().items.length === 0);
  protected readonly pastLastPage = computed(() => this.empty() && this.list().total > 0);
  protected readonly featured = computed(() =>
    this.pageNumber() === 1 ? (this.list().items[0] ?? null) : null,
  );
  protected readonly older = computed(() =>
    this.pageNumber() === 1 ? this.list().items.slice(1) : this.list().items,
  );
  protected readonly newerQuery = computed(() => {
    const previous = this.pageNumber() - 1;
    return previous > 1 ? { strana: previous } : {};
  });
  protected readonly olderQuery = computed(() => ({ strana: this.pageNumber() + 1 }));

  protected readonly pagesLabel = $localize`:@@content.list.news.pages:Stránky aktualit`;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((query) => {
      this.pageNumber.set(pageFrom(query.get('strana')));
      this.load();
    });
    this.destroyRef.onDestroy(() => {
      this.newsLoad.unsubscribe();
      this.projectsLoad.unsubscribe();
    });
    inject(HomeApi)
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (home) => this.bandPhoto.set(home.donateBand?.photo ?? null),
        error: () => this.bandPhoto.set(null),
      });
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    effect(() => {
      const state = this.state();
      if (state === 'loading' || !this.focusAfterRetry) {
        return;
      }
      this.focusAfterRetry = false;
      afterNextRender(
        () => (state === 'error' ? this.retryButton() : this.heading())?.nativeElement.focus(),
        { injector: this.injector },
      );
    });
  }

  protected retry(): void {
    this.focusAfterRetry = true;
    this.load();
  }

  private load(): void {
    this.newsLoad.unsubscribe();
    this.newsState.set('loading');
    this.newsLoad = this.newsApi.published(this.pageNumber() - 1, PAGE_SIZE).subscribe({
      next: (page) => {
        this.list.set({ items: page.items, total: page.total });
        this.newsState.set('ready');
      },
      error: () => {
        this.offline.set(this.connectivity.isOffline());
        this.newsState.set('error');
      },
    });
    if (this.pageNumber() === 1) {
      this.loadStories();
    }
  }

  private loadStories(): void {
    if (this.storiesKept || !this.projectsLoad.closed) {
      return;
    }
    this.storiesState.set({ kind: 'loading' });
    this.projectsLoad = this.publishedProjects()
      .pipe(timeout({ first: STORIES_WAIT_MS }), map(storiesOfNewestYear))
      .subscribe({
        next: (stories) => {
          this.storiesKept = true;
          this.storiesState.set({ kind: 'settled', stories });
        },
        error: () => this.storiesState.set({ kind: 'settled', stories: null }),
      });
  }

  private publishedProjects(): Observable<ProjectResponse[]> {
    return this.projectsApi.published(0, PROJECTS_PAGE_SIZE).pipe(
      expand((page) =>
        page.hasMore && page.page + 1 < MAX_PROJECT_PAGES
          ? this.projectsApi.published(page.page + 1, PROJECTS_PAGE_SIZE)
          : EMPTY,
      ),
      reduce((all, page) => {
        for (const item of page.items) {
          all.set(item.id, all.get(item.id) ?? item);
        }
        return all;
      }, new Map<string, ProjectResponse>()),
      map((all) => [...all.values()]),
    );
  }
}

function pageFrom(value: string | null): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : 1;
}
