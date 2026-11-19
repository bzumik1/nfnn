import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, expand, map, Observable, reduce, Subscription, timeout } from 'rxjs';
import { DonateBand } from '../donate-band/donate-band';
import { DonateBandPhotoResponse } from '../donate-band-api';
import { FeaturedNews } from '../featured-news/featured-news';
import { HomeApi } from '../home-api';
import { NewsApi, NewsArticleResponse } from '../news-api';
import { NewsCard } from '../news-card/news-card';
import { ProjectResponse, ProjectsApi } from '../projects-api';
import { StoriesOfYear, storiesOfNewestYear, YearStories } from '../year-stories/year-stories';
import { whenShownAgain } from '../../../core/navigation/kept-tab-pages';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import { Reveal } from '../../../shared/ui/reveal/reveal';
import { NEWS_PAGE_SIZE, PROJECTS_PAGE_SIZE } from '../content-page-sizes';

export const PAGE_SIZE = NEWS_PAGE_SIZE;
export { PROJECTS_PAGE_SIZE };
export const MAX_PROJECT_PAGES = 20;
export const STORIES_WAIT_MS = 4000;
const LONGEST_STEP_IN_ROW = 3;
const LINE_NAMES = /\[[^\]]*\]/g;
const TRACK = /\d*\.?\d+px/g;

type LoadState = 'loading' | 'ready' | 'error';

interface NewsList {
  items: NewsArticleResponse[];
  total: number;
}

type StoriesState = { kind: 'loading' } | { kind: 'settled'; stories: StoriesOfYear | null };

@Component({
  selector: 'app-news-page',
  imports: [NeedsConnection, Reveal, RouterLink, NewsCard, FeaturedNews, YearStories, DonateBand],
  templateUrl: './news-page.html',
  styleUrl: './news-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly newsApi = inject(NewsApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');
  private readonly retryButton = viewChild<ElementRef<HTMLButtonElement>>('retryButton');
  private readonly listState = viewChild.required<ElementRef<HTMLElement>>('listState');
  private readonly olderGrid = viewChild<ElementRef<HTMLElement>>('olderGrid');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private loadingDelay: ReturnType<typeof setTimeout> | undefined;
  private newsLoad = Subscription.EMPTY;
  private projectsLoad = Subscription.EMPTY;
  private storiesKept = false;
  private focusAfterRetry = false;

  private readonly newsState = signal<LoadState>('loading');
  private readonly storiesState = signal<StoriesState>({ kind: 'loading' });
  protected readonly offline = signal(false);
  protected readonly loadingShown = signal(false);
  protected readonly reloaded = signal(false);
  protected readonly pageNumber = signal(1);
  protected readonly list = signal<NewsList>({ items: [], total: 0 });
  protected readonly bandPhoto = signal<DonateBandPhotoResponse | null>(null);
  protected readonly olderColumns = signal(1);

  protected readonly state = computed<LoadState>(() => {
    const news = this.newsState();
    if (news !== 'ready') {
      return news;
    }
    return this.pageNumber() === 1 && this.storiesState().kind === 'loading' ? 'loading' : 'ready';
  });
  protected readonly settledOnce = linkedSignal<LoadState, boolean>({
    source: this.state,
    computation: (state, before) => (before?.value ?? false) || state !== 'loading',
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
    whenShownAgain(() => {
      if (this.newsLoad.closed) {
        this.load(true);
      }
    });
    this.destroyRef.onDestroy(() => {
      this.newsLoad.unsubscribe();
      this.projectsLoad.unsubscribe();
      this.stopLoadingDelay();
    });
    inject(HomeApi)
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (home) => this.bandPhoto.set(home.donateBand?.photo ?? null),
        error: () => this.bandPhoto.set(null),
      });
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    afterRenderEffect((onCleanup) => {
      const grid = this.olderGrid()?.nativeElement;
      if (grid !== undefined) {
        onCleanup(this.watchOlderColumns(grid));
      }
    });
    effect(() => {
      if (this.state() !== 'loading') {
        this.stopLoadingDelay();
      }
    });
    effect(() => {
      const state = this.state();
      if (state === 'loading' || !this.focusAfterRetry) {
        return;
      }
      this.focusAfterRetry = false;
      afterNextRender(() => this.focusAfterRetryTarget(state), { injector: this.injector });
    });
  }

  protected retry(): void {
    this.focusAfterRetry = true;
    this.listState().nativeElement.focus();
    this.load();
  }

  private focusAfterRetryTarget(state: Exclude<LoadState, 'loading'>): void {
    if (state === 'error') {
      this.retryButton()?.nativeElement.focus();
      return;
    }
    const firstCard = this.host.nativeElement.querySelector<HTMLElement>(
      '.content :is(app-featured-news, app-news-card) a[href]',
    );
    (firstCard ?? this.listState().nativeElement).focus();
  }

  protected olderStep(index: number): number {
    return revealStepInRow(index, this.olderColumns());
  }

  private watchOlderColumns(grid: HTMLElement): () => void {
    const view = grid.ownerDocument.defaultView;
    if (view === null) {
      return () => undefined;
    }
    const measure = () =>
      this.olderColumns.set(gridColumnsOf(view.getComputedStyle(grid).gridTemplateColumns));
    measure();
    const observer = view.ResizeObserver ? new view.ResizeObserver(measure) : null;
    observer?.observe(grid);
    return () => observer?.disconnect();
  }

  private load(quietly = false): void {
    this.newsLoad.unsubscribe();
    const retried = this.focusAfterRetry;
    this.reloaded.set(false);
    if (!quietly) {
      this.newsState.set('loading');
      this.showLoadingAfterDelay();
    }
    this.newsLoad = this.newsApi.publishedWithLatest(this.pageNumber() - 1, PAGE_SIZE).subscribe({
      next: (page) => {
        this.list.set({ items: page.items, total: page.total });
        this.newsState.set('ready');
        this.reloaded.set(retried);
      },
      error: (failure: unknown) => {
        if (quietly && this.newsState() === 'ready') {
          return;
        }
        this.offline.set(failure instanceof HttpErrorResponse && failure.status === 0);
        this.newsState.set('error');
      },
    });
    if (this.pageNumber() === 1) {
      this.loadStories(quietly);
    }
  }

  private showLoadingAfterDelay(): void {
    this.stopLoadingDelay();
    const delay = this.loadingDelayMs();
    this.loadingShown.set(delay <= 0);
    if (delay <= 0) {
      return;
    }
    this.loadingDelay = setTimeout(() => {
      this.loadingDelay = undefined;
      if (this.state() === 'loading') {
        this.loadingShown.set(true);
      }
    }, delay);
  }

  private stopLoadingDelay(): void {
    clearTimeout(this.loadingDelay);
    this.loadingDelay = undefined;
  }

  private loadingDelayMs(): number {
    const token =
      this.document.defaultView
        ?.getComputedStyle(this.document.documentElement)
        .getPropertyValue('--delay-loading')
        .trim() ?? '';
    const value = Number.parseFloat(token);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return token.endsWith('ms') ? value : value * 1000;
  }

  private loadStories(quietly: boolean): void {
    if (this.storiesKept || !this.projectsLoad.closed) {
      return;
    }
    if (!quietly) {
      this.storiesState.set({ kind: 'loading' });
    }
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
    return this.projectsPage(0).pipe(
      expand((page) =>
        page.hasMore && page.page + 1 < MAX_PROJECT_PAGES
          ? this.projectsPage(page.page + 1)
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

  private projectsPage(index: number) {
    return this.projectsApi.published(index, PROJECTS_PAGE_SIZE);
  }
}

export function gridColumnsOf(trackList: string): number {
  return Math.max(1, trackList.replace(LINE_NAMES, ' ').match(TRACK)?.length ?? 0);
}

export function revealStepInRow(index: number, columns: number): number {
  return columns <= 1 ? 0 : Math.min((index % columns) + 1, LONGEST_STEP_IN_ROW);
}

function pageFrom(value: string | null): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : 1;
}
