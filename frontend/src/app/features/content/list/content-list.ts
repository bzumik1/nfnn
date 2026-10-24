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
import { Observable } from 'rxjs';
import { ContentKind } from '../detail/content-detail';
import { NewsApi, NewsArticleResponse } from '../news-api';
import { NewsCard } from '../news-card/news-card';
import { ProjectCard } from '../home/sections/projects/project-card';
import { ProjectResponse, ProjectsApi } from '../projects-api';

export const PAGE_SIZE = 10;

type LoadState = 'loading' | 'ready' | 'error';

interface ListPage {
  news: NewsArticleResponse[];
  projects: ProjectResponse[];
  total: number;
}

@Component({
  selector: 'app-content-list',
  imports: [RouterLink, NewsCard, ProjectCard],
  templateUrl: './content-list.html',
  styleUrl: './content-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentList {
  private readonly route = inject(ActivatedRoute);
  private readonly newsApi = inject(NewsApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');

  protected readonly kind: ContentKind = this.route.snapshot.data['kind'] as ContentKind;
  protected readonly basePath = this.kind === 'news' ? '/aktuality' : '/projekty';
  protected readonly state = signal<LoadState>('loading');
  protected readonly pageNumber = signal(1);
  protected readonly list = signal<ListPage>({ news: [], projects: [], total: 0 });
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.list().total / PAGE_SIZE)),
  );
  protected readonly empty = computed(
    () => this.list().news.length === 0 && this.list().projects.length === 0,
  );
  protected readonly pastLastPage = computed(() => this.empty() && this.list().total > 0);
  protected readonly newerQuery = computed(() => {
    const previous = this.pageNumber() - 1;
    return previous > 1 ? { strana: previous } : {};
  });
  protected readonly olderQuery = computed(() => ({ strana: this.pageNumber() + 1 }));
  protected readonly newsPagesLabel = $localize`:@@content.list.news.pages:Stránky aktualit`;
  protected readonly projectPagesLabel = $localize`:@@content.list.projects.pages:Stránky projektů`;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((query) => {
      this.pageNumber.set(pageFrom(query.get('strana')));
      this.load();
    });
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  protected retry(): void {
    this.load();
  }

  private load(): void {
    this.state.set('loading');
    this.fetch(this.pageNumber() - 1)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.list.set(list);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }

  private fetch(pageIndex: number): Observable<ListPage> {
    return new Observable((subscriber) => {
      const done = {
        error: (failure: unknown) => subscriber.error(failure),
      };
      if (this.kind === 'news') {
        return this.newsApi.published(pageIndex, PAGE_SIZE).subscribe({
          ...done,
          next: (page) => {
            subscriber.next({ news: page.items, projects: [], total: page.total });
            subscriber.complete();
          },
        });
      }
      return this.projectsApi.published(pageIndex, PAGE_SIZE).subscribe({
        ...done,
        next: (page) => {
          subscriber.next({ news: [], projects: page.items, total: page.total });
          subscriber.complete();
        },
      });
    });
  }
}

function pageFrom(value: string | null): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : 1;
}
