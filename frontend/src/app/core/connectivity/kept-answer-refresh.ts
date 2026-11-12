import {
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import {
  catchError,
  concat,
  EMPTY,
  filter,
  mergeMap,
  Observable,
  of,
  throwError,
  timeout,
} from 'rxjs';
import { mayComeFromServiceWorker, SERVICE_WORKER_BYPASS } from '../updates/service-worker-bypass';
import { Connectivity, FRESH_ANSWER_MS } from './connectivity';

export const REFRESH_AFTER_KEPT_COPY = new HttpContextToken<boolean>(() => false);
export const REFRESH_WAIT_MS = 5_000;

export function refreshedAfterKeptCopy(): HttpContext {
  return new HttpContext().set(REFRESH_AFTER_KEPT_COPY, true);
}
export const OFFLINE_ANSWER_WAIT_MS = 1_500;

const REFRESHED_CONTENT = /^\/api\/content\/(?:home|news|projects)(?:[/?]|$)/;

export const keptAnswerRefreshInterceptor: HttpInterceptorFn = (request, next) => {
  if (!REFRESHED_CONTENT.test(request.url) || !mayComeFromServiceWorker(request)) {
    return next(request);
  }
  const connectivity = inject(Connectivity);
  const fromWorker = connectivity.offline()
    ? next(request).pipe(
        timeout({ each: OFFLINE_ANSWER_WAIT_MS, with: () => throwError(() => offline(request)) }),
      )
    : next(request);
  if (!request.context.get(REFRESH_AFTER_KEPT_COPY)) {
    return fromWorker;
  }
  return fromWorker.pipe(
    mergeMap((event): Observable<HttpEvent<unknown>> => {
      if (!(event instanceof HttpResponse) || !keptAWhileAgo(event, connectivity)) {
        return of(event);
      }
      const fromServer = next(request.clone({ setHeaders: { [SERVICE_WORKER_BYPASS]: 'true' } }));
      return concat(
        of(event),
        fromServer.pipe(
          timeout(REFRESH_WAIT_MS),
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

function offline(request: HttpRequest<unknown>): HttpErrorResponse {
  return new HttpErrorResponse({ status: 0, statusText: 'Offline', url: request.urlWithParams });
}

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
