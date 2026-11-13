import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { from, map, Observable, of, race, take, timer } from 'rxjs';
import { Connectivity } from '../../../core/connectivity/connectivity';
import { refreshedAfterKeptCopy } from '../../../core/connectivity/kept-answer-refresh';
import { askedAhead } from '../../../core/navigation/kept-public-answers';
import { NewsApi } from '../news-api';
import { ProjectsApi } from '../projects-api';

export const ARTICLE_WAIT_MS = 300;

export const articleReady: ResolveFn<true> = (route) => {
  const slug = route.paramMap.get('slug') ?? '';
  const context = askedAhead(refreshedAfterKeptCopy());
  const answer: Observable<unknown> =
    route.data['kind'] === 'news'
      ? inject(NewsApi).publishedBySlug(slug, context)
      : inject(ProjectsApi).publishedBySlug(slug, context);
  if (inject(Connectivity).offline()) {
    return of(true as const);
  }
  const settled = new Promise<void>((done) =>
    answer.subscribe({ next: () => done(), complete: done, error: () => done() }),
  );
  return race(from(settled), timer(ARTICLE_WAIT_MS)).pipe(
    take(1),
    map(() => true as const),
  );
};
