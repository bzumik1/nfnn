import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, concat, EMPTY, filter, mergeMap, Observable, of } from 'rxjs';
import { mayComeFromServiceWorker, SERVICE_WORKER_BYPASS } from '../updates/service-worker-bypass';
import { Connectivity, FRESH_ANSWER_MS } from './connectivity';

const REFRESHED_CONTENT = /^\/api\/content\/(?:home|news|projects)(?:[/?]|$)/;

export const keptAnswerRefreshInterceptor: HttpInterceptorFn = (request, next) => {
  if (!REFRESHED_CONTENT.test(request.url) || !mayComeFromServiceWorker(request)) {
    return next(request);
  }
  const connectivity = inject(Connectivity);
  return next(request).pipe(
    mergeMap((event): Observable<HttpEvent<unknown>> => {
      if (!(event instanceof HttpResponse) || !keptAWhileAgo(event, connectivity)) {
        return of(event);
      }
      const fromServer = next(request.clone({ setHeaders: { [SERVICE_WORKER_BYPASS]: 'true' } }));
      return concat(
        of(event),
        fromServer.pipe(
          filter(
            (fresh): fresh is HttpResponse<unknown> =>
              fresh instanceof HttpResponse && saysSomethingElse(fresh, event),
          ),
          catchError(() => EMPTY),
        ),
      );
    }),
  );
};

function keptAWhileAgo(answer: HttpResponse<unknown>, connectivity: Connectivity): boolean {
  const writtenAt = Date.parse(answer.headers.get('Date') ?? '');
  return (
    !connectivity.offline() &&
    Number.isFinite(writtenAt) &&
    connectivity.serverNow() - writtenAt > FRESH_ANSWER_MS
  );
}

function saysSomethingElse(fresh: HttpResponse<unknown>, kept: HttpResponse<unknown>): boolean {
  return JSON.stringify(fresh.body) !== JSON.stringify(kept.body);
}
