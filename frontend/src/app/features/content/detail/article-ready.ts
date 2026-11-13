import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { from, map, Observable, race, take, timer } from 'rxjs';
import { NewsApi } from '../news-api';
import { ProjectsApi } from '../projects-api';

export const ARTICLE_WAIT_MS = 300;

export const articleReady: ResolveFn<true> = (route) => {
  const slug = route.paramMap.get('slug') ?? '';
  const answer: Observable<unknown> =
    route.data['kind'] === 'news'
      ? inject(NewsApi).publishedBySlug(slug)
      : inject(ProjectsApi).publishedBySlug(slug);
  const settled = new Promise<void>((done) =>
    answer.subscribe({ complete: done, error: () => done() }),
  );
  return race(from(settled), timer(ARTICLE_WAIT_MS)).pipe(
    take(1),
    map(() => true as const),
  );
};
