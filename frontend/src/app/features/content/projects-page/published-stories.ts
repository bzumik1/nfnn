import { inject, Injectable, signal } from '@angular/core';
import { catchError, EMPTY, expand, forkJoin, Observable, of, reduce, tap } from 'rxjs';
import { NewsApi, NewsPageResponse } from '../news-api';
import { ProjectPageResponse, ProjectResponse, ProjectsApi } from '../projects-api';

export const STORIES_PAGE_SIZE = 50;
export const MAX_STORY_PAGES = 20;
export const LOOK_BACK_PAGE_SIZE = 50;

export interface LookBack {
  readonly year: number;
  readonly slug: string;
}

export interface PublishedStories {
  readonly projects: readonly ProjectResponse[];
  readonly lookBacks: readonly LookBack[];
}

@Injectable({ providedIn: 'root' })
export class PublishedStoriesStore {
  private readonly projectsApi = inject(ProjectsApi);
  private readonly newsApi = inject(NewsApi);
  private readonly kept = signal<PublishedStories | null>(null);

  readonly stories = this.kept.asReadonly();

  load(): Observable<PublishedStories> {
    return forkJoin({ projects: this.allProjects(), lookBacks: this.lookBacks() }).pipe(
      tap((stories) => this.kept.set(stories)),
    );
  }

  private allProjects(): Observable<ProjectResponse[]> {
    let index = 0;
    return this.projectsApi.published(index, STORIES_PAGE_SIZE).pipe(
      expand((page: ProjectPageResponse) => {
        index += 1;
        return page.hasMore && index < MAX_STORY_PAGES
          ? this.projectsApi.published(index, STORIES_PAGE_SIZE)
          : EMPTY;
      }),
      reduce((all: ProjectResponse[], page) => [...all, ...page.items], []),
    );
  }

  private lookBacks(): Observable<LookBack[]> {
    let index = 0;
    return this.newsApi.published(index, LOOK_BACK_PAGE_SIZE).pipe(
      expand((page: NewsPageResponse) => {
        index += 1;
        return page.hasMore && index < MAX_STORY_PAGES
          ? this.newsApi.published(index, LOOK_BACK_PAGE_SIZE)
          : EMPTY;
      }),
      reduce(
        (all: LookBack[], page) => [
          ...all,
          ...page.items.flatMap((article) =>
            typeof article.lookBackYear === 'number'
              ? [{ year: article.lookBackYear, slug: article.slug }]
              : [],
          ),
        ],
        [],
      ),
      catchError(() => of([])),
    );
  }
}
