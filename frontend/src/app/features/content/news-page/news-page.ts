import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, EMPTY, expand, map, Observable, of, reduce, Subscription } from 'rxjs';
import { Connectivity } from '../../../core/navigation/connectivity';
import { canonicalAddress } from '../../../core/seo/canonical-link';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { FocalPointCrop } from '../../../shared/ui/focal-point/focal-point';
import { ShareButton } from '../../../shared/ui/share-button/share-button';
import { formatDonationDate } from '../../donations/donation-date';
import { mediaUrl, NewsApi, NewsArticleResponse } from '../news-api';
import { NewsCard } from '../news-card/news-card';
import { ProjectResponse, ProjectsApi } from '../projects-api';

export const PAGE_SIZE = 10;
export const PROJECTS_PAGE_SIZE = 50;
export const MAX_PROJECT_PAGES = 20;

const FEATURED_WIDTHS = [640, 960, 1440];
const STORY_WIDTH = 160;
const PORTRAIT_WIDTH = 160;

type LoadState = 'loading' | 'ready' | 'error';

interface NewsList {
  items: NewsArticleResponse[];
  total: number;
}

export interface YearStories {
  year: number;
  projects: ProjectResponse[];
}

@Component({
  selector: 'app-news-page',
  imports: [RouterLink, NewsCard, Avatar, ShareButton, FocalPointCrop],
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
  private loads = new Subscription();

  protected readonly state = signal<LoadState>('loading');
  protected readonly offline = signal(false);
  protected readonly pageNumber = signal(1);
  protected readonly list = signal<NewsList>({ items: [], total: 0 });
  protected readonly stories = signal<YearStories | null>(null);

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

  protected readonly featuredDate = computed(() => {
    const publishedOn = this.featured()?.publishedOn;
    return publishedOn ? formatDonationDate(publishedOn) : '';
  });
  protected readonly featuredImage = computed(() => {
    const cover = this.featured()?.coverImage;
    return cover ? mediaUrl(cover.id, FEATURED_WIDTHS[1]) : null;
  });
  protected readonly featuredImageSet = computed(() => {
    const cover = this.featured()?.coverImage;
    return cover
      ? FEATURED_WIDTHS.map((width) => `${mediaUrl(cover.id, width)} ${width}w`).join(', ')
      : null;
  });
  protected readonly featuredPortrait = computed(() => {
    const portrait = this.featured()?.signer?.portrait;
    return portrait ? mediaUrl(portrait.id, PORTRAIT_WIDTH) : null;
  });
  protected readonly featuredShareUrl = computed(() => {
    const featured = this.featured();
    return featured ? canonicalAddress(`/aktuality/${featured.slug}`) : '';
  });

  protected readonly pagesLabel = $localize`:@@content.news.pages:Stránky aktualit`;
  protected readonly storiesLabel = $localize`:@@content.news.stories.list:Příběhy roku`;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((query) => {
      this.pageNumber.set(pageFrom(query.get('strana')));
      this.load();
    });
    this.destroyRef.onDestroy(() => this.loads.unsubscribe());
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  protected retry(): void {
    this.load();
  }

  protected storyImage(item: ProjectResponse): string | null {
    return item.coverImage ? mediaUrl(item.coverImage.id, STORY_WIDTH) : null;
  }

  protected storyImageSet(item: ProjectResponse): string | null {
    return item.coverImage
      ? `${mediaUrl(item.coverImage.id, STORY_WIDTH)} 1x, ${mediaUrl(item.coverImage.id, STORY_WIDTH * 2)} 2x`
      : null;
  }

  private load(): void {
    this.loads.unsubscribe();
    this.loads = new Subscription();
    this.state.set('loading');
    this.loads.add(
      this.newsApi.published(this.pageNumber() - 1, PAGE_SIZE).subscribe({
        next: (page) => {
          this.list.set({ items: page.items, total: page.total });
          this.state.set('ready');
        },
        error: () => {
          this.offline.set(this.connectivity.isOffline());
          this.state.set('error');
        },
      }),
    );
    if (this.pageNumber() !== 1) {
      this.stories.set(null);
      return;
    }
    this.loads.add(
      this.publishedProjects()
        .pipe(
          map(storiesOfNewestYear),
          catchError(() => of(null)),
        )
        .subscribe((stories) => this.stories.set(stories)),
    );
  }

  private publishedProjects(): Observable<ProjectResponse[]> {
    return this.projectsApi.published(0, PROJECTS_PAGE_SIZE).pipe(
      expand((page) =>
        page.hasMore && page.page + 1 < MAX_PROJECT_PAGES
          ? this.projectsApi.published(page.page + 1, PROJECTS_PAGE_SIZE)
          : EMPTY,
      ),
      reduce((all, page) => [...all, ...page.items], [] as ProjectResponse[]),
    );
  }
}

export function storiesOfNewestYear(projects: ProjectResponse[]): YearStories | null {
  if (projects.length === 0) {
    return null;
  }
  const year = Math.max(...projects.map((item) => item.year));
  return { year, projects: projects.filter((item) => item.year === year) };
}

function pageFrom(value: string | null): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : 1;
}
